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


async def get_pages_source(owner: str, repo: str, token: str | None) -> tuple[str, str] | None:
    """Return the public Pages source as ``(ref, directory_prefix)``.

    The compatible conventions are the same small subset most repositories
    expect from GitHub Pages: a dedicated ``gh-pages`` branch at its root, or
    a ``docs/`` directory on the default branch. Private repositories are
    never exposed through the unauthenticated Pages endpoint.
    """
    repo_info = await get_repo_info(owner, repo, token)
    if repo_info.get("private"):
        return None

    headers = {"Authorization": f"token {token}"} if token else {}
    branch_url = f"{config.FORGEJO_API}/repos/{owner}/{repo}/branches/gh-pages"
    async with httpx.AsyncClient(timeout=15.0) as client:
        branch_response = await client.get(branch_url, headers=headers)
    if branch_response.status_code == 200:
        return ("gh-pages", "")
    if branch_response.status_code not in (404,):
        raise ForgejoError(f"could not inspect Pages branch for {owner}/{repo}")
    return (repo_info.get("default_branch") or "main", "docs")


async def fetch_pages_asset(
    owner: str,
    repo: str,
    ref: str,
    directory_prefix: str,
    asset_path: str,
    token: str | None,
) -> tuple[int, bytes, str | None]:
    """Load an asset from Forgejo's raw endpoint without touching disk."""
    path_parts = [part for part in (directory_prefix, asset_path) if part]
    raw_path = "/".join(path_parts)
    headers = {"Authorization": f"token {token}"} if token else {}
    url = f"{config.FORGEJO_API}/repos/{owner}/{repo}/raw/{ref}/{raw_path}"
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
        response = await client.get(url, headers=headers)
    return response.status_code, response.content, response.headers.get("content-type")


async def verify_space_repo(owner: str, repo: str, token: str | None) -> None:
    """Raise ForgejoError unless the repo exists and carries the `space` topic."""
    repo_info = await get_repo_info(owner, repo, token)
    if repo_info.get("private") and not config.ALLOW_PRIVATE_SPACES:
        raise ForgejoError("private Spaces are disabled by OPENFACE_ALLOW_PRIVATE_SPACES")
    topics = await get_repo_topics(owner, repo, token)
    if "space" not in topics:
        raise ForgejoError(f"repository {owner}/{repo} does not have the 'space' topic")


async def get_default_revision(owner: str, repo: str, token: str | None) -> str:
    """Resolve the default branch to an immutable commit SHA."""
    repo_info = await get_repo_info(owner, repo, token)
    branch = repo_info.get("default_branch") or "main"
    headers = {"Authorization": f"token {token}"} if token else {}
    url = f"{config.FORGEJO_API}/repos/{owner}/{repo}/branches/{branch}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, headers=headers)
    if response.status_code != 200:
        raise ForgejoError(f"could not resolve {owner}/{repo}@{branch}")
    commit = response.json().get("commit") or {}
    revision = commit.get("id") or commit.get("sha")
    if not revision:
        raise ForgejoError(f"Forgejo returned no commit SHA for {owner}/{repo}@{branch}")
    return revision


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
