from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

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

    @property
    def branch(self) -> str:
        return f"agent/issue-{self.issue_number}"


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
        worktree = self.settings.workspace_dir / f"{task.owner}-{task.repo}-{task.issue_number}"
        try:
            existing = forgejo.existing_pull(task.owner, task.repo, task.branch)
            if existing:
                return AgentResult(existing, "An existing maintenance PR was reused.", [])
            if worktree.exists():
                shutil.rmtree(worktree)
            self.settings.workspace_dir.mkdir(parents=True, exist_ok=True)
            self._git(
                forgejo,
                None,
                "clone",
                "--branch",
                task.default_branch,
                forgejo.clone_url(task.owner, task.repo),
                str(worktree),
            )
            self._git(forgejo, worktree, "checkout", "-b", task.branch)
            base_revision = self._git(forgejo, worktree, "rev-parse", "HEAD").strip()
            self._prepare_goal_workspace(worktree)

            summary = self._run_claude_goal(worktree, task)

            # Claude is asked not to commit, but normalize any local commits it made.
            current_revision = self._git(forgejo, worktree, "rev-parse", "HEAD").strip()
            if current_revision != base_revision:
                self._git(forgejo, worktree, "reset", "--soft", base_revision)
            changed = self._changed_files(worktree)
            self._validate_worktree(worktree, changed)

            self._git(forgejo, worktree, "config", "user.name", "Claude Goal Maintainer")
            self._git(forgejo, worktree, "config", "user.email", "glm-maintainer@agents.openface.local")
            self._git(forgejo, worktree, "add", "--all")
            self._git(forgejo, worktree, "commit", "-m", f"fix: resolve issue #{task.issue_number}")
            self._git(forgejo, worktree, "push", "origin", f"HEAD:refs/heads/{task.branch}")
            pull = forgejo.create_pull(
                task.owner,
                task.repo,
                task.default_branch,
                task.branch,
                f"[Claude Goal + GLM] {task.title}",
                self._pull_body(task, summary, changed),
            )
            forgejo.comment_issue(
                task.owner,
                task.repo,
                task.issue_number,
                f"🤖 Claude Code `/goal` completed with `{self.settings.model}` and created "
                f"PR #{pull.number}: {pull.url}\n\n"
                f"Changed: {', '.join(f'`{path}`' for path in changed)}",
            )
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
        return f"""/goal Resolve Forgejo Issue #{task.issue_number} in this repository completely.

Issue title: {task.title}
Issue URL: {task.issue_url}
Issue body:
<issue>
{task.body}
</issue>

Completion condition:
- Inspect the repository and its local instructions before deciding the implementation.
- Implement every relevant requirement in the Issue with production-quality changes.
- Preserve unrelated behavior and use the repository's existing conventions.
- Run the relevant tests, linters, builds, or focused verification available in the repository.
- Re-read the resulting diff and fix problems you find.
- Do not push, open a Pull Request, or access Forgejo credentials; the wrapper handles publication.
- Finish only when the implementation and verification are complete, or clearly report a genuine blocker.
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
        if not changed:
            raise RuntimeError("Claude Code /goal completed without producing a git diff")
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
        return f"""## Claude Code `/goal` result

{summary}

### Changed files

{files}

### Execution

- Claude Code built-in `/goal` command
- Model: `{self.settings.model}` through the local Open WebUI Anthropic-compatible endpoint
- Publication: least-privilege `glm-maintainer` Forgejo account
- Wrapper check: `git diff --check`

Closes #{task.issue_number}

> The goal agent can inspect, edit, and test the cloned repository freely. Human review is required before merge.
"""
