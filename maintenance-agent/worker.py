from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from agents import AGENTS
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
            changed = self._changed_files(worktree)
            if not changed and task.agent_key == "review" and existing:
                agent_client = ForgejoClient(self.settings, self.settings.agent_token_file(profile.username))
                try:
                    agent_client.comment_issue(
                        task.owner, task.repo, task.conversation_number,
                        f"{profile.emoji} **{profile.display_name}** が独立レビューを完了しました。\n\n"
                        f"{summary}\n\n変更が必要な問題は見つからなかったため、追加コミットはありません。",
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
            merged = False
            if self.settings.auto_merge:
                forgejo.merge_pull(task.owner, task.repo, pull.number)
                merged = True
            agent_client = ForgejoClient(self.settings, self.settings.agent_token_file(profile.username))
            try:
                agent_client.comment_issue(
                    task.owner,
                    task.repo,
                    task.conversation_number,
                    f"{profile.emoji} **{profile.display_name}** が担当作業を完了しました。\n\n"
                    f"- PR: [#{pull.number}]({pull.url})\n"
                    f"- 変更ファイル: {', '.join(f'`{path}`' for path in changed)}\n"
                    f"- 実行: Claude Code `/goal` + `{self.settings.model}`\n"
                    f"- 状態: {'自動マージ済み' if merged else '人間レビュー待ち'}",
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
