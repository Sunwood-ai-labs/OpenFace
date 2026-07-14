"""Space lifecycle management: clone, build, run, stop, status, list.

Docker access is lazy: importing this module (and the whole app) must not
require a reachable Docker daemon. The client is only created on first use,
so `python -m py_compile` / plain imports work in sandboxes without
/var/run/docker.sock.
"""
from __future__ import annotations

import asyncio
import json
import re
import shutil
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

import docker
from docker.errors import NotFound, APIError

import config
import forgejo

_docker_client: "docker.DockerClient | None" = None
_docker_lock = threading.Lock()


def get_docker_client() -> docker.DockerClient:
    global _docker_client
    if _docker_client is None:
        with _docker_lock:
            if _docker_client is None:
                _docker_client = docker.from_env()
    return _docker_client


def sanitize(value: str) -> str:
    """Lowercase and strip anything that isn't alnum/-/_ for use in docker names/tags."""
    value = value.lower()
    value = re.sub(r"[^a-z0-9_.-]", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "x"


def container_name(owner: str, repo: str) -> str:
    return f"openface-space-{sanitize(owner)}-{sanitize(repo)}"


def image_tag(owner: str, repo: str) -> str:
    return f"openface-space-{sanitize(owner)}-{sanitize(repo)}:latest"


@dataclass
class SpaceState:
    status: str = "stopped"  # stopped | building | running | error
    error: str | None = None
    last_access: float = field(default_factory=time.time)
    lock: threading.Lock = field(default_factory=threading.Lock)


class SpaceRegistry:
    """In-memory state tracker for spaces this process has touched."""

    def __init__(self) -> None:
        self._states: dict[tuple[str, str], SpaceState] = {}
        self._guard = threading.Lock()

    def get(self, owner: str, repo: str) -> SpaceState:
        key = (owner, repo)
        with self._guard:
            if key not in self._states:
                self._states[key] = SpaceState()
            return self._states[key]

    def touch(self, owner: str, repo: str) -> None:
        self.get(owner, repo).last_access = time.time()

    def all_keys(self) -> list[tuple[str, str]]:
        with self._guard:
            return list(self._states.keys())


registry = SpaceRegistry()

DEFAULT_DOCKERFILE = """\
FROM python:3.10-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg git libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
COPY . .
RUN pip install --no-cache-dir -r requirements.txt \\
    && (python -c "import gradio" 2>/dev/null || pip install --no-cache-dir gradio)
RUN {gradio_install}
ENV GRADIO_SERVER_NAME=0.0.0.0
ENV GRADIO_ROOT_PATH=/run/{owner}/{repo}
EXPOSE 7860
CMD ["python", {app_file}]
"""


def _run(cmd: list[str], cwd: str | None = None, timeout: int = 300) -> None:
    proc = subprocess.run(
        cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"command {' '.join(cmd)} failed (rc={proc.returncode}):\n{proc.stderr[-4000:]}"
        )


def _clone_repo(owner: str, repo: str, token: str | None, dest: str) -> None:
    url = forgejo.clone_url(owner, repo, token)
    try:
        _run(["git", "clone", "--depth", "1", url, dest], timeout=300)
    except RuntimeError:
        if token:
            # fall back to anonymous clone for public repos where token auth
            # itself might be the problem (e.g. revoked token, LAN quirks).
            anon_url = forgejo.clone_url(owner, repo, None)
            _run(["git", "clone", "--depth", "1", anon_url, dest], timeout=300)
        else:
            raise


def _ensure_dockerfile(build_dir: str, owner: str, repo: str) -> None:
    dockerfile_path = Path(build_dir) / "Dockerfile"
    if dockerfile_path.exists():
        return
    requirements_path = Path(build_dir) / "requirements.txt"
    if not requirements_path.exists():
        requirements_path.write_text("gradio\n", encoding="utf-8")
    app_file = "app.py"
    sdk_version: str | None = None
    readme_path = Path(build_dir) / "README.md"
    if readme_path.exists():
        readme = readme_path.read_text(encoding="utf-8", errors="replace")[:12000]
        app_match = re.search(r"(?m)^app_file:\s*['\"]?([^'\"\r\n]+)", readme)
        version_match = re.search(
            r"(?m)^sdk_version:\s*['\"]?([0-9][0-9A-Za-z_.-]*)", readme
        )
        if app_match:
            candidate = app_match.group(1).strip()
            if re.fullmatch(r"[A-Za-z0-9_./-]+\.py", candidate) and ".." not in candidate:
                app_file = candidate
        if version_match:
            sdk_version = version_match.group(1)

    if sdk_version:
        major = int(sdk_version.split(".", 1)[0])
        if major <= 3:
            web_stack = "'pydantic<2' 'fastapi==0.95.2' 'starlette==0.27.0'"
        elif major == 4:
            web_stack = "'pydantic<2.11' 'fastapi==0.112.4' 'starlette==0.38.6'"
        else:
            web_stack = "'pydantic<2.11' 'fastapi==0.115.6' 'starlette==0.41.3'"
        gradio_install = (
            "pip install --no-cache-dir 'huggingface_hub<1.0' "
            f"{web_stack} 'gradio=={sdk_version}'"
        )
    else:
        gradio_install = "true"
    content = DEFAULT_DOCKERFILE.format(
        owner=sanitize(owner),
        repo=sanitize(repo),
        gradio_install=gradio_install,
        app_file=json.dumps(app_file),
    )
    dockerfile_path.write_text(content, encoding="utf-8")


def _build_and_run(owner: str, repo: str, token: str | None) -> None:
    state = registry.get(owner, repo)
    build_dir = tempfile.mkdtemp(prefix="openface-space-build-")
    try:
        state.status = "building"
        state.error = None

        clone_target = str(Path(build_dir) / "src")
        _clone_repo(owner, repo, token, clone_target)
        _ensure_dockerfile(clone_target, owner, repo)

        client = get_docker_client()
        tag = image_tag(owner, repo)
        name = container_name(owner, repo)

        # Remove any stale container with the same name first.
        try:
            old = client.containers.get(name)
            old.remove(force=True)
        except NotFound:
            pass

        client.images.build(path=clone_target, tag=tag, rm=True, forcerm=True)

        client.containers.run(
            tag,
            name=name,
            detach=True,
            network=config.DOCKER_NETWORK,
            labels={
                config.SPACE_LABEL_KEY: config.SPACE_LABEL_VALUE,
                config.OWNER_LABEL_KEY: owner,
                config.REPO_LABEL_KEY: repo,
            },
            mem_limit=config.MEMORY_LIMIT,
            restart_policy={"Name": "unless-stopped"},
        )

        state.status = "running"
        state.error = None
        state.last_access = time.time()
    except Exception as exc:  # noqa: BLE001 - surfaced via status endpoint
        state.status = "error"
        state.error = str(exc)[-2000:]
    finally:
        shutil.rmtree(build_dir, ignore_errors=True)


def start_space(owner: str, repo: str, token: str | None) -> dict:
    state = registry.get(owner, repo)

    # If already running (per docker, source of truth), report it.
    live_status = probe_container_status(owner, repo)
    if live_status == "running":
        state.status = "running"
        state.error = None
        return {"status": "running", "url": f"/run/{owner}/{repo}/"}

    if state.status == "building":
        return {"status": "building"}

    thread = threading.Thread(
        target=_build_and_run, args=(owner, repo, token), daemon=True
    )
    state.status = "building"
    state.error = None
    thread.start()
    return {"status": "building"}


def probe_container_status(owner: str, repo: str) -> str:
    """Ask docker directly for the container's real state."""
    try:
        client = get_docker_client()
        container = client.containers.get(container_name(owner, repo))
        if container.status == "running":
            return "running"
        return "stopped"
    except NotFound:
        return "stopped"
    except Exception:  # noqa: BLE001 - docker unreachable etc.
        return "stopped"


def get_status(owner: str, repo: str) -> dict:
    state = registry.get(owner, repo)
    if state.status == "building":
        return {"status": "building"}
    if state.status == "error":
        return {"status": "error", "error": state.error}

    live = probe_container_status(owner, repo)
    if live == "running":
        state.status = "running"
        return {"status": "running", "url": f"/run/{owner}/{repo}/"}

    state.status = "stopped"
    return {"status": "stopped"}


def stop_space(owner: str, repo: str) -> dict:
    state = registry.get(owner, repo)
    try:
        client = get_docker_client()
        container = client.containers.get(container_name(owner, repo))
        container.stop(timeout=10)
        container.remove(force=True)
    except NotFound:
        pass
    except APIError as exc:
        state.status = "error"
        state.error = str(exc)
        return {"status": "error", "error": state.error}
    state.status = "stopped"
    state.error = None
    return {"status": "stopped"}


def list_spaces() -> list[dict]:
    try:
        client = get_docker_client()
    except Exception:  # noqa: BLE001
        return []
    containers = client.containers.list(
        all=True, filters={"label": f"{config.SPACE_LABEL_KEY}={config.SPACE_LABEL_VALUE}"}
    )
    result = []
    for c in containers:
        owner = c.labels.get(config.OWNER_LABEL_KEY, "?")
        repo = c.labels.get(config.REPO_LABEL_KEY, "?")
        result.append(
            {
                "owner": owner,
                "repo": repo,
                "status": "running" if c.status == "running" else "stopped",
                "container": c.name,
            }
        )
    return result


def adopt_running_containers() -> None:
    """On startup, sync in-memory state with already-running labeled containers."""
    for item in list_spaces():
        state = registry.get(item["owner"], item["repo"])
        state.status = item["status"]
        state.last_access = time.time()


async def reap_idle_loop() -> None:
    """Background task: stop containers that have been idle too long."""
    if config.IDLE_TIMEOUT_MINUTES <= 0:
        return
    timeout_seconds = config.IDLE_TIMEOUT_MINUTES * 60
    while True:
        await asyncio.sleep(config.REAPER_INTERVAL_SECONDS)
        now = time.time()
        for owner, repo in registry.all_keys():
            state = registry.get(owner, repo)
            if state.status != "running":
                continue
            if now - state.last_access < timeout_seconds:
                continue
            await asyncio.to_thread(stop_space, owner, repo)
