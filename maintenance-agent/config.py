from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _integer(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    forgejo_api: str
    forgejo_git_base: str
    forgejo_token_file: Path
    webhook_secret_file: Path
    openwebui_config_file: Path
    openwebui_base_url: str
    openwebui_api_key: str
    model: str
    data_dir: Path
    workspace_dir: Path
    allowed_owner: str
    max_files: int
    max_changed_lines: int
    max_file_bytes: int
    request_timeout_seconds: int

    @classmethod
    def load(cls) -> "Settings":
        config_file = Path(os.getenv("OPEN_WEBUI_CONFIG_FILE", "/run/secrets/openwebui.env"))
        openwebui = _read_env_file(config_file)
        return cls(
            forgejo_api=os.getenv("FORGEJO_API", "http://forgejo:3000/api/v1").rstrip("/"),
            forgejo_git_base=os.getenv("FORGEJO_GIT_BASE", "http://forgejo:3000").rstrip("/"),
            forgejo_token_file=Path(os.getenv("FORGEJO_TOKEN_FILE", "/shared/maintenance-token")),
            webhook_secret_file=Path(os.getenv("WEBHOOK_SECRET_FILE", "/shared/maintenance-webhook-secret")),
            openwebui_config_file=config_file,
            openwebui_base_url=os.getenv(
                "OPEN_WEBUI_BASE_URL",
                openwebui.get("OPEN_WEBUI_BASE_URL", "http://host.docker.internal:3000"),
            ).rstrip("/"),
            openwebui_api_key=os.getenv("OPEN_WEBUI_API_KEY", openwebui.get("OPEN_WEBUI_API_KEY", "")),
            model=os.getenv("OPEN_WEBUI_MODEL", openwebui.get("OPEN_WEBUI_DEFAULT_MODEL", "glm-4.7")),
            data_dir=Path(os.getenv("MAINTENANCE_DATA_DIR", "/data")),
            workspace_dir=Path(os.getenv("MAINTENANCE_WORKSPACE_DIR", "/work")),
            allowed_owner=os.getenv("MAINTENANCE_ALLOWED_OWNER", "openface"),
            max_files=_integer("MAINTENANCE_MAX_FILES", 6),
            max_changed_lines=_integer("MAINTENANCE_MAX_CHANGED_LINES", 800),
            max_file_bytes=_integer("MAINTENANCE_MAX_FILE_BYTES", 131_072),
            request_timeout_seconds=_integer("MAINTENANCE_LLM_TIMEOUT_SECONDS", 300),
        )

    def read_forgejo_token(self) -> str:
        return self.forgejo_token_file.read_text(encoding="utf-8").strip()

    def read_webhook_secret(self) -> str:
        return self.webhook_secret_file.read_text(encoding="utf-8").strip()

    def readiness(self) -> dict[str, bool]:
        return {
            "forgejo_token": self.forgejo_token_file.is_file() and self.forgejo_token_file.stat().st_size > 0,
            "webhook_secret": self.webhook_secret_file.is_file() and self.webhook_secret_file.stat().st_size > 0,
            "openwebui_api_key": bool(self.openwebui_api_key),
        }

