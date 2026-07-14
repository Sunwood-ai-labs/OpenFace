"""Persistent, authenticated interaction metrics for software agents."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import config


DEFAULT_AGENTS = (
    ("luna-scout", "Luna Scout", "🌙", "Discovery agent for useful local apps"),
    ("patch-orbit", "Patch Orbit", "🛰️", "Builder agent testing developer tools"),
    ("mikan-reviewer", "Mikan Reviewer", "🍊", "Curator agent reviewing friendly utilities"),
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _connect() -> sqlite3.Connection:
    Path(config.AGENT_DATA_DIR).mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(config.AGENT_DB_PATH, timeout=15)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def initialize() -> None:
    with _connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS agents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                emoji TEXT NOT NULL,
                bio TEXT NOT NULL,
                api_key_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS repo_views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                owner TEXT NOT NULL,
                repo TEXT NOT NULL,
                idempotency_key TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(agent_id, idempotency_key)
            );
            CREATE INDEX IF NOT EXISTS repo_views_target ON repo_views(owner, repo);
            CREATE TABLE IF NOT EXISTS browser_views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner TEXT NOT NULL,
                repo TEXT NOT NULL,
                idempotency_key TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS browser_views_target ON browser_views(owner, repo);
            CREATE TABLE IF NOT EXISTS repo_likes (
                agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                owner TEXT NOT NULL,
                repo TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(agent_id, owner, repo)
            );
            CREATE INDEX IF NOT EXISTS repo_likes_target ON repo_likes(owner, repo);
            """
        )

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
            row = db.execute("SELECT id FROM agents WHERE slug = ?", (slug,)).fetchone()
            if row:
                continue
            api_key = f"of_agent_{secrets.token_urlsafe(32)}"
            db.execute(
                "INSERT INTO agents(slug, display_name, emoji, bio, api_key_hash, created_at) VALUES(?,?,?,?,?,?)",
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


def authenticate(api_key: str | None) -> sqlite3.Row | None:
    if not api_key:
        return None
    candidate = _hash_key(api_key)
    with _connect() as db:
        rows = db.execute("SELECT * FROM agents").fetchall()
    for row in rows:
        if hmac.compare_digest(row["api_key_hash"], candidate):
            return row
    return None


def metrics(owner: str, repo: str) -> dict[str, Any]:
    with _connect() as db:
        agent_views = db.execute(
            "SELECT COUNT(*) FROM repo_views WHERE owner = ? AND repo = ?", (owner, repo)
        ).fetchone()[0]
        browser_views = db.execute(
            "SELECT COUNT(*) FROM browser_views WHERE owner = ? AND repo = ?", (owner, repo)
        ).fetchone()[0]
        likes = db.execute(
            "SELECT COUNT(*) FROM repo_likes WHERE owner = ? AND repo = ?", (owner, repo)
        ).fetchone()[0]
        recent = db.execute(
            """
            SELECT a.slug, a.display_name, a.emoji, MAX(x.created_at) AS acted_at
            FROM agents a JOIN (
                SELECT agent_id, created_at FROM repo_views WHERE owner = ? AND repo = ?
                UNION ALL
                SELECT agent_id, created_at FROM repo_likes WHERE owner = ? AND repo = ?
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


def record_view(agent_id: int, owner: str, repo: str, idempotency_key: str | None) -> tuple[bool, dict[str, Any]]:
    created = False
    with _connect() as db:
        try:
            db.execute(
                "INSERT INTO repo_views(agent_id, owner, repo, idempotency_key, created_at) VALUES(?,?,?,?,?)",
                (agent_id, owner, repo, idempotency_key, _now()),
            )
            created = True
        except sqlite3.IntegrityError:
            created = False
    return created, metrics(owner, repo)


def record_browser_view(owner: str, repo: str, idempotency_key: str) -> tuple[bool, dict[str, Any]]:
    """Record one browser visit, safely deduplicated by a client-generated key."""
    created = False
    with _connect() as db:
        try:
            db.execute(
                "INSERT INTO browser_views(owner, repo, idempotency_key, created_at) VALUES(?,?,?,?)",
                (owner, repo, idempotency_key, _now()),
            )
            created = True
        except sqlite3.IntegrityError:
            created = False
    return created, metrics(owner, repo)


def set_like(agent_id: int, owner: str, repo: str, liked: bool) -> tuple[bool, dict[str, Any]]:
    with _connect() as db:
        before = db.total_changes
        if liked:
            db.execute(
                "INSERT OR IGNORE INTO repo_likes(agent_id, owner, repo, created_at) VALUES(?,?,?,?)",
                (agent_id, owner, repo, _now()),
            )
        else:
            db.execute(
                "DELETE FROM repo_likes WHERE agent_id = ? AND owner = ? AND repo = ?",
                (agent_id, owner, repo),
            )
        changed = db.total_changes > before
    return changed, metrics(owner, repo)
