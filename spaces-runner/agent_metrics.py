"""Persistent, authenticated interaction metrics backed by PostgreSQL."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row

import config


DEFAULT_AGENTS = (
    ("luna-scout", "Luna Scout", "🌙", "Discovery agent for useful local apps"),
    ("patch-orbit", "Patch Orbit", "🛰️", "Builder agent testing developer tools"),
    ("mikan-reviewer", "Mikan Reviewer", "🍊", "Curator agent reviewing friendly utilities"),
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _connect() -> psycopg.Connection:
    return psycopg.connect(config.DATABASE_URL, row_factory=dict_row)


def database_ready() -> bool:
    with _connect() as db:
        return db.execute("SELECT 1 AS ok").fetchone()["ok"] == 1


def initialize() -> None:
    Path(config.AGENT_DATA_DIR).mkdir(parents=True, exist_ok=True)
    with _connect() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS agents (
                id BIGSERIAL PRIMARY KEY,
                slug TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                emoji TEXT NOT NULL,
                bio TEXT NOT NULL,
                api_key_hash TEXT NOT NULL UNIQUE,
                created_at TIMESTAMPTZ NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS repo_views (
                id BIGSERIAL PRIMARY KEY,
                agent_id BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                owner TEXT NOT NULL,
                repo TEXT NOT NULL,
                idempotency_key TEXT,
                created_at TIMESTAMPTZ NOT NULL,
                UNIQUE(agent_id, idempotency_key)
            )
            """
        )
        db.execute("CREATE INDEX IF NOT EXISTS repo_views_target ON repo_views(owner, repo)")
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS browser_views (
                id BIGSERIAL PRIMARY KEY,
                owner TEXT NOT NULL,
                repo TEXT NOT NULL,
                idempotency_key TEXT NOT NULL UNIQUE,
                created_at TIMESTAMPTZ NOT NULL
            )
            """
        )
        db.execute("CREATE INDEX IF NOT EXISTS browser_views_target ON browser_views(owner, repo)")
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS repo_likes (
                agent_id BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                owner TEXT NOT NULL,
                repo TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL,
                PRIMARY KEY(agent_id, owner, repo)
            )
            """
        )
        db.execute("CREATE INDEX IF NOT EXISTS repo_likes_target ON repo_likes(owner, repo)")

    credentials_path = Path(config.AGENT_CREDENTIALS_FILE)
    existing_credentials: dict[str, str] = {}
    if credentials_path.exists():
        try:
            existing_credentials = json.loads(credentials_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            existing_credentials = {}

    credentials = dict(existing_credentials)
    with _connect() as db:
        for slug, display_name, emoji, bio in DEFAULT_AGENTS:
            row = db.execute("SELECT id FROM agents WHERE slug = %s", (slug,)).fetchone()
            if row:
                continue
            api_key = f"of_agent_{secrets.token_urlsafe(32)}"
            db.execute(
                "INSERT INTO agents(slug, display_name, emoji, bio, api_key_hash, created_at) "
                "VALUES(%s,%s,%s,%s,%s,%s)",
                (slug, display_name, emoji, bio, _hash_key(api_key), _now()),
            )
            credentials[slug] = api_key

    if credentials != existing_credentials:
        credentials_path.write_text(json.dumps(credentials, indent=2), encoding="utf-8")
        try:
            os.chmod(credentials_path, 0o600)
        except OSError:
            pass


def list_agents() -> list[dict[str, Any]]:
    with _connect() as db:
        rows = db.execute(
            """
            SELECT a.slug, a.display_name, a.emoji, a.bio,
                   COUNT(DISTINCT v.id) AS views,
                   COUNT(DISTINCT l.owner || '/' || l.repo) AS likes
            FROM agents a
            LEFT JOIN repo_views v ON v.agent_id = a.id
            LEFT JOIN repo_likes l ON l.agent_id = a.id
            GROUP BY a.id ORDER BY a.id
            """
        ).fetchall()
    return [dict(row) for row in rows]


def authenticate(api_key: str | None) -> dict[str, Any] | None:
    if not api_key:
        return None
    candidate = _hash_key(api_key)
    with _connect() as db:
        rows = db.execute("SELECT * FROM agents").fetchall()
    for row in rows:
        if hmac.compare_digest(row["api_key_hash"], candidate):
            return dict(row)
    return None


def metrics(owner: str, repo: str) -> dict[str, Any]:
    with _connect() as db:
        agent_views = db.execute(
            "SELECT COUNT(*) AS count FROM repo_views WHERE owner = %s AND repo = %s", (owner, repo)
        ).fetchone()["count"]
        browser_views = db.execute(
            "SELECT COUNT(*) AS count FROM browser_views WHERE owner = %s AND repo = %s", (owner, repo)
        ).fetchone()["count"]
        likes = db.execute(
            "SELECT COUNT(*) AS count FROM repo_likes WHERE owner = %s AND repo = %s", (owner, repo)
        ).fetchone()["count"]
        recent = db.execute(
            """
            SELECT a.slug, a.display_name, a.emoji, MAX(x.created_at) AS acted_at
            FROM agents a JOIN (
                SELECT agent_id, created_at FROM repo_views WHERE owner = %s AND repo = %s
                UNION ALL
                SELECT agent_id, created_at FROM repo_likes WHERE owner = %s AND repo = %s
            ) x ON x.agent_id = a.id
            GROUP BY a.id ORDER BY acted_at DESC LIMIT 3
            """,
            (owner, repo, owner, repo),
        ).fetchall()
    return {
        "owner": owner,
        "repo": repo,
        "views": agent_views + browser_views,
        "agent_views": agent_views,
        "browser_views": browser_views,
        "likes": likes,
        "recent_agents": [dict(row) for row in recent],
    }


def metrics_batch(repos: list[tuple[str, str]]) -> dict[str, dict[str, Any]]:
    unique_repos = list(dict.fromkeys(repos))
    result = {
        f"{owner}/{repo}": {
            "owner": owner,
            "repo": repo,
            "views": 0,
            "agent_views": 0,
            "browser_views": 0,
            "likes": 0,
            "recent_agents": [],
        }
        for owner, repo in unique_repos
    }
    if not unique_repos:
        return result

    targets = [f"{owner}/{repo}" for owner, repo in unique_repos]
    with _connect() as db:
        agent_rows = db.execute(
            """SELECT owner, repo, COUNT(*) AS count FROM repo_views
               WHERE owner || '/' || repo = ANY(%s) GROUP BY owner, repo""",
            (targets,),
        ).fetchall()
        browser_rows = db.execute(
            """SELECT owner, repo, COUNT(*) AS count FROM browser_views
               WHERE owner || '/' || repo = ANY(%s) GROUP BY owner, repo""",
            (targets,),
        ).fetchall()
        like_rows = db.execute(
            """SELECT owner, repo, COUNT(*) AS count FROM repo_likes
               WHERE owner || '/' || repo = ANY(%s) GROUP BY owner, repo""",
            (targets,),
        ).fetchall()

    for row in agent_rows:
        item = result[f"{row['owner']}/{row['repo']}"]
        item["agent_views"] = row["count"]
        item["views"] += row["count"]
    for row in browser_rows:
        item = result[f"{row['owner']}/{row['repo']}"]
        item["browser_views"] = row["count"]
        item["views"] += row["count"]
    for row in like_rows:
        result[f"{row['owner']}/{row['repo']}"]["likes"] = row["count"]
    return result


def record_view(agent_id: int, owner: str, repo: str, idempotency_key: str | None) -> tuple[bool, dict[str, Any]]:
    with _connect() as db:
        row = db.execute(
            """INSERT INTO repo_views(agent_id, owner, repo, idempotency_key, created_at)
               VALUES(%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING id""",
            (agent_id, owner, repo, idempotency_key, _now()),
        ).fetchone()
    return bool(row), metrics(owner, repo)


def record_browser_view(owner: str, repo: str, idempotency_key: str) -> tuple[bool, dict[str, Any]]:
    with _connect() as db:
        row = db.execute(
            """INSERT INTO browser_views(owner, repo, idempotency_key, created_at)
               VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING id""",
            (owner, repo, idempotency_key, _now()),
        ).fetchone()
    return bool(row), metrics(owner, repo)


def set_like(agent_id: int, owner: str, repo: str, liked: bool) -> tuple[bool, dict[str, Any]]:
    with _connect() as db:
        if liked:
            changed = db.execute(
                """INSERT INTO repo_likes(agent_id, owner, repo, created_at)
                   VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
                (agent_id, owner, repo, _now()),
            ).rowcount > 0
        else:
            changed = db.execute(
                "DELETE FROM repo_likes WHERE agent_id = %s AND owner = %s AND repo = %s",
                (agent_id, owner, repo),
            ).rowcount > 0
    return changed, metrics(owner, repo)
