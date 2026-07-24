"""OpenFace spaces-runner.

FastAPI service that builds & runs Gradio "Space" repos as Docker containers
and reverse-proxies traffic to them. Mounted by the gateway as:

    /runner-api/  -> this app's /api/
    /run/         -> this app's /  (HTTP + WebSocket)

Mutating management calls are accepted only from the OpenFace frontend, which
checks the caller's Forgejo repository permission before forwarding them.
"""
from __future__ import annotations

import asyncio
import logging
import mimetypes
import secrets
from contextlib import asynccontextmanager
from pathlib import PurePosixPath

from fastapi import FastAPI, Header, HTTPException, Request, WebSocket
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

import config
import agent_metrics
import forgejo
import proxy
import spaces

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("spaces-runner")


@asynccontextmanager
async def lifespan(app: FastAPI):
    agent_metrics.initialize()
    try:
        spaces.adopt_running_containers()
    except Exception as exc:  # noqa: BLE001 - docker may not be reachable yet
        logger.warning("could not adopt running containers at startup: %s", exc)
    reaper_task = asyncio.create_task(spaces.reap_idle_loop())
    try:
        yield
    finally:
        reaper_task.cancel()


app = FastAPI(title="OpenFace spaces-runner", lifespan=lifespan)


class RepoMetricsTarget(BaseModel):
    owner: str = Field(min_length=1, max_length=100)
    repo: str = Field(min_length=1, max_length=100)


class RepoMetricsBatchRequest(BaseModel):
    repos: list[RepoMetricsTarget] = Field(max_length=48)


class KnowledgeMetricsTarget(BaseModel):
    owner: str = Field(min_length=1, max_length=100)
    repo: str = Field(min_length=1, max_length=100)
    slug: str = Field(min_length=1, max_length=180)


class KnowledgeMetricsBatchRequest(BaseModel):
    items: list[KnowledgeMetricsTarget] = Field(max_length=200)


def authenticated_agent(authorization: str | None):
    prefix = "Bearer "
    api_key = authorization[len(prefix):].strip() if authorization and authorization.startswith(prefix) else None
    agent = agent_metrics.authenticate(api_key)
    if not agent:
        raise HTTPException(status_code=401, detail="A valid agent Bearer token is required")
    return agent


def require_frontend_control(control_token: str | None) -> None:
    """Reject browser-direct runner mutations.

    The Forgejo admin token is shared read-only with the frontend and runner;
    it is never sent to a browser. The frontend uses it only after verifying
    the signed-in Forgejo user's push permission for the target repository.
    """
    expected = config.read_forgejo_token()
    if not expected or not control_token or not secrets.compare_digest(control_token, expected):
        raise HTTPException(status_code=403, detail="Space control must be authorized by OpenFace")


async def verify_repo(owner: str, repo: str) -> None:
    try:
        await forgejo.get_repo_info(owner, repo, config.read_forgejo_token())
    except forgejo.ForgejoError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Management API (mounted at /runner-api/ -> here at /api/)
# ---------------------------------------------------------------------------

@app.post("/api/spaces/{owner}/{repo}/start")
async def api_start_space(
    owner: str,
    repo: str,
    x_openface_control_token: str | None = Header(default=None),
):
    require_frontend_control(x_openface_control_token)
    token = config.read_forgejo_token()
    try:
        await forgejo.verify_space_repo(owner, repo, token)
    except forgejo.ForgejoError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    result = await asyncio.to_thread(spaces.start_space, owner, repo, token)
    return result


@app.get("/api/spaces/{owner}/{repo}/status")
async def api_space_status(owner: str, repo: str):
    return await asyncio.to_thread(spaces.get_status, owner, repo)


@app.post("/api/spaces/{owner}/{repo}/stop")
async def api_stop_space(
    owner: str,
    repo: str,
    x_openface_control_token: str | None = Header(default=None),
):
    require_frontend_control(x_openface_control_token)
    return await asyncio.to_thread(spaces.stop_space, owner, repo)


@app.get("/api/spaces")
async def api_list_spaces():
    return await asyncio.to_thread(spaces.list_spaces)


# ---------------------------------------------------------------------------
# OpenFace Pages — static sites sourced from public Forgejo repositories
# ---------------------------------------------------------------------------

async def serve_pages_asset(owner: str, repo: str, asset_path: str):
    safe_path = asset_path or "index.html"
    path = PurePosixPath(safe_path)
    if path.is_absolute() or ".." in path.parts:
        raise HTTPException(status_code=404, detail="Pages asset not found")
    try:
        source = await forgejo.get_pages_source(owner, repo, config.read_forgejo_token())
    except forgejo.ForgejoError as exc:
        raise HTTPException(status_code=404, detail="Pages site not found") from exc
    if not source:
        raise HTTPException(status_code=404, detail="Pages site not found")
    status, content, upstream_type = await forgejo.fetch_pages_asset(
        owner, repo, source[0], source[1], str(path), config.read_forgejo_token()
    )
    if status != 200:
        raise HTTPException(status_code=404, detail="Pages asset not found")
    guessed_type = mimetypes.guess_type(str(path))[0]
    # Forgejo's raw endpoint commonly labels static text as text/plain. Pages
    # must prefer the extension-derived MIME type so browsers execute CSS and
    # JavaScript and render HTML rather than displaying its source.
    generic_upstream_type = not upstream_type or upstream_type.startswith("text/plain") or upstream_type.startswith("application/octet-stream")
    media_type = guessed_type if generic_upstream_type else upstream_type
    media_type = media_type or "application/octet-stream"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=60", "X-OpenFace-Pages": "1"},
    )


@app.get("/api/pages/{owner}/{repo}")
async def api_pages_index(owner: str, repo: str):
    return await serve_pages_asset(owner, repo, "index.html")


