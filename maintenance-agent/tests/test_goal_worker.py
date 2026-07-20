from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class GoalWorkerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        (root / "token").write_text("test-token", encoding="utf-8")
        (root / "secret").write_text("test-secret", encoding="utf-8")
        os.environ.update(
            {
                "FORGEJO_TOKEN_FILE": str(root / "token"),
                "WEBHOOK_SECRET_FILE": str(root / "secret"),
                "ZAI_ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
                "ZAI_API_KEY": "test-key",
                "MAINTENANCE_MODEL": "glm-5.2",
                "MAINTENANCE_MAX_WORKERS": "2",
                "MAINTENANCE_DATA_DIR": str(root / "data"),
                "MAINTENANCE_WORKSPACE_DIR": str(root / "work"),
            }
        )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_claude_environment_uses_anthropic_compatible_endpoint(self) -> None:
        from config import Settings

        env = Settings.load().claude_environment()
        self.assertEqual(env["ANTHROPIC_BASE_URL"], "https://api.z.ai/api/anthropic")
        self.assertEqual(env["ANTHROPIC_AUTH_TOKEN"], "test-key")
        self.assertEqual(env["ANTHROPIC_MODEL"], "glm-5.2")
        self.assertEqual(env["ANTHROPIC_DEFAULT_HAIKU_MODEL"], "glm-4.5-air")
        self.assertEqual(env["ANTHROPIC_DEFAULT_SONNET_MODEL"], "glm-5.2")
        self.assertEqual(env["CLAUDE_CODE_AUTO_COMPACT_WINDOW"], "1000000")
        self.assertNotIn("CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL", env)

    def test_worker_concurrency_is_bounded(self) -> None:
        from config import Settings

        self.assertEqual(Settings.load().max_workers, 2)
        with patch.dict(os.environ, {"MAINTENANCE_MAX_WORKERS": "99"}):
            self.assertEqual(Settings.load().max_workers, 4)

    def test_prompt_invokes_builtin_goal_with_completion_conditions(self) -> None:
        from config import Settings
        from worker import IssueTask, MaintenanceWorker

        worker = MaintenanceWorker(Settings.load())
        prompt = worker._goal_prompt(
            IssueTask("openface", "demo", 7, "Fix the page", "Run its tests", "main", "https://example/7")
        )
        self.assertTrue(prompt.startswith("/goal "))
        self.assertIn("Issue #7", prompt)
        self.assertIn("関連するテスト", prompt)
        self.assertIn("実行結果サマリーは日本語", prompt)

    def test_follow_up_prompt_includes_comment_instruction(self) -> None:
        from config import Settings
        from worker import IssueTask, MaintenanceWorker

        task = IssueTask(
            "openface", "demo", 7, "ページ修正", "最初の要件", "main", "https://example/7",
            follow_up=True, instruction="見出しも日本語にしてください",
        )
        prompt = MaintenanceWorker(Settings.load())._goal_prompt(task)
        self.assertIn("今回の追加指示", prompt)
        self.assertIn("見出しも日本語にしてください", prompt)
        self.assertIn("既存PRのブランチ上", prompt)

    def test_specialist_mention_routes_one_agent_and_removes_mention(self) -> None:
        from agents import mention_instruction, mentioned_agent

        profile = mentioned_agent("@designer-agent モバイルの余白をスクショで確認して")
        self.assertIsNotNone(profile)
        self.assertEqual(profile.key, "designer")
        self.assertEqual(
            mention_instruction("@designer-agent モバイルの余白をスクショで確認して", profile),
            "モバイルの余白をスクショで確認して",
        )

    def test_ambiguous_specialist_mentions_are_rejected(self) -> None:
        from agents import mentioned_agent

        self.assertIsNone(mentioned_agent("@designer-agent と @coding-agent で対応して"))

    def test_initial_issue_classifier_prefers_docs_then_design_then_code(self) -> None:
        from agents import choose_agent

        self.assertEqual(choose_agent("READMEを更新", "再構築手順" ).key, "docs")
        self.assertEqual(choose_agent("モバイルUI", "CSSの余白を直す").key, "designer")
        self.assertEqual(choose_agent("API追加", "JSON endpointを実装").key, "coding")

    def test_specialist_prompt_contains_role_contract(self) -> None:
        from config import Settings
        from worker import IssueTask, MaintenanceWorker

        task = IssueTask(
            "openface", "demo", 8, "UI修正", "余白を直す", "main", "https://example/8",
            agent_key="designer",
        )
        prompt = MaintenanceWorker(Settings.load())._goal_prompt(task)
        self.assertIn("OpenFace Designer", prompt)
        self.assertIn("スクリーンショット比較", prompt)

    def test_command_uses_claude_code_and_not_bounded_json_planner(self) -> None:
        from config import Settings
        from worker import MaintenanceWorker

        command = MaintenanceWorker(Settings.load())._claude_command()
        self.assertIn("claude", command)
        self.assertIn("--dangerously-skip-permissions", command)
        self.assertNotIn("--json-schema", command)

    def test_root_git_scopes_safe_directory_to_the_clone(self) -> None:
        from config import Settings
        from worker import MaintenanceWorker

        root = Path(self.temp.name) / "repo"
        root.mkdir()
        client = Mock()
        client.git_environment.return_value = os.environ.copy()
        client.token = "secret"
        completed = Mock(returncode=0, stdout="ok")
        with patch("worker.subprocess.run", return_value=completed) as run:
            MaintenanceWorker(Settings.load())._git(client, root, "status", "--short")
        command = run.call_args.args[0]
        self.assertEqual(command[:3], ["git", "-c", f"safe.directory={root.resolve()}"])

    def test_changed_file_scan_scopes_safe_directory_to_the_clone(self) -> None:
        from config import Settings
        from worker import MaintenanceWorker

        root = Path(self.temp.name) / "repo"
        root.mkdir()
        completed = Mock(returncode=0, stdout=b" M README.md\0")
        with patch("worker.subprocess.run", return_value=completed) as run:
            changed = MaintenanceWorker(Settings.load())._changed_files(root)
        self.assertEqual(changed, ["README.md"])
        self.assertEqual(
            run.call_args.args[0][:3],
            ["git", "-c", f"safe.directory={root.resolve()}"],
        )

    def test_repeated_reaction_conflict_is_idempotent(self) -> None:
        from config import Settings
        from forgejo import ForgejoClient

        with patch("forgejo.httpx.Client") as client_type:
            response = Mock(status_code=409)
            client_type.return_value.post.return_value = response
            client = ForgejoClient(Settings.load())
            client.react_to_issue("openface", "demo", 7, "eyes")
        response.raise_for_status.assert_not_called()


if __name__ == "__main__":
    unittest.main()
