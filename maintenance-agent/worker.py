from __future__ import annotations

import json
import os
import shutil
import struct
import subprocess
from dataclasses import dataclass
from pathlib import Path

from agents import AGENTS, AgentProfile
from config import Settings
from forgejo import ForgejoClient, PullRequest


@dataclass(frozen=True)
class IssueTask:
    owner: str
    repo: str
    issue_number: int
    title: str
    body: str
    default_branch: str
    issue_url: str
    follow_up: bool = False
    instruction: str = ""
    agent_key: str = "coding"
    reply_number: int | None = None
    ui_evidence_required: bool = False

    @property
    def branch(self) -> str:
        return f"agent/issue-{self.issue_number}"

    @property
    def conversation_number(self) -> int:
        return self.reply_number or self.issue_number


@dataclass(frozen=True)
class AgentResult:
    pull: PullRequest
    summary: str
    changed_files: list[str]


@dataclass(frozen=True)
class UiTestResult:
    name: str
    viewport: str
    result: str
    details: str


@dataclass(frozen=True)
class UiScreenshot:
    filename: str
    caption: str
    viewport: str
    url: str
    width: int
    height: int
    content: bytes


@dataclass(frozen=True)
class UiEvidence:
    summary: str
    tests: list[UiTestResult]
    screenshots: list[UiScreenshot]


