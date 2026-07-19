from __future__ import annotations

import importlib
import json
import os
import tempfile
import unittest
from pathlib import Path


class SafetyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        (root / "token").write_text("test-token", encoding="utf-8")
        (root / "secret").write_text("test-secret", encoding="utf-8")
        (root / "openwebui.env").write_text("OPEN_WEBUI_API_KEY=test-key\n", encoding="utf-8")
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

    def test_rejects_path_traversal_and_workflows(self) -> None:
        from config import Settings
        from worker import MaintenanceWorker

        worker = MaintenanceWorker(Settings.load())
        for path in ("../secret", ".github/workflows/pwn.yml", ".env", ".env.local", "credentials.json", "docker-compose.yml"):
            with self.assertRaises(ValueError, msg=path):
                worker._safe_path(path)

    def test_glm_json_fence_is_parsed(self) -> None:
        from glm import _parse_json

        self.assertEqual(_parse_json('```json\n{"ok": true}\n```'), {"ok": True})

    def test_prompt_secrets_are_redacted(self) -> None:
        from worker import redact_for_prompt

        value = redact_for_prompt("API_KEY=abc123456789\nAuthorization: Bearer token-value-123456")
        self.assertNotIn("abc123456789", value)
        self.assertNotIn("token-value-123456", value)


if __name__ == "__main__":
    unittest.main()