@app.get("/api/pages/{owner}/{repo}/{asset_path:path}")
async def api_pages_asset(owner: str, repo: str, asset_path: str):
    return await serve_pages_asset(owner, repo, asset_path)


# ---------------------------------------------------------------------------
# Agent interaction API
# ---------------------------------------------------------------------------

@app.get("/api/agents")
async def api_list_agents():
    """Public agent profiles. API keys are never returned."""
    return await asyncio.to_thread(agent_metrics.list_agents)


@app.post("/api/metrics/repos/batch")
async def api_repo_metrics_batch(payload: RepoMetricsBatchRequest):
    targets = [(target.owner, target.repo) for target in payload.repos]
    return await asyncio.to_thread(agent_metrics.metrics_batch, targets)


@app.get("/api/metrics/repos/{owner}/{repo}")
async def api_repo_metrics(owner: str, repo: str):
    return await asyncio.to_thread(agent_metrics.metrics, owner, repo)


@app.post("/api/metrics/repos/{owner}/{repo}/views")
async def api_browser_view(
    owner: str,
    repo: str,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    """Record a real browser visit. One detail-page load supplies one stable key."""
    await verify_repo(owner, repo)
    if not idempotency_key:
        raise HTTPException(status_code=400, detail="Idempotency-Key is required")
    if len(idempotency_key) > 200:
        raise HTTPException(status_code=400, detail="Idempotency-Key must be 200 characters or fewer")
    created, result = await asyncio.to_thread(
        agent_metrics.record_browser_view, owner, repo, idempotency_key
    )
    return {"ok": True, "created": created, "source": "browser", "metrics": result}


@app.post("/api/metrics/knowledge/batch")
async def api_knowledge_metrics_batch(payload: KnowledgeMetricsBatchRequest):
    targets = [(item.owner, item.repo, item.slug) for item in payload.items]
    return await asyncio.to_thread(agent_metrics.knowledge_metrics_batch, targets)


@app.get("/api/metrics/knowledge/{owner}/{repo}/{slug}")
async def api_knowledge_metrics(owner: str, repo: str, slug: str):
    return await asyncio.to_thread(agent_metrics.knowledge_metrics, owner, repo, slug)


@app.post("/api/metrics/knowledge/{owner}/{repo}/{slug}/views")
async def api_knowledge_browser_view(
    owner: str,
    repo: str,
    slug: str,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    await verify_repo(owner, repo)
    if not idempotency_key:
        raise HTTPException(status_code=400, detail="Idempotency-Key is required")
    if len(idempotency_key) > 200:
        raise HTTPException(status_code=400, detail="Idempotency-Key must be 200 characters or fewer")
    created, result = await asyncio.to_thread(
        agent_metrics.record_knowledge_view, owner, repo, slug, idempotency_key
    )
    return {"ok": True, "created": created, "source": "browser", "metrics": result}


@app.post("/api/agent/v1/repos/{owner}/{repo}/views")
async def api_agent_view(
    owner: str,
    repo: str,
    authorization: str | None = Header(default=None),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    agent = authenticated_agent(authorization)
    await verify_repo(owner, repo)
    if idempotency_key and len(idempotency_key) > 200:
        raise HTTPException(status_code=400, detail="Idempotency-Key must be 200 characters or fewer")
    created, result = await asyncio.to_thread(
        agent_metrics.record_view, agent["id"], owner, repo, idempotency_key
    )
    return {"ok": True, "created": created, "agent": agent["slug"], "metrics": result}


@app.put("/api/agent/v1/repos/{owner}/{repo}/like")
async def api_agent_like(
    owner: str,
    repo: str,
    authorization: str | None = Header(default=None),
):
    agent = authenticated_agent(authorization)
    await verify_repo(owner, repo)
    changed, result = await asyncio.to_thread(agent_metrics.set_like, agent["id"], owner, repo, True)
    return {"ok": True, "changed": changed, "liked": True, "agent": agent["slug"], "metrics": result}


@app.delete("/api/agent/v1/repos/{owner}/{repo}/like")
async def api_agent_unlike(
    owner: str,
    repo: str,
    authorization: str | None = Header(default=None),
):
    agent = authenticated_agent(authorization)
    await verify_repo(owner, repo)
    changed, result = await asyncio.to_thread(agent_metrics.set_like, agent["id"], owner, repo, False)
    return {"ok": True, "changed": changed, "liked": False, "agent": agent["slug"], "metrics": result}


# ---------------------------------------------------------------------------
# Reverse proxy (mounted at /run/ -> here at /)
# ---------------------------------------------------------------------------

@app.websocket("/{owner}/{repo}/{path:path}")
async def ws_proxy(websocket: WebSocket, owner: str, repo: str, path: str):
    await proxy.proxy_websocket(websocket, owner, repo, path)


@app.websocket("/{owner}/{repo}")
async def ws_proxy_root(websocket: WebSocket, owner: str, repo: str):
    await proxy.proxy_websocket(websocket, owner, repo, "")


@app.api_route(
    "/{owner}/{repo}/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
)
async def http_proxy(request: Request, owner: str, repo: str, path: str = ""):
    return await proxy.proxy_http(request, owner, repo, path)


@app.api_route(
    "/{owner}/{repo}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
)
async def http_proxy_root(request: Request, owner: str, repo: str):
    return await proxy.proxy_http(request, owner, repo, "")


@app.get("/healthz")
async def healthz():
    try:
        database_ok = await asyncio.to_thread(agent_metrics.database_ready)
    except Exception:
        database_ok = False
    return JSONResponse(
        {"status": "ok" if database_ok else "degraded", "database": database_ok},
        status_code=200 if database_ok else 503,
    )
