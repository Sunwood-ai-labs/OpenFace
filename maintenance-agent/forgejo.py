from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from config import Settings


@dataclass(frozen=True)
class PullRequest:
    number: int
    url: str


class ForgejoClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.token = settings.read_forgejo_token()
        self.client = httpx.Client(
            base_url=settings.forgejo_api,
            headers={"Authorization": f"token {self.token}"},
            timeout=30,
        )

    def close(self) -> None:
        self.client.close()

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = self.client.request(method, path, **kwargs)
        response.raise_for_status()
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    def existing_pull(self, owner: str, repo: str, branch: str) -> PullRequest | None:
        pulls = self._request("GET", f"/repos/{owner}/{repo}/pulls", params={"state": "open", "limit": 50})
        for pull in pulls:
            if pull.get("head", {}).get("ref") == branch:
                return PullRequest(number=int(pull["number"]), url=pull.get("html_url") or pull.get("url", ""))
        return None

    def create_pull(
        self,
        owner: str,
        repo: str,
        base: str,
        branch: str,
        title: str,
        body: str,
    ) -> PullRequest:
        pull = self._request(
            "POST",
            f"/repos/{owner}/{repo}/pulls",
            json={"base": base, "head": branch, "title": title[:240], "body": body},
        )
        return PullRequest(number=int(pull["number"]), url=pull.get("html_url") or pull.get("url", ""))

    def comment_issue(self, owner: str, repo: str, issue_number: int, body: str) -> None:
        self._request(
            "POST",
            f"/repos/{owner}/{repo}/issues/{issue_number}/comments",
            json={"body": body[:20_000]},
        )

    def git_environment(self) -> dict[str, str]:
        env = {
            "PATH": os.environ.get("PATH", ""),
            "HOME": os.environ.get("HOME", "/home/maintainer"),
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "http.extraHeader",
            "GIT_CONFIG_VALUE_0": "Authorization: Basic "
            + base64.b64encode(f"glm-maintainer:{self.token}".encode()).decode(),
        }
        return env

    def clone_url(self, owner: str, repo: str) -> str:
        return f"{self.settings.forgejo_git_base}/{owner}/{repo}.git"

