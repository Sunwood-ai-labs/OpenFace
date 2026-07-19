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
executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="glm-maintenance")
worker = MaintenanceWorker(settings)
app = FastAPI(title="OpenFace GLM Maintenance Agent", version="1.0.0")


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
                UNIQUE(owner, repo, issue_number)
            )
            """
        )


initialize_database()


def update_job(delivery_id: str, status: str, detail: str = "", pull_url: str = "") -> None:
    with database_lock, sqlite3.connect(database_path) as db:
        db.execute(
            "UPDATE jobs SET status=?, detail=?, pull_url=?, updated_at=? WHERE delivery_id=?",
            (status, detail[:4000], pull_url, utc_now(), delivery_id),
        )


def process_job(delivery_id: str, task: IssueTask) -> None:
    update_job(delivery_id, "running", f"Analyzing with {settings.model}")
    try:
        result = worker.run(task)
        update_job(delivery_id, "completed", result.summary, result.pull.url)
        logger.info("Completed %s/%s issue #%s -> PR %s", task.owner, task.repo, task.issue_number, result.pull.url)
    except Exception as exc:  # fail closed and retain an inspectable job record
        message = str(exc)[:2000]
        update_job(delivery_id, "failed", message)
        logger.error("Maintenance failed for %s/%s#%s: %s", task.owner, task.repo, task.issue_number, message)
        try:
            client = ForgejoClient(settings)
            client.comment_issue(
                task.owner,
                task.repo,
                task.issue_number,
                "🤖 GLM maintenance agent stopped without pushing changes. "
                "The proposal failed a safety or validation gate. A maintainer can inspect the service job log.",
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


def payload_to_task(payload: dict[str, Any]) -> IssueTask:
    repository = payload.get("repository") or {}
    issue = payload.get("issue") or {}
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
    )


@app.get("/health")
def health() -> JSONResponse:
    ready = settings.readiness()
    status = 200 if all(ready.values()) else 503
    return JSONResponse(
        status_code=status,
        content={"ok": status == 200, "model": settings.model, "dependencies": ready},
    )


@app.get("/api/jobs")
def jobs() -> dict[str, Any]:
    with database_lock, sqlite3.connect(database_path) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute(
            "SELECT delivery_id, owner, repo, issue_number, status, detail, pull_url, created_at, updated_at "
            "FROM jobs ORDER BY created_at DESC LIMIT 50"
        ).fetchall()
    return {"jobs": [dict(row) for row in rows]}


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
    if x_forgejo_event not in {"issues", "issue"}:
        return {"accepted": False, "reason": "event ignored"}
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON") from exc
    if payload.get("action") != "opened":
        return {"accepted": False, "reason": "action ignored"}
    issue = payload.get("issue") or {}
    body = str(issue.get("body") or "")
    labels = {str(label.get("name", "")).lower() for label in issue.get("labels", []) if isinstance(label, dict)}
    sender = (payload.get("sender") or {}).get("login", "")
    if sender == "glm-maintainer" or "agent:skip" in labels or "<!-- openface-maintenance:skip -->" in body:
        return {"accepted": False, "reason": "issue opted out"}
    task = payload_to_task(payload)
    delivery_id = x_forgejo_delivery or hashlib.sha256(raw_body).hexdigest()
    now = utc_now()
    try:
        with database_lock, sqlite3.connect(database_path) as db:
            db.execute(
                "INSERT INTO jobs(delivery_id, owner, repo, issue_number, status, created_at, updated_at) "
                "VALUES(?, ?, ?, ?, 'queued', ?, ?)",
                (delivery_id, task.owner, task.repo, task.issue_number, now, now),
            )
    except sqlite3.IntegrityError:
        return {"accepted": True, "duplicate": True, "issue": task.issue_number}
    executor.submit(process_job, delivery_id, task)
    return {"accepted": True, "duplicate": False, "issue": task.issue_number, "model": settings.model}

