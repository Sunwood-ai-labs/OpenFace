from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path


class GoalWorkerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        (root / "token").write_text("test-token", encoding="utf-8")
        (root / "secret").write_text("test-secret", encoding="utf-8")
        (root / "openwebui.env").write_text(
            "OPEN_WEBUI_BASE_URL=http://openwebui:3000\n"
            "OPEN_WEBUI_API_KEY=test-key\n"
            "OPEN_WEBUI_DEFAULT_MODEL=glm-4.7\n",
            encoding="utf-8",
        )
        os.environ.update(
            {
                "FORGEJO_TOKEN_FILE": str(root / "token"),
                "WEBHOOK_SECRET_FILE": str(root / "secret"),
                "OPEN_WEBUI_CONFIG_FILE": str(root / "openwebui.env"),
                "MAINTENANCE_DATA_DIR": str(root / "data"),
                "MAINTENANCE_WORKSPACE_DIR": str(root / "work"),
            }
        )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_claude_environment_uses_anthropic_compatible_endpoint(self) -> None:
        from config import Settings

        env = Settings.load().claude_environment()
        self.assertEqual(env["ANTHROPIC_BASE_URL"], "http://openwebui:3000/api")
        self.assertEqual(env["ANTHROPIC_API_KEY"], "test-key")
        self.assertEqual(env["ANTHROPIC_MODEL"], "glm-4.7")
        self.assertNotIn("CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL", env)

    def test_prompt_invokes_builtin_goal_with_completion_conditions(self) -> None:
        from config import Settings
        from worker import IssueTask, MaintenanceWorker

        worker = MaintenanceWorker(Settings.load())
        prompt = worker._goal_prompt(
            IssueTask("openface", "demo", 7, "Fix the page", "Run its tests", "main", "https://example/7")
        )
        self.assertTrue(prompt.startswith("/goal "))
        self.assertIn("Issue #7", prompt)
        self.assertIn("Run the relevant tests", prompt)
        self.assertIn("Finish only", prompt)

    def test_command_uses_claude_code_and_not_bounded_json_planner(self) -> None:
        from config import Settings
        from worker import MaintenanceWorker

        command = MaintenanceWorker(Settings.load())._claude_command()
        self.assertIn("claude", command)
        self.assertIn("--dangerously-skip-permissions", command)
        self.assertNotIn("--json-schema", command)


if __name__ == "__main__":
    unittest.main()
