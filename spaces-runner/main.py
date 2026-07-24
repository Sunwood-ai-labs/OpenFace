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
import gpu_control
import proxy
import spaces

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("spaces-runner")


@asynccontextmanager
async def lifespan(app: FastAPI):
    agent_metrics.initialize()
    gpu_control.initialize()
    try:
        spaces.adopt_running_containers()
    except Exception as exc:  # noqa: BLE001 - docker may not be reachable yet
        logger.warning("could not adopt running containers at startup: %s", exc)
    reaper_task = asyncio.create_task(spaces.reap_idle_loop())
    gpu_reaper_task = asyncio.create_task(gpu_reap_loop())
    try:
        yield
    finally:
        reaper_task.cancel()
        gpu_reaper_task.cancel()


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


class EnrollmentTokenRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    ttl_minutes: int = Field(default=15, ge=1, le=1440)


class WorkerEnrollRequest(BaseModel):
    token: str = Field(min_length=20, max_length=300)


class WorkerRegistrationRequest(BaseModel):
    capabilities: dict = Field(default_factory=dict)
    max_jobs: int = Field(default=1, ge=1, le=16)


class WorkerHeartbeatRequest(BaseModel):
    capabilities: dict = Field(default_factory=dict)
    running_jobs: int = Field(default=0, ge=0, le=16)


class WorkerEventRequest(BaseModel):
    kind: str = Field(min_length=1, max_length=40)
    details: dict = Field(default_factory=dict)


class GpuJobRequest(BaseModel):
    owner: str = Field(min_length=1, max_length=100)
    repo: str = Field(min_length=1, max_length=100)
    revision: str = Field(min_length=7, max_length=64)
    requirements: dict = Field(default_factory=lambda: {"gpu": True})


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
    expected = config.CONTROL_TOKEN or config.read_forgejo_token()
    if not expected or not control_token or not secrets.compare_digest(control_token, expected):
        raise HTTPException(status_code=403, detail="Space control must be authorized by OpenFace")


def authenticated_worker(authorization: str | None):
    prefix = "Bearer "
    credential = (
        authorization[len(prefix):].strip()
        if authorization and authorization.startswith(prefix)
        else None
    )
    worker = gpu_control.authenticate(credential or "")
    if not worker:
        raise HTTPException(status_code=401, detail="A valid worker Bearer credential is required")
    return worker


async def gpu_reap_loop() -> None:
    while True:
        await asyncio.sleep(30)
        await asyncio.to_thread(gpu_control.reap_expired)


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
        topics = await forgejo.get_repo_topics(owner, repo, token)
    except forgejo.ForgejoError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if config.GPU_WORKERS_ENABLED and "gpu" in topics:
        revision = await forgejo.get_default_revision(owner, repo, token)
        minimum_vram = 0
        for topic in topics:
            if topic.startswith("vram-") and topic.endswith("gb"):
                try:
                    minimum_vram = int(topic[5:-2]) * 1024
                except ValueError:
                    pass
        job = await asyncio.to_thread(
            gpu_control.enqueue_job,
            owner,
            repo,
            revision,
            {
                "gpu": True,
                "min_vram_mb": minimum_vram,
                "features": ["nvidia"] if "nvidia" in topics or "cuda" in topics else [],
            },
        )
        return {
            "status": job["status"],
            "execution": "remote-gpu",
            "job_id": str(job["id"]),
            "revision": revision,
        }

    result = await asyncio.to_thread(spaces.start_space, owner, repo, token)
    result["execution"] = "local-cpu"
    return result


@app.get("/api/spaces/{owner}/{repo}/status")
async def api_space_status(owner: str, repo: str):
    if config.GPU_WORKERS_ENABLED:
        job = await asyncio.to_thread(gpu_control.get_repo_job, owner, repo)
        if job and job["status"] not in ("completed", "cancelled"):
            result = {
                "status": job["status"],
                "execution": "remote-gpu",
                "job_id": str(job["id"]),
                "worker_id": str(job["worker_id"]) if job["worker_id"] else None,
                "error": job["error"],
            }
            if job["status"] == "running":
                result["url"] = f"/run/{owner}/{repo}/"
            return result
    return await asyncio.to_thread(spaces.get_status, owner, repo)


@app.post("/api/spaces/{owner}/{repo}/stop")
async def api_stop_space(
    owner: str,
    repo: str,
    x_openface_control_token: str | None = Header(default=None),
):
    require_frontend_control(x_openface_control_token)
    if config.GPU_WORKERS_ENABLED:
        job = await asyncio.to_thread(gpu_control.cancel_repo_job, owner, repo)
        if job:
            return {
                "status": job["status"],
                "execution": "remote-gpu",
                "job_id": str(job["id"]),
            }
    return await asyncio.to_thread(spaces.stop_space, owner, repo)


