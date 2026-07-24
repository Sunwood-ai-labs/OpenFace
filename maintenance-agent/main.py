from __future__ import annotations

import hashlib
import hmac
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Lock
from collections.abc import Callable
from typing import Any

import psycopg
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row

from agents import (
    AGENTS,
    BY_USERNAME,
    assign_agent,
    choose_agent,
    delegation_comment,
    is_ui_task,
    maintainer_instruction,
    mentions_maintainer,
)
from config import Settings
from forgejo import ForgejoClient
from worker import IssueTask, MaintenanceWorker


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("openface-maintenance")
settings = Settings.load()
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.workspace_dir.mkdir(parents=True, exist_ok=True)
database_url = settings.database_url
database_lock = Lock()
executor = ThreadPoolExecutor(max_workers=settings.max_workers, thread_name_prefix="claude-goal-maintenance")
worker = MaintenanceWorker(settings)
app = FastAPI(title="OpenFace Claude Goal Maintenance Agent", version="2.0.0")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect_database() -> psycopg.Connection:
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    return psycopg.connect(database_url, row_factory=dict_row)


def initialize_database() -> None:
    with connect_database() as db:
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
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                agent TEXT NOT NULL DEFAULT 'coding-agent',
                UNIQUE(owner, repo, issue_number)
            )
            """
        )
        columns = {
            row["column_name"]
            for row in db.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name='jobs'"
            )
        }
        if "agent" not in columns:
            db.execute("ALTER TABLE jobs ADD COLUMN agent TEXT NOT NULL DEFAULT 'coding-agent'")
        db.execute(
            "UPDATE jobs SET status='interrupted', detail='Service restarted before the Claude Code /goal run completed', "
            "updated_at=%s WHERE status IN ('queued', 'running')",
            (utc_now(),),
        )

if database_url:
    initialize_database()


def update_job(delivery_id: str, status: str, detail: str = "", pull_url: str = "") -> None:
    with database_lock, connect_database() as db:
        db.execute(
            "UPDATE jobs SET status=%s, detail=%s, pull_url=%s, updated_at=%s WHERE delivery_id=%s",
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
        if result.review_verdict == "rejected":
            update_job(
                delivery_id,
                "changes_requested",
                "独立レビューで差し戻されました。PRは未マージです。",
                result.pull.url,
            )
            logger.info(
                "Review requested changes for %s/%s issue #%s -> PR %s",
                task.owner, task.repo, task.issue_number, result.pull.url,
            )
            return
        update_job(
            delivery_id,
            "completed" if result.merged or not settings.auto_merge else "awaiting_merge",
            result.summary,
            result.pull.url,
        )
        client = ForgejoClient(settings, settings.agent_token_file(profile.username))
        try:
            client.react_to_issue(task.owner, task.repo, task.conversation_number, "rocket")
        finally:
            client.close()
        logger.info(
            "Completed %s/%s issue #%s -> PR %s (review=%s, merged=%s)",
            task.owner, task.repo, task.issue_number, result.pull.url,
            result.review_verdict or "n/a", result.merged,
        )
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
    reply_number: int | None = None, ui_evidence_required: bool = False,
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
        ui_evidence_required=ui_evidence_required,
    )


def follow_up_instruction(body: str) -> str | None:
    stripped = body.strip()
    if not stripped.startswith("/goal"):
        return None
    instruction = stripped.removeprefix("/goal").strip()
    return instruction or None


def enqueue(
    task: IssueTask,
    delivery_id: str,
    *,
    allow_retry: bool,
    announce: Callable[[], None] | None = None,
) -> bool:
    now = utc_now()
    with database_lock, connect_database() as db:
        row = db.execute(
            "SELECT delivery_id, status FROM jobs WHERE owner=%s AND repo=%s AND issue_number=%s",
            (task.owner, task.repo, task.issue_number),
        ).fetchone()
        if row:
            if not allow_retry or row["status"] in {"queued", "running"}:
                return False
            db.execute(
                "UPDATE jobs SET delivery_id=%s, status='queued', detail='', pull_url='', created_at=%s, updated_at=%s, agent=%s "
                "WHERE owner=%s AND repo=%s AND issue_number=%s",
                (delivery_id, now, now, AGENTS[task.agent_key].username, task.owner, task.repo, task.issue_number),
            )
        else:
            db.execute(
                "INSERT INTO jobs(delivery_id, owner, repo, issue_number, status, created_at, updated_at, agent) "
                "VALUES(%s, %s, %s, %s, 'queued', %s, %s, %s)",
                (delivery_id, task.owner, task.repo, task.issue_number, now, now, AGENTS[task.agent_key].username),
            )
    try:
        if announce:
            announce()
    except Exception:
        with database_lock, connect_database() as db:
            db.execute("DELETE FROM jobs WHERE delivery_id=%s AND status='queued'", (delivery_id,))
        raise
    executor.submit(process_job, delivery_id, task)
    return True


@app.get("/health")
def health() -> JSONResponse:
    ready = settings.readiness()
    try:
        with connect_database() as db:
            ready["database"] = db.execute("SELECT 1 AS ok").fetchone()["ok"] == 1
    except Exception:
        ready["database"] = False
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
    with database_lock, connect_database() as db:
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
        if not mentions_maintainer(body):
            return {"accepted": False, "reason": "mention @glm-maintainer to start maintenance"}
        instruction = maintainer_instruction(body)
        profile = assign_agent(str(issue.get("title") or ""), instruction)
        task = payload_to_task(
            payload,
            instruction=instruction,
            agent_key=profile.key,
            ui_evidence_required=is_ui_task(str(issue.get("title") or ""), instruction, profile),
        )
        def announce_delegation() -> None:
            client = ForgejoClient(settings)
            try:
                client.comment_issue(
                    task.owner, task.repo, task.issue_number,
                    delegation_comment(profile, f"{task.title}\n{task.body}", follow_up=False),
                )
            finally:
                client.close()
        queued = enqueue(task, delivery_id, allow_retry=False, announce=announce_delegation)
    else:
        if payload.get("action") not in {"created", "edited"}:
            return {"accepted": False, "reason": "comment action ignored"}
        comment_body = str((payload.get("comment") or {}).get("body") or "")
        if not mentions_maintainer(comment_body):
            return {"accepted": False, "reason": "comment must mention @glm-maintainer"}
        instruction = maintainer_instruction(comment_body)
        if not instruction:
            return {"accepted": False, "reason": "maintainer mention has no instruction"}
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
        profile = choose_agent(str(issue.get("title") or ""), instruction)
        task = payload_to_task(
            payload, issue_override=issue, follow_up=True, instruction=instruction, agent_key=profile.key,
            reply_number=reply_number,
            ui_evidence_required=is_ui_task(str(issue.get("title") or ""), instruction, profile),
        )
        def announce_follow_up() -> None:
            client = ForgejoClient(settings)
            try:
                client.comment_issue(
                    task.owner, task.repo, task.conversation_number,
                    delegation_comment(profile, instruction, follow_up=True),
                )
            finally:
                client.close()
        queued = enqueue(task, delivery_id, allow_retry=True, announce=announce_follow_up)
    return {
        "accepted": True,
        "duplicate": not queued,
        "issue": task.issue_number,
        "model": settings.model,
        "follow_up": task.follow_up,
        "agent": AGENTS[task.agent_key].username,
        "ui_evidence_required": task.ui_evidence_required,
    }
