"""Environment-driven configuration for the spaces-runner service.

Contract (fixed by PLAN.md, do not rename):
    FORGEJO_API        e.g. http://forgejo:3000/api/v1
    FORGEJO_TOKEN_FILE e.g. /shared/token
    PUBLIC_BASE_URL    e.g. http://localhost:8090
    DOCKER_NETWORK     e.g. openface
"""
from __future__ import annotations

import os

FORGEJO_API: str = os.environ.get("FORGEJO_API", "http://forgejo:3000/api/v1").rstrip("/")
FORGEJO_TOKEN_FILE: str = os.environ.get("FORGEJO_TOKEN_FILE", "/shared/token")
PUBLIC_BASE_URL: str = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8090")
DOCKER_NETWORK: str = os.environ.get("DOCKER_NETWORK", "openface")
# 0 disables automatic suspension. CPU-only imported Spaces are intended to
# remain available like ordinary local services.
IDLE_TIMEOUT_MINUTES: int = int(os.environ.get("IDLE_TIMEOUT_MINUTES", "0"))
MAX_RUNNING_SPACES: int = max(1, int(os.environ.get("MAX_RUNNING_SPACES", "24")))
# Private repository content must stay inside Forgejo's native access-control
# boundary. The runner only serves public Spaces unless this is explicitly
# enabled in a separately isolated deployment.
ALLOW_PRIVATE_SPACES: bool = os.environ.get("OPENFACE_ALLOW_PRIVATE_SPACES", "false").lower() == "true"

# Derived: forgejo host:port for git clone URLs (http://forgejo:3000/...)
FORGEJO_GIT_BASE: str = FORGEJO_API.split("/api/")[0].rstrip("/")

SPACE_LABEL_KEY = "openface.space"
SPACE_LABEL_VALUE = "1"
OWNER_LABEL_KEY = "openface.owner"
REPO_LABEL_KEY = "openface.repo"

CONTAINER_PORT = 7860
MEMORY_LIMIT = "2g"

REAPER_INTERVAL_SECONDS = 60

AGENT_DATA_DIR: str = os.environ.get("AGENT_DATA_DIR", "/data/agents")
AGENT_DB_PATH: str = os.path.join(AGENT_DATA_DIR, "metrics.sqlite3")
AGENT_CREDENTIALS_FILE: str = os.path.join(AGENT_DATA_DIR, "credentials.json")


def read_forgejo_token() -> str | None:
    """Read the Forgejo API token, if the shared token file is present.

    Returns None (anonymous mode) when the file is missing or empty, which
    is a valid state (e.g. before `seed` has finished, or for pure public
    repo access).
    """
    try:
        with open(FORGEJO_TOKEN_FILE, "r", encoding="utf-8") as fh:
            token = fh.read().strip()
        return token or None
    except OSError:
        return None