@app.get("/api/spaces")
async def api_list_spaces():
    return await asyncio.to_thread(spaces.list_spaces)


# ---------------------------------------------------------------------------
# Remote GPU worker control plane
# ---------------------------------------------------------------------------

@app.post("/api/v1/workers/enrollment-tokens")
async def api_issue_worker_enrollment(
    payload: EnrollmentTokenRequest,
    x_openface_control_token: str | None = Header(default=None),
):
    require_frontend_control(x_openface_control_token)
    return await asyncio.to_thread(
        gpu_control.issue_enrollment_token, payload.name, payload.ttl_minutes
    )


@app.post("/api/v1/workers/enroll")
async def api_enroll_worker(payload: WorkerEnrollRequest):
    result = await asyncio.to_thread(gpu_control.enroll, payload.token)
    if not result:
        raise HTTPException(status_code=401, detail="Enrollment token is invalid, expired, or used")
    return result


@app.post("/api/v1/workers/register")
async def api_register_worker(
    payload: WorkerRegistrationRequest,
    authorization: str | None = Header(default=None),
):
    worker = authenticated_worker(authorization)
    result = await asyncio.to_thread(
        gpu_control.register, str(worker["id"]), payload.capabilities, payload.max_jobs
    )
    return {"worker_id": str(result["id"]), "status": result["status"]}


@app.post("/api/v1/workers/{worker_id}/heartbeat")
async def api_worker_heartbeat(
    worker_id: str,
    payload: WorkerHeartbeatRequest,
    authorization: str | None = Header(default=None),
):
    worker = authenticated_worker(authorization)
    if str(worker["id"]) != worker_id:
        raise HTTPException(status_code=403, detail="Worker identity does not match credential")
    return await asyncio.to_thread(
        gpu_control.heartbeat, worker_id, payload.capabilities, payload.running_jobs
    )


@app.post("/api/v1/workers/{worker_id}/jobs/claim")
async def api_claim_worker_job(
    worker_id: str,
    authorization: str | None = Header(default=None),
):
    worker = authenticated_worker(authorization)
    if str(worker["id"]) != worker_id:
        raise HTTPException(status_code=403, detail="Worker identity does not match credential")
    job = await asyncio.to_thread(gpu_control.claim_job, worker)
    if not job:
        return Response(status_code=204)
    return {
        "id": str(job["id"]),
        "owner": job["owner"],
        "repo": job["repo"],
        "revision": job["revision"],
        "requirements": job["requirements"],
        "clone_url": f"{config.PUBLIC_BASE_URL.rstrip('/')}/git/{job['owner']}/{job['repo']}.git",
        "lease_expires_at": job["lease_expires_at"],
    }


@app.post("/api/v1/workers/{worker_id}/jobs/{job_id}/events")
async def api_worker_job_event(
    worker_id: str,
    job_id: str,
    payload: WorkerEventRequest,
    authorization: str | None = Header(default=None),
):
    worker = authenticated_worker(authorization)
    if str(worker["id"]) != worker_id:
        raise HTTPException(status_code=403, detail="Worker identity does not match credential")
    result = await asyncio.to_thread(
        gpu_control.record_event, worker_id, job_id, payload.kind, payload.details
    )
    if not result:
        raise HTTPException(status_code=404, detail="Job is not assigned to this worker")
    return {"job_id": job_id, "status": result["status"]}


@app.post("/api/v1/workers/{worker_id}/jobs/{job_id}/lease")
async def api_worker_job_lease(
    worker_id: str,
    job_id: str,
    authorization: str | None = Header(default=None),
):
    worker = authenticated_worker(authorization)
    if str(worker["id"]) != worker_id:
        raise HTTPException(status_code=403, detail="Worker identity does not match credential")
    result = await asyncio.to_thread(gpu_control.renew_lease, worker_id, job_id)
    if not result:
        raise HTTPException(status_code=409, detail="Job lease is no longer renewable")
    return result


@app.get("/api/v1/workers")
async def api_list_gpu_workers(
    x_openface_control_token: str | None = Header(default=None),
):
    require_frontend_control(x_openface_control_token)
    return await asyncio.to_thread(gpu_control.list_workers)


@app.post("/api/v1/gpu/jobs")
async def api_enqueue_gpu_job(
    payload: GpuJobRequest,
    x_openface_control_token: str | None = Header(default=None),
):
    """Administrative enqueue endpoint used by schedulers and diagnostics."""
    require_frontend_control(x_openface_control_token)
    job = await asyncio.to_thread(
        gpu_control.enqueue_job,
        payload.owner,
        payload.repo,
        payload.revision,
        payload.requirements,
    )
    return {
        "id": str(job["id"]),
        "status": job["status"],
        "owner": job["owner"],
        "repo": job["repo"],
        "revision": job["revision"],
    }


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
