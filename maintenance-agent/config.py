from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


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
    zai_base_url: str
    zai_api_key: str
    model: str
    data_dir: Path
    workspace_dir: Path
    allowed_owner: str
    claude_user: str
    goal_timeout_seconds: int
    max_workers: int
    agent_token_dir: Path

    @classmethod
    def load(cls) -> "Settings":
        return cls(
            forgejo_api=os.getenv("FORGEJO_API", "http://forgejo:3000/api/v1").rstrip("/"),
            forgejo_git_base=os.getenv("FORGEJO_GIT_BASE", "http://forgejo:3000").rstrip("/"),
            forgejo_token_file=Path(os.getenv("FORGEJO_TOKEN_FILE", "/shared/maintenance-token")),
            webhook_secret_file=Path(os.getenv("WEBHOOK_SECRET_FILE", "/shared/maintenance-webhook-secret")),
            zai_base_url=os.getenv("ZAI_ANTHROPIC_BASE_URL", "https://api.z.ai/api/anthropic").rstrip("/"),
            zai_api_key=os.getenv("ZAI_API_KEY", ""),
            model=os.getenv("MAINTENANCE_MODEL", "glm-5.2"),
            data_dir=Path(os.getenv("MAINTENANCE_DATA_DIR", "/data")),
            workspace_dir=Path(os.getenv("MAINTENANCE_WORKSPACE_DIR", "/work")),
            allowed_owner=os.getenv("MAINTENANCE_ALLOWED_OWNER", "openface"),
            claude_user=os.getenv("MAINTENANCE_CLAUDE_USER", "maintainer"),
            goal_timeout_seconds=_integer("MAINTENANCE_GOAL_TIMEOUT_SECONDS", 3600),
            max_workers=max(1, min(_integer("MAINTENANCE_MAX_WORKERS", 2), 4)),
            agent_token_dir=Path(os.getenv("MAINTENANCE_AGENT_TOKEN_DIR", "/shared/agent-tokens")),
        )

    def agent_token_file(self, username: str) -> Path:
        return self.agent_token_dir / username

    def read_forgejo_token(self) -> str:
        return self.forgejo_token_file.read_text(encoding="utf-8").strip()

    def read_webhook_secret(self) -> str:
        return self.webhook_secret_file.read_text(encoding="utf-8").strip()

    def claude_environment(self) -> dict[str, str]:
        home = f"/home/{self.claude_user}"
        return {
            "PATH": os.environ.get("PATH", ""),
            "HOME": home,
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
            "ANTHROPIC_BASE_URL": self.zai_base_url,
            "ANTHROPIC_AUTH_TOKEN": self.zai_api_key,
            "ANTHROPIC_MODEL": self.model,
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-4.5-air",
            "ANTHROPIC_DEFAULT_SONNET_MODEL": self.model,
            "ANTHROPIC_DEFAULT_OPUS_MODEL": self.model,
            "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "1000000",
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
            "API_TIMEOUT_MS": "3000000",
        }

    def readiness(self) -> dict[str, bool]:
        return {
            "forgejo_token": self.forgejo_token_file.is_file() and self.forgejo_token_file.stat().st_size > 0,
            "webhook_secret": self.webhook_secret_file.is_file() and self.webhook_secret_file.stat().st_size > 0,
            "zai_api_key": bool(self.zai_api_key),
        }
