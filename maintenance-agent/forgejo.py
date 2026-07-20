from __future__ import annotations

import base64
import os
import re
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
    def __init__(self, settings: Settings, token_file: Path | None = None):
        self.settings = settings
        self.token = (token_file or settings.forgejo_token_file).read_text(encoding="utf-8").strip()
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

    def merge_pull(self, owner: str, repo: str, pull_number: int) -> None:
        self._request(
            "POST",
            f"/repos/{owner}/{repo}/pulls/{pull_number}/merge",
            json={
                "Do": "merge",
                "delete_branch_after_merge": True,
                "merge_when_checks_succeed": True,
            },
        )

    def comment_issue(self, owner: str, repo: str, issue_number: int, body: str) -> None:
        self._request(
            "POST",
            f"/repos/{owner}/{repo}/issues/{issue_number}/comments",
            json={"body": body[:20_000]},
        )

    def react_to_issue(self, owner: str, repo: str, issue_number: int, content: str) -> None:
        response = self.client.post(
            f"/repos/{owner}/{repo}/issues/{issue_number}/reactions",
            json={"content": content},
        )
        # A repeated webhook may try to add the same reaction again. Forgejo
        # reports that as a conflict; the desired visible state already exists.
        if response.status_code not in {200, 201, 409}:
            response.raise_for_status()

    def issue(self, owner: str, repo: str, issue_number: int) -> dict[str, Any]:
        return self._request("GET", f"/repos/{owner}/{repo}/issues/{issue_number}")

    def source_issue_number_for_pull(self, owner: str, repo: str, pull_number: int) -> int | None:
        pull = self._request("GET", f"/repos/{owner}/{repo}/pulls/{pull_number}")
        branch = str((pull.get("head") or {}).get("ref") or "")
        match = re.fullmatch(r"agent/issue-(\d+)", branch)
        return int(match.group(1)) if match else None

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