class MaintenanceWorker:
    def __init__(self, settings: Settings):
        self.settings = settings

    def run(self, task: IssueTask) -> AgentResult:
        forgejo = ForgejoClient(self.settings)
        profile = AGENTS[task.agent_key]
        worktree = self.settings.workspace_dir / f"{task.owner}-{task.repo}-{task.issue_number}"
        try:
            existing = forgejo.existing_pull(task.owner, task.repo, task.branch)
            if existing and not task.follow_up:
                return AgentResult(existing, "既存のメンテナンスPRを再利用しました。", [])
            if worktree.exists():
                shutil.rmtree(worktree)
            self.settings.workspace_dir.mkdir(parents=True, exist_ok=True)
            self._git(
                forgejo,
                None,
                "clone",
                "--branch",
                task.branch if existing else task.default_branch,
                forgejo.clone_url(task.owner, task.repo),
                str(worktree),
            )
            if not existing:
                self._git(forgejo, worktree, "checkout", "-b", task.branch)
            base_revision = self._git(forgejo, worktree, "rev-parse", "HEAD").strip()
            self._prepare_goal_workspace(worktree)

            summary = self._run_claude_goal(worktree, task)

            # Claude is asked not to commit, but normalize any local commits it made.
            current_revision = self._git(forgejo, worktree, "rev-parse", "HEAD").strip()
            if current_revision != base_revision:
                self._git(forgejo, worktree, "reset", "--soft", base_revision)
            ui_evidence = self._collect_ui_evidence(worktree, task)
            changed = self._changed_files(worktree)
            if not changed and task.agent_key == "review" and existing:
                agent_client = ForgejoClient(self.settings, self.settings.agent_token_file(profile.username))
                try:
                    self._publish_completion_comment(
                        agent_client,
                        task,
                        profile,
                        existing,
                        [],
                        ui_evidence,
                        "独立レビュー完了（追加変更なし）",
                    )
                finally:
                    agent_client.close()
                return AgentResult(existing, summary, [])
            self._validate_worktree(worktree, changed)

            self._git(forgejo, worktree, "config", "user.name", profile.display_name)
            self._git(forgejo, worktree, "config", "user.email", f"{profile.username}@agents.openface.local")
            self._git(forgejo, worktree, "add", "--all")
            commit_message = (
                f"fix: apply follow-up for issue #{task.issue_number}"
                if task.follow_up
                else f"fix: resolve issue #{task.issue_number}"
            )
            self._git(forgejo, worktree, "commit", "-m", commit_message)
            self._git(forgejo, worktree, "push", "origin", f"HEAD:refs/heads/{task.branch}")
            pull = existing or forgejo.create_pull(
                task.owner,
                task.repo,
                task.default_branch,
                task.branch,
                f"[Claude Goal + GLM] {task.title}",
                self._pull_body(task, summary, changed),
            )
            agent_client = ForgejoClient(self.settings, self.settings.agent_token_file(profile.username))
            try:
                comment_id, comment_body = self._publish_completion_comment(
                    agent_client,
                    task,
                    profile,
                    pull,
                    changed,
                    ui_evidence,
                    "検証済み・マージ処理中" if self.settings.auto_merge else "人間レビュー待ち",
                )
            except Exception:
                agent_client.close()
                raise
            merged = False
            try:
                if self.settings.auto_merge:
                    forgejo.merge_pull(task.owner, task.repo, pull.number)
                    merged = True
                    agent_client.edit_issue_comment(
                        task.owner,
                        task.repo,
                        comment_id,
                        comment_body.replace("検証済み・マージ処理中", "自動マージ済み"),
                    )
            finally:
                agent_client.close()
            return AgentResult(pull, summary, changed)
        finally:
            forgejo.close()
            if worktree.exists():
                shutil.rmtree(worktree, ignore_errors=True)

    def _git(self, client: ForgejoClient, cwd: Path | None, *args: str) -> str:
        git_args = ["-c", f"safe.directory={cwd.resolve()}", *args] if cwd else list(args)
        process = subprocess.run(
            ["git", *git_args],
            cwd=cwd,
            env=client.git_environment(),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=300,
        )
        if process.returncode != 0:
            output = process.stdout[-4000:].replace(client.token, "<redacted>")
            raise RuntimeError(f"git {' '.join(args[:2])} failed: {output}")
        return process.stdout

    def _prepare_goal_workspace(self, worktree: Path) -> None:
        if getattr(os, "geteuid", lambda: -1)() == 0:
            subprocess.run(
                ["chown", "-R", f"{self.settings.claude_user}:{self.settings.claude_user}", str(worktree)],
                check=True,
                timeout=120,
            )

    def _collect_ui_evidence(self, root: Path, task: IssueTask) -> UiEvidence | None:
        evidence_root = root / ".openface-maintenance"
        report_path = evidence_root / "ui-report.json"
        if not report_path.is_file():
            if task.ui_evidence_required:
                raise RuntimeError(
                    "UI/app task did not produce .openface-maintenance/ui-report.json with screenshots and UI tests"
                )
            return None
        try:
            payload = json.loads(report_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"UI evidence report is invalid: {exc}") from exc

        raw_tests = payload.get("tests")
        raw_screenshots = payload.get("screenshots")
        if not isinstance(raw_tests, list) or not raw_tests:
            raise RuntimeError("UI evidence must list at least one executed UI test")
        if not isinstance(raw_screenshots, list) or len(raw_screenshots) < 2:
            raise RuntimeError("UI evidence must include mobile and desktop screenshots")
        if len(raw_screenshots) > 8:
            raise RuntimeError("UI evidence may include at most eight screenshots")

        tests: list[UiTestResult] = []
        for item in raw_tests:
            if not isinstance(item, dict):
                raise RuntimeError("Every UI test entry must be an object")
            result = str(item.get("result") or "").strip().lower()
            if result != "passed":
                raise RuntimeError(f"UI test did not pass: {item.get('name') or 'unnamed'}")
            name = str(item.get("name") or "").strip()
            details = str(item.get("details") or "").strip()
            if not name or not details:
                raise RuntimeError("Every UI test must include a name and concrete details")
            tests.append(
                UiTestResult(
                    name=name[:160],
                    viewport=str(item.get("viewport") or "—")[:40],
                    result="passed",
                    details=details[:600],
                )
            )

        screenshots_dir = (evidence_root / "screenshots").resolve()
        screenshots: list[UiScreenshot] = []
        for index, item in enumerate(raw_screenshots):
            if not isinstance(item, dict):
                raise RuntimeError("Every screenshot entry must be an object")
            relative = str(item.get("path") or "")
            candidate = (root / relative).resolve(strict=False)
            if screenshots_dir != candidate and screenshots_dir not in candidate.parents:
                raise RuntimeError(f"UI screenshot must stay under .openface-maintenance/screenshots: {relative}")
            try:
                content = candidate.read_bytes()
            except OSError as exc:
                raise RuntimeError(f"UI screenshot is missing: {relative}") from exc
            if len(content) > 10 * 1024 * 1024:
                raise RuntimeError(f"UI screenshot is larger than 10 MiB: {relative}")
            if len(content) < 24 or content[:8] != b"\x89PNG\r\n\x1a\n":
                raise RuntimeError(f"UI screenshot is not a valid PNG: {relative}")
            width, height = struct.unpack(">II", content[16:24])
            if width < 200 or height < 200:
                raise RuntimeError(f"UI screenshot is too small to review: {relative} ({width}x{height})")
            screenshots.append(
                UiScreenshot(
                    filename=f"ui-{index + 1}-{candidate.name}"[:240],
                    caption=str(item.get("caption") or candidate.stem)[:240],
                    viewport=str(item.get("viewport") or f"{width}x{height}")[:40],
                    url=str(item.get("url") or "")[:500],
                    width=width,
                    height=height,
                    content=content,
                )
            )
        if not any(shot.width <= 480 for shot in screenshots):
            raise RuntimeError("UI evidence is missing a mobile screenshot (width <= 480px)")
        if not any(shot.width >= 1024 for shot in screenshots):
            raise RuntimeError("UI evidence is missing a desktop screenshot (width >= 1024px)")

        evidence = UiEvidence(
            summary=str(payload.get("summary") or "UI変更を実画面で検証しました。")[:1200],
            tests=tests,
            screenshots=screenshots,
        )
        shutil.rmtree(evidence_root)
        return evidence

    @staticmethod
    def _table_cell(value: str) -> str:
        return " ".join(value.replace("|", "\\|").split())

    def _publish_completion_comment(
        self,
        client: ForgejoClient,
        task: IssueTask,
        profile: AgentProfile,
        pull: PullRequest,
        changed: list[str],
        evidence: UiEvidence | None,
        status: str,
    ) -> tuple[int, str]:
        changed_text = ", ".join(f"`{path}`" for path in changed) or "なし"
        body = (
            f"{profile.emoji} **{profile.display_name}** が担当作業を完了しました。\n\n"
            f"- PR: [#{pull.number}]({pull.url})\n"
            f"- 変更ファイル: {changed_text}\n"
            f"- 実行: Claude Code `/goal` + `{self.settings.model}`\n"
            f"- 状態: {status}"
        )
        if evidence:
            rows = "\n".join(
                f"| {self._table_cell(test.name)} | {self._table_cell(test.viewport)} | ✅ passed | "
                f"{self._table_cell(test.details)} |"
                for test in evidence.tests
            )
            body += (
                f"\n\n### UIテスト\n\n{evidence.summary}\n\n"
                "| テスト | viewport | 結果 | 確認内容 |\n"
                "|---|---:|---|---|\n"
                f"{rows}\n\n### スクリーンショット\n\n添付画像をアップロード中です。"
            )
        comment = client.comment_issue(task.owner, task.repo, task.conversation_number, body)
        comment_id = int(comment["id"])
        if evidence:
            images: list[str] = []
            for shot in evidence.screenshots:
                attachment = client.upload_comment_attachment(
                    task.owner,
                    task.repo,
                    comment_id,
                    shot.filename,
                    shot.content,
                )
                url = str(
                    attachment.get("browser_download_url")
                    or attachment.get("download_url")
                    or attachment.get("url")
                    or ""
                )
                if not url:
                    raise RuntimeError(f"Forgejo returned no URL for UI screenshot {shot.filename}")
                meta = f"{shot.viewport} / PNG {shot.width}x{shot.height}"
                if shot.url:
                    meta += f" / `{shot.url}`"
                images.append(f"**{shot.caption}** — {meta}\n\n![{shot.caption}]({url})")
            body = body.replace("添付画像をアップロード中です。", "\n\n".join(images))
            client.edit_issue_comment(task.owner, task.repo, comment_id, body)
        return comment_id, body

    def _goal_prompt(self, task: IssueTask) -> str:
        profile = AGENTS[task.agent_key]
        follow_up = ""
        if task.follow_up:
            follow_up = f"""
今回の追加指示:
<follow-up>
{task.instruction}
</follow-up>
既存PRのブランチ上で、上記の追加指示に必要な変更を加えてください。
"""
        ui_evidence = ""
        if task.ui_evidence_required:
            ui_evidence = """

UI / アプリ変更の必須証跡:
- 実際にアプリを起動し、変更後の画面を操作して確認する。静的HTMLの推測だけで完了しない。
- モバイル（幅480px以下）とデスクトップ（幅1024px以上）をそれぞれ1枚以上撮影する。
- 撮影には `python /app/capture_ui.py --url <URL> --output <PNG> --width <幅> --height <高さ>` を利用できる。
- `.openface-maintenance/screenshots/` に実画面PNGを保存する。
- `.openface-maintenance/ui-report.json` を次の形で作る。`tests` にはクリック、入力、状態変化、レスポンシブ、横overflow、console/page errorなど、実際に行ったUIテストを具体的に列挙する。
```json
{
  "summary": "実画面で確認した内容の要約",
  "tests": [
    {"name": "タスク追加", "viewport": "390x844", "result": "passed", "details": "追加後に推薦カードへ表示"}
  ],
  "screenshots": [
    {"path": ".openface-maintenance/screenshots/mobile.png", "caption": "モバイルの変更後画面", "viewport": "390x844", "url": "http://127.0.0.1:8080/"},
    {"path": ".openface-maintenance/screenshots/desktop.png", "caption": "デスクトップの変更後画面", "viewport": "1440x1000", "url": "http://127.0.0.1:8080/"}
  ]
}
```
- 全UIテストが `passed` で、2枚のPNGが実在しない限り完了扱いにならない。証跡ディレクトリはPRへcommitせず、Forgejo完了コメントへ添付するためラッパーが回収する。
"""
        return f"""/goal Forgejo Issue #{task.issue_number} をこのリポジトリで完全に解決してください。

あなたは **{profile.display_name}** です。専門領域は「{profile.focus}」です。
専門領域に集中しつつ、Issueを完了させるために必要な範囲では関連ファイルも変更できます。

Issueタイトル: {task.title}
Issue URL: {task.issue_url}
Issue本文:
<issue>
{task.body}
</issue>
{follow_up}
{ui_evidence}

完了条件:
- 実装を決める前に、リポジトリとローカル指示を確認する。
- Issueと追加指示の関連要件を、プロダクション品質で実装する。
- 無関係な挙動を維持し、既存の規約に従う。
- 関連するテスト、lint、ビルド、または絞り込んだ検証を実行する。
- 最終diffを読み直し、見つけた問題を修正する。
- push、PR作成、Forgejo認証情報へのアクセスは行わない。公開はラッパーが担当する。
- 実装と検証が完了した場合のみ終了し、本当にブロックされた場合は理由を明示する。
- 最後の実行結果サマリーは日本語で記述する。
"""

    def _claude_command(self) -> list[str]:
        command = [
            "claude",
            "--model",
            self.settings.model,
            "--dangerously-skip-permissions",
            "--no-session-persistence",
            "--output-format",
            "json",
            "-p",
            self._goal_prompt_placeholder,
        ]
        if getattr(os, "geteuid", lambda: -1)() == 0:
            return ["runuser", "-u", self.settings.claude_user, "--", *command]
        return command

    @property
    def _goal_prompt_placeholder(self) -> str:
        return "__OPENFACE_GOAL_PROMPT__"

    def _run_claude_goal(self, worktree: Path, task: IssueTask) -> str:
        command = self._claude_command()
        command[command.index(self._goal_prompt_placeholder)] = self._goal_prompt(task)
        process = subprocess.run(
            command,
            cwd=worktree,
            env=self.settings.claude_environment(),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=self.settings.goal_timeout_seconds,
        )
        output = process.stdout[-100_000:]
        if process.returncode != 0:
            raise RuntimeError(f"Claude Code /goal failed (exit {process.returncode}): {output[-6000:]}")
        try:
            payload = json.loads(output)
            result = str(payload.get("result") or payload.get("message") or output)
        except json.JSONDecodeError:
            result = output
        if not result.strip():
            raise RuntimeError("Claude Code /goal returned no completion summary")
        return result.strip()[:12_000]

    def _changed_files(self, root: Path) -> list[str]:
        process = subprocess.run(
            ["git", "-c", f"safe.directory={root.resolve()}", "status", "--porcelain=v1", "-z"],
            cwd=root,
            check=True,
            capture_output=True,
            timeout=30,
        )
        entries = process.stdout.decode("utf-8", errors="replace").split("\0")
        changed: list[str] = []
        index = 0
        while index < len(entries):
            entry = entries[index]
            index += 1
            if not entry:
                continue
            path = entry[3:]
            if entry[:2].strip() in {"R", "C"} and index < len(entries):
                path = entries[index]
                index += 1
            changed.append(path.replace("\\", "/"))
        return sorted(set(changed))

    def _validate_worktree(self, root: Path, changed: list[str]) -> None:
        root_resolved = root.resolve()
        for relative in changed:
            candidate = (root / relative).resolve(strict=False)
            if root_resolved != candidate and root_resolved not in candidate.parents:
                raise RuntimeError(f"Claude changed a path outside the cloned repository: {relative}")
        subprocess.run(
            ["git", "-c", f"safe.directory={root.resolve()}", "diff", "--check", "HEAD"],
            cwd=root,
            check=True,
            timeout=60,
        )

    def _pull_body(self, task: IssueTask, summary: str, changed: list[str]) -> str:
        files = "\n".join(f"- `{path}`" for path in changed)
        return f"""## Claude Code `/goal` 実行結果

{summary}

### 変更ファイル

{files}

### 実行環境

- Claude Code組み込みの `/goal` コマンド
- モデル: Z.AIのAnthropic互換エンドポイント経由の `{self.settings.model}`
- 担当: `{AGENTS[task.agent_key].username}`（{AGENTS[task.agent_key].display_name}）
- ラッパー検証: `git diff --check`

Issue #{task.issue_number} を解決します。

> Goalエージェントはクローンしたリポジトリを調査・編集・テストできます。マージ前に人によるレビューが必要です。
"""
