from __future__ import annotations

import hashlib
import hmac
import json
import logging
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from agents import AGENTS, BY_USERNAME, choose_agent, mention_instruction, mentioned_agent
from config import Settings
from forgejo import ForgejoClient
from worker import IssueTask, MaintenanceWorker


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("openface-maintenance")
settings = Settings.load()
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.workspace_dir.mkdir(parents=True, exist_ok=True)
database_path = settings.data_dir / "jobs.sqlite3"
database_lock = Lock()
executor = ThreadPoolExecutor(max_workers=settings.max_workers, thread_name_prefix="claude-goal-maintenance")
worker = MaintenanceWorker(settings)
app = FastAPI(title="OpenFace Claude Goal Maintenance Agent", version="2.0.0")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def initialize_database() -> None:
    with sqlite3.connect(database_path) as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                delivery_id TEXT PRIMARY KEY,
                owner TEXT NOT NULL,
                repo TEXT NOT NULL,
                issue_number INTEGER NOT NULL,
                status TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                pull_url TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                agent TEXT NOT NULL DEFAULT 'coding-agent',
                UNIQUE(owner, repo, issue_number)
            )
            """
        )
        columns = {row[1] for row in db.execute("PRAGMA table_info(jobs)")}
        if "agent" not in columns:
            db.execute("ALTER TABLE jobs ADD COLUMN agent TEXT NOT NULL DEFAULT 'coding-agent'")
        db.execute(
            "UPDATE jobs SET status='interrupted', detail='Service restarted before the Claude Code /goal run completed', "
            "updated_at=? WHERE status IN ('queued', 'running')",
            (utc_now(),),
        )


initialize_database()


def update_job(delivery_id: str, status: str, detail: str = "", pull_url: str = "") -> None:
    with database_lock, sqlite3.connect(database_path) as db:
        db.execute(
            "UPDATE jobs SET status=?, detail=?, pull_url=?, updated_at=? WHERE delivery_id=?",
            (status, detail[:4000], pull_url, utc_now(), delivery_id),
        )


def process_job(delivery_id: str, task: IssueTask) -> None:
    profile = AGENTS[task.agent_key]
    update_job(delivery_id, "running", f"{profile.display_name} が Claude Code /goal を {settings.model} で実行中")
    try:
        client = ForgejoClient(settings, settings.agent_token_file(profile.username))
        try:
            client.react_to_issue(task.owner, task.repo, task.conversation_number, "eyes")
        finally:
            client.close()
        result = worker.run(task)
        update_job(delivery_id, "completed", result.summary, result.pull.url)
        client = ForgejoClient(settings, settings.agent_token_file(profile.username))
        try:
            client.react_to_issue(task.owner, task.repo, task.conversation_number, "rocket")
        finally:
            client.close()
        logger.info("Completed %s/%s issue #%s -> PR %s", task.owner, task.repo, task.issue_number, result.pull.url)
    except Exception as exc:  # fail closed and retain an inspectable job record
        message = str(exc)[:2000]
        update_job(delivery_id, "failed", message)
        logger.error("Maintenance failed for %s/%s#%s: %s", task.owner, task.repo, task.issue_number, message)
        try:
            client = ForgejoClient(settings)
            client.react_to_issue(task.owner, task.repo, task.conversation_number, "confused")
            client.comment_issue(
                task.owner,
                task.repo,
                task.conversation_number,
                "🤖 Claude Code `/goal` は変更をpushせずに停止しました。"
                "Goalの実行に失敗したか、生成されたworktreeが公開前検証を通過しませんでした。"
                "メンテナーはサービスのジョブログを確認できます。",
            )
            client.close()
        except Exception:
            logger.exception("Could not post failure status to issue")


def signature_valid(raw_body: bytes, supplied: str | None) -> bool:
    if not supplied:
        return False
    secret = settings.read_webhook_secret().encode()
    expected = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
    candidate = supplied.removeprefix("sha256=")
    return hmac.compare_digest(expected, candidate)


def payload_to_task(
    payload: dict[str, Any], *, issue_override: dict[str, Any] | None = None,
    follow_up: bool = False, instruction: str = "", agent_key: str = "coding",
    reply_number: int | None = None,
) -> IssueTask:
    repository = payload.get("repository") or {}
    issue = issue_override or payload.get("issue") or {}
    owner = (repository.get("owner") or {}).get("login") or ""
    repo = repository.get("name") or ""
    if owner != settings.allowed_owner:
        raise HTTPException(status_code=403, detail="Repository owner is not allowed")
    if not repo or not issue.get("number"):
        raise HTTPException(status_code=400, detail="Webhook is missing repository or issue data")
    return IssueTask(
        owner=owner,
        repo=repo,
        issue_number=int(issue["number"]),
        title=str(issue.get("title") or "Maintenance request")[:500],
        body=str(issue.get("body") or "")[:20_000],
        default_branch=str(repository.get("default_branch") or "main"),
        issue_url=str(issue.get("html_url") or issue.get("url") or ""),
        follow_up=follow_up,
        instruction=instruction[:20_000],
        agent_key=agent_key,
        reply_number=reply_number,
    )


def follow_up_instruction(body: str) -> str | None:
    stripped = body.strip()
    if not stripped.startswith("/goal"):
        return None
    instruction = stripped.removeprefix("/goal").strip()
    return instruction or None


def enqueue(task: IssueTask, delivery_id: str, *, allow_retry: bool) -> bool:
    now = utc_now()
    with database_lock, sqlite3.connect(database_path) as db:
        row = db.execute(
            "SELECT delivery_id, status FROM jobs WHERE owner=? AND repo=? AND issue_number=?",
            (task.owner, task.repo, task.issue_number),
        ).fetchone()
        if row:
            if not allow_retry or row[1] in {"queued", "running"}:
                return False
            db.execute(
                "UPDATE jobs SET delivery_id=?, status='queued', detail='', pull_url='', created_at=?, updated_at=?, agent=? "
                "WHERE owner=? AND repo=? AND issue_number=?",
                (delivery_id, now, now, AGENTS[task.agent_key].username, task.owner, task.repo, task.issue_number),
            )
        else:
            db.execute(
                "INSERT INTO jobs(delivery_id, owner, repo, issue_number, status, created_at, updated_at, agent) "
                "VALUES(?, ?, ?, ?, 'queued', ?, ?, ?)",
                (delivery_id, task.owner, task.repo, task.issue_number, now, now, AGENTS[task.agent_key].username),
            )
    executor.submit(process_job, delivery_id, task)
    return True


@app.get("/health")
def health() -> JSONResponse:
    ready = settings.readiness()
    status = 200 if all(ready.values()) else 503
    return JSONResponse(
        status_code=status,
        content={
            "ok": status == 200,
            "model": settings.model,
            "max_workers": settings.max_workers,
            "dependencies": ready,
        },
    )


@app.get("/api/jobs")
def jobs() -> dict[str, Any]:
    with database_lock, sqlite3.connect(database_path) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute(
            "SELECT delivery_id, owner, repo, issue_number, status, detail, pull_url, agent, created_at, updated_at "
            "FROM jobs ORDER BY created_at DESC LIMIT 50"
        ).fetchall()
    return {"jobs": [dict(row) for row in rows]}


@app.get("/api/agents")
def agents() -> dict[str, Any]:
    return {
        "agents": [
            {
                "key": profile.key,
                "username": profile.username,
                "display_name": profile.display_name,
                "emoji": profile.emoji,
                "focus": profile.focus,
                "mention": f"@{profile.username}",
            }
            for profile in AGENTS.values()
        ]
    }


@app.post("/webhooks/forgejo", status_code=202)
async def forgejo_webhook(
    request: Request,
    x_forgejo_event: str | None = Header(default=None),
    x_forgejo_delivery: str | None = Header(default=None),
    x_forgejo_signature: str | None = Header(default=None),
) -> dict[str, Any]:
    raw_body = await request.body()
    if not signature_valid(raw_body, x_forgejo_signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    if x_forgejo_event not in {"issues", "issue", "issue_comment", "pull_request_comment"}:
        return {"accepted": False, "reason": "event ignored"}
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON") from exc
    issue = payload.get("issue") or {}
    body = str(issue.get("body") or "")
    labels = {str(label.get("name", "")).lower() for label in issue.get("labels", []) if isinstance(label, dict)}
    sender = (payload.get("sender") or {}).get("login", "")
    if sender in {"glm-maintainer", *BY_USERNAME} or "agent:skip" in labels or "<!-- openface-maintenance:skip -->" in body:
        return {"accepted": False, "reason": "issue opted out"}
    delivery_id = x_forgejo_delivery or hashlib.sha256(raw_body).hexdigest()
    if x_forgejo_event in {"issues", "issue"}:
        if payload.get("action") != "opened":
            return {"accepted": False, "reason": "action ignored"}
        profile = choose_agent(str(issue.get("title") or ""), body)
        task = payload_to_task(payload, agent_key=profile.key)
        queued = enqueue(task, delivery_id, allow_retry=False)
        if queued:
            client = ForgejoClient(settings)
            try:
                client.comment_issue(
                    task.owner, task.repo, task.issue_number,
                    f"🧭 内容を分類し、@{profile.username} に委任しました。\n\n"
                    f"> 担当: **{profile.display_name}** — {profile.focus}\n\n"
                    "進捗はリアクションとコメントで更新します。",
                )
            finally:
                client.close()
    else:
        if payload.get("action") not in {"created", "edited"}:
            return {"accepted": False, "reason": "comment action ignored"}
        comment_body = str((payload.get("comment") or {}).get("body") or "")
        profile = mentioned_agent(comment_body)
        instruction = mention_instruction(comment_body, profile) if profile else follow_up_instruction(comment_body)
        if not instruction:
            return {"accepted": False, "reason": "comment has no /goal or specialist mention instruction"}
        repository = payload.get("repository") or {}
        owner = str((repository.get("owner") or {}).get("login") or "")
        repo = str(repository.get("name") or "")
        issue_number = int(issue.get("number") or 0)
        reply_number: int | None = None
        if issue.get("pull_request"):
            reply_number = issue_number
            client = ForgejoClient(settings)
            try:
                source_number = client.source_issue_number_for_pull(owner, repo, issue_number)
                if not source_number:
                    return {"accepted": False, "reason": "pull request is not managed by the agent"}
                issue = client.issue(owner, repo, source_number)
            finally:
                client.close()
        profile = profile or choose_agent(str(issue.get("title") or ""), instruction)
        task = payload_to_task(
            payload, issue_override=issue, follow_up=True, instruction=instruction, agent_key=profile.key,
            reply_number=reply_number,
        )
        queued = enqueue(task, delivery_id, allow_retry=True)
    return {
        "accepted": True,
        "duplicate": not queued,
        "issue": task.issue_number,
        "model": settings.model,
        "follow_up": task.follow_up,
        "agent": AGENTS[task.agent_key].username,
    }
