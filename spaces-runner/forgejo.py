"""Thin helpers for talking to the Forgejo API (repo existence / topics)."""
from __future__ import annotations

import httpx

import config


class ForgejoError(Exception):
    """Raised when a repo can't be verified against Forgejo."""


async def get_repo_info(owner: str, repo: str, token: str | None) -> dict:
    """Fetch repo metadata from Forgejo. Raises ForgejoError if not found."""
    headers = {"Authorization": f"token {token}"} if token else {}
    url = f"{config.FORGEJO_API}/repos/{owner}/{repo}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers)
    if resp.status_code == 404:
        raise ForgejoError(f"repository {owner}/{repo} not found")
    if resp.status_code != 200:
        raise ForgejoError(f"forgejo API returned {resp.status_code} for {owner}/{repo}")
    return resp.json()


async def get_repo_topics(owner: str, repo: str, token: str | None) -> list[str]:
    headers = {"Authorization": f"token {token}"} if token else {}
    url = f"{config.FORGEJO_API}/repos/{owner}/{repo}/topics"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers)
    if resp.status_code != 200:
        return []
    data = resp.json()
    return data.get("topics", [])


async def verify_space_repo(owner: str, repo: str, token: str | None) -> None:
    """Raise ForgejoError unless the repo exists and carries the `space` topic."""
    repo_info = await get_repo_info(owner, repo, token)
    if repo_info.get("private") and not config.ALLOW_PRIVATE_SPACES:
        raise ForgejoError("private Spaces are disabled by OPENFACE_ALLOW_PRIVATE_SPACES")
    topics = await get_repo_topics(owner, repo, token)
    if "space" not in topics:
        raise ForgejoError(f"repository {owner}/{repo} does not have the 'space' topic")


def clone_url(owner: str, repo: str, token: str | None) -> str:
    """Build a clone URL for the repo, authenticated when a token is available.

    Forgejo (like Gitea) accepts an OAuth2-style basic-auth login of
    `oauth2:<token>` as username with the token as password-equivalent, which
    works without needing to know the actual account username.
    """
    host = config.FORGEJO_GIT_BASE.split("://", 1)[-1]
    scheme = config.FORGEJO_GIT_BASE.split("://", 1)[0]
    if token:
        return f"{scheme}://oauth2:{token}@{host}/{owner}/{repo}.git"
    return f"{scheme}://{host}/{owner}/{repo}.git"
