from __future__ import annotations

import os
import hashlib
import hmac
import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class GoalWorkerTests(unittest.TestCase):
    def test_browser_image_installs_japanese_and_emoji_fonts(self) -> None:
        dockerfile = (Path(__file__).parents[1] / "Dockerfile").read_text(encoding="utf-8")

        self.assertIn("fonts-noto-cjk", dockerfile)
        self.assertIn("fonts-noto-color-emoji", dockerfile)

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
                "MAINTENANCE_AUTO_MERGE": "true",
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
        self.assertTrue(Settings.load().auto_merge)
        with patch.dict(os.environ, {"MAINTENANCE_MAX_WORKERS": "99"}):
            self.assertEqual(Settings.load().max_workers, 4)

    def test_forgejo_merge_uses_guarded_server_side_merge(self) -> None:
        from config import Settings
        from forgejo import ForgejoClient

        client = ForgejoClient(Settings.load())
        client._request = Mock()
        client.merge_pull("openface", "demo", 7, expected_head_sha="abc123")
        client._request.assert_called_once_with(
            "POST",
            "/repos/openface/demo/pulls/7/merge",
            json={
                "Do": "merge",
                "delete_branch_after_merge": True,
                "head_commit_id": "abc123",
            },
        )
        client.close()

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

    def test_pull_request_conversation_can_reply_separately_from_source_issue(self) -> None:
        from worker import IssueTask

        task = IssueTask(
            "openface", "demo", 18, "レビュー", "元Issue", "main", "https://example/18",
            follow_up=True, instruction="レビューしてください", agent_key="review", reply_number=19,
        )
        self.assertEqual(task.branch, "agent/issue-18")
        self.assertEqual(task.conversation_number, 19)

    def test_maintainer_mention_is_the_user_entrypoint(self) -> None:
        from agents import maintainer_instruction, mentions_maintainer

        self.assertTrue(mentions_maintainer("@glm-maintainer モバイルの余白をスクショで確認して"))
        self.assertEqual(
            maintainer_instruction("@glm-maintainer モバイルの余白をスクショで確認して"),
            "モバイルの余白をスクショで確認して",
        )

    def test_specialist_mention_does_not_override_maintainer_routing(self) -> None:
        from agents import assign_agent

        profile = assign_agent("READMEを更新", "@coding-agent アプリのテストを修正してください")
        self.assertEqual(profile.username, "docs-agent")

    def test_initial_issue_classifier_prefers_docs_then_design_then_code(self) -> None:
        from agents import choose_agent

        self.assertEqual(choose_agent("READMEを更新", "再構築手順" ).key, "docs")
        self.assertEqual(choose_agent("モバイルUI", "CSSの余白を直す").key, "designer")
        self.assertEqual(choose_agent("API追加", "JSON endpointを実装").key, "coding")

    def test_ui_task_detection_covers_designer_and_app_work(self) -> None:
        from agents import AGENTS, is_ui_task

        self.assertTrue(is_ui_task("API", "JSONだけ", AGENTS["designer"]))
        self.assertTrue(is_ui_task("アプリ画面", "ボタンを直す", AGENTS["coding"]))
        self.assertFalse(is_ui_task("API", "JSON endpoint", AGENTS["coding"]))

    def test_maintainer_delegation_visibly_mentions_the_specialist(self) -> None:
        from agents import AGENTS, delegation_comment

        message = delegation_comment(
            AGENTS["docs"],
            "READMEと再構築手順を更新してください",
            follow_up=False,
        )
        self.assertIn("@docs-agent 次の作業を担当してください", message)
        self.assertIn("READMEと再構築手順", message)
        self.assertIn("担当アカウント自身", message)

    def test_delegation_announcement_precedes_worker_submission(self) -> None:
        import main
        from worker import IssueTask

        main.database_path = Path(self.temp.name) / "enqueue-order.sqlite3"
        main.initialize_database()
        events: list[str] = []
        task = IssueTask("openface", "demo", 42, "README", "更新", "main", "https://example/42", agent_key="docs")
        with patch.object(main.executor, "submit", side_effect=lambda *args: events.append("submit")):
            queued = main.enqueue(
                task,
                "delivery-order",
                allow_retry=False,
                announce=lambda: events.append("mention"),
            )
        self.assertTrue(queued)
        self.assertEqual(events, ["mention", "submit"])

    def test_new_issue_without_maintainer_mention_is_not_started(self) -> None:
        import main
        from config import Settings
        from fastapi.testclient import TestClient

        payload = {
            "action": "opened",
            "sender": {"login": "human-user"},
            "repository": {
                "name": "demo",
                "default_branch": "main",
                "owner": {"login": "openface"},
            },
            "issue": {"number": 50, "title": "UI修正", "body": "余白を直して", "labels": []},
        }
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        signature = hmac.new(b"test-secret", raw, hashlib.sha256).hexdigest()
        with patch.object(main, "settings", Settings.load()), patch.object(main, "enqueue") as enqueue:
            response = TestClient(main.app).post(
                "/webhooks/forgejo",
                content=raw,
                headers={
                    "Content-Type": "application/json",
                    "X-Forgejo-Event": "issues",
                    "X-Forgejo-Delivery": "no-maintainer",
                    "X-Forgejo-Signature": signature,
                },
            )
        self.assertEqual(response.status_code, 202)
        self.assertFalse(response.json()["accepted"])
        enqueue.assert_not_called()

    def test_maintainer_mention_starts_ui_job_and_chooses_specialist(self) -> None:
        import main
        from config import Settings
        from fastapi.testclient import TestClient

        payload = {
            "action": "opened",
            "sender": {"login": "human-user"},
            "repository": {
                "name": "demo",
                "default_branch": "main",
                "owner": {"login": "openface"},
            },
            "issue": {
                "number": 51,
                "title": "モバイルUI修正",
                "body": "@glm-maintainer ボタン余白を直してスクショで確認して",
                "labels": [],
            },
        }
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        signature = hmac.new(b"test-secret", raw, hashlib.sha256).hexdigest()
        with patch.object(main, "settings", Settings.load()), patch.object(
            main, "enqueue", return_value=True
        ) as enqueue:
            response = TestClient(main.app).post(
                "/webhooks/forgejo",
                content=raw,
                headers={
                    "Content-Type": "application/json",
                    "X-Forgejo-Event": "issues",
                    "X-Forgejo-Delivery": "with-maintainer",
                    "X-Forgejo-Signature": signature,
                },
            )
        self.assertEqual(response.status_code, 202)
        self.assertTrue(response.json()["accepted"])
        self.assertEqual(response.json()["agent"], "designer-agent")
        self.assertTrue(response.json()["ui_evidence_required"])
        task = enqueue.call_args.args[0]
        self.assertEqual(task.agent_key, "designer")
        self.assertTrue(task.ui_evidence_required)

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

    def test_ui_prompt_requires_real_mobile_and_desktop_evidence(self) -> None:
        from config import Settings
        from worker import IssueTask, MaintenanceWorker

        task = IssueTask(
            "openface", "demo", 8, "UI修正", "余白を直す", "main", "https://example/8",
            agent_key="designer", ui_evidence_required=True,
        )
        prompt = MaintenanceWorker(Settings.load())._goal_prompt(task)
        self.assertIn("/app/capture_ui.py", prompt)
        self.assertIn("ui-report.json", prompt)
        self.assertIn("モバイル", prompt)
        self.assertIn("デスクトップ", prompt)
        self.assertIn("実際に行ったUIテスト", prompt)

    def test_ui_evidence_requires_passed_tests_and_two_real_png_sizes(self) -> None:
        from config import Settings
        from worker import IssueTask, MaintenanceWorker

        root = Path(self.temp.name) / "repo"
        shots = root / ".openface-maintenance" / "screenshots"
        shots.mkdir(parents=True)

        def png(width: int, height: int) -> bytes:
            return b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + struct.pack(">II", width, height)

        (shots / "mobile.png").write_bytes(png(390, 844))
        (shots / "desktop.png").write_bytes(png(1440, 1000))
        report = {
            "summary": "追加と横overflowを確認",
            "tests": [
                {"name": "タスク追加", "viewport": "390x844", "result": "passed", "details": "推薦へ表示"}
            ],
            "screenshots": [
                {"path": ".openface-maintenance/screenshots/mobile.png", "caption": "mobile"},
                {"path": ".openface-maintenance/screenshots/desktop.png", "caption": "desktop"},
            ],
        }
        (root / ".openface-maintenance" / "ui-report.json").write_text(
            json.dumps(report), encoding="utf-8"
        )
        task = IssueTask(
            "openface", "demo", 9, "UI", "fix", "main", "https://example/9",
            ui_evidence_required=True,
        )
        evidence = MaintenanceWorker(Settings.load())._collect_ui_evidence(root, task)
        self.assertIsNotNone(evidence)
        self.assertEqual([shot.width for shot in evidence.screenshots], [390, 1440])
        self.assertFalse((root / ".openface-maintenance").exists())

    def test_ui_evidence_is_mandatory_for_ui_tasks(self) -> None:
        from config import Settings
        from worker import IssueTask, MaintenanceWorker

        root = Path(self.temp.name) / "repo"
        root.mkdir()
        task = IssueTask(
            "openface", "demo", 9, "UI", "fix", "main", "https://example/9",
            ui_evidence_required=True,
        )
        with self.assertRaisesRegex(RuntimeError, "ui-report.json"):
            MaintenanceWorker(Settings.load())._collect_ui_evidence(root, task)

    def test_ui_evidence_accepts_safe_screenshot_names(self) -> None:
        from config import Settings
        from worker import IssueTask, MaintenanceWorker

        root = Path(self.temp.name) / "repo-name-evidence"
        shots = root / ".openface-maintenance" / "screenshots"
        shots.mkdir(parents=True)

        def png(width: int, height: int) -> bytes:
            return b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + struct.pack(">II", width, height)

        (shots / "mobile.png").write_bytes(png(390, 844))
        (shots / "desktop.png").write_bytes(png(1440, 1000))
        (root / ".openface-maintenance" / "ui-report.json").write_text(
            json.dumps({
                "summary": {"verdict": "passed", "configs_tested": 2},
                "tests": [{"name": "操作", "result": "passed", "details": "実ブラウザで確認"}],
                "screenshots": [
                    {"name": "mobile.png", "caption": "mobile", "viewport": "390x844"},
                    {"name": "desktop.png", "caption": "desktop", "viewport": "1440x1000"},
                ],
            }),
            encoding="utf-8",
        )
        task = IssueTask(
            "openface", "demo", 10, "UI", "fix", "main", "https://example/10",
            ui_evidence_required=True,
        )
        evidence = MaintenanceWorker(Settings.load())._collect_ui_evidence(root, task)
        self.assertEqual([shot.width for shot in evidence.screenshots], [390, 1440])
        self.assertIn('\"verdict\": \"passed\"', evidence.summary)

    def test_review_prompt_is_read_only_strict_and_sha_bound(self) -> None:
        from config import Settings
        from forgejo import PullRequest
        from worker import IssueTask, MaintenanceWorker

        task = IssueTask(
            "openface", "demo", 12, "モバイルUI", "余白と操作を直す", "main",
            "https://example/12", agent_key="designer", ui_evidence_required=True,
        )
        prompt = MaintenanceWorker(Settings.load())._review_prompt(
            task, PullRequest(13, "https://forgejo/pr/13", "abc123"), ["index.html"], "abc123"
        )
        self.assertIn("review-agent", prompt)
        self.assertIn("コードを修正、commit、pushしてはいけません", prompt)
        self.assertIn("critical/high/medium", prompt)
        self.assertIn("モバイル", prompt)
        self.assertIn("デスクトップ", prompt)
        self.assertIn("PNG実寸幅480px以下", prompt)
        self.assertIn("撮影しただけでJSONから漏らさない", prompt)
        self.assertIn('"reviewed_sha": "abc123"', prompt)

    def test_review_report_rejects_false_approval(self) -> None:
        from config import Settings
        from worker import IssueTask, MaintenanceWorker

        root = Path(self.temp.name) / "review"
        evidence = root / ".openface-maintenance"
        evidence.mkdir(parents=True)
        report = {
            "verdict": "approved",
            "reviewed_sha": "abc123",
            "summary": "問題なし",
            "requirements": [{"name": "ボタン", "result": "failed", "evidence": "クリック不能"}],
            "checks": [{"name": "test", "result": "passed", "evidence": "1 passed"}],
            "findings": [],
        }
        (evidence / "review-report.json").write_text(json.dumps(report), encoding="utf-8")
        task = IssueTask("openface", "demo", 12, "UI", "fix", "main", "https://example/12")
        result = MaintenanceWorker(Settings.load())._collect_review_evidence(root, task, "abc123")
        self.assertEqual(result.verdict, "rejected")
        self.assertIn("安全側へ差し戻し", result.summary)

    def test_review_report_is_bound_to_current_head_sha(self) -> None:
        from config import Settings
        from worker import IssueTask, MaintenanceWorker

        root = Path(self.temp.name) / "review-sha"
        evidence = root / ".openface-maintenance"
        evidence.mkdir(parents=True)
        report = {
            "verdict": "approved",
            "reviewed_sha": "old-sha",
            "summary": "問題なし",
            "requirements": [{"name": "要件", "result": "passed", "evidence": "diff確認"}],
            "checks": [{"name": "test", "result": "passed", "evidence": "exit 0"}],
            "findings": [],
        }
        (evidence / "review-report.json").write_text(json.dumps(report), encoding="utf-8")
        task = IssueTask("openface", "demo", 12, "API", "fix", "main", "https://example/12")
        with self.assertRaisesRegex(RuntimeError, "current PR head SHA"):
            MaintenanceWorker(Settings.load())._collect_review_evidence(root, task, "new-sha")

    def test_auto_merge_requires_approved_current_head_review(self) -> None:
        from config import Settings
        from forgejo import PullRequest
        from worker import IssueTask, MaintenanceWorker, ReviewCheck, ReviewEvidence

        worker = MaintenanceWorker(Settings.load())
        task = IssueTask("openface", "demo", 12, "UI", "fix", "main", "https://example/12")
        pull = PullRequest(13, "https://forgejo/pr/13", "abc123")
        check = ReviewCheck("要件", "passed", "根拠")
        approved = ReviewEvidence("approved", "abc123", "承認", [check], [check], [], [])
        rejected = ReviewEvidence("rejected", "abc123", "却下", [check], [check], [], [])
        client = Mock()
        client.pull_head_sha.return_value = "abc123"

        self.assertFalse(worker._merge_if_approved(client, task, pull, rejected))
        client.merge_pull.assert_not_called()
        self.assertTrue(worker._merge_if_approved(client, task, pull, approved))
        client.merge_pull.assert_called_once_with(
            "openface", "demo", 13, expected_head_sha="abc123"
        )

    def test_auto_merge_refuses_stale_reviewer_approval(self) -> None:
        from config import Settings
        from forgejo import PullRequest
        from worker import IssueTask, MaintenanceWorker, ReviewCheck, ReviewEvidence

        check = ReviewCheck("要件", "passed", "根拠")
        review = ReviewEvidence("approved", "reviewed-sha", "承認", [check], [check], [], [])
        task = IssueTask("openface", "demo", 12, "UI", "fix", "main", "https://example/12")
        client = Mock()
        client.pull_head_sha.return_value = "changed-after-review"
        with self.assertRaisesRegex(RuntimeError, "stale approval"):
            MaintenanceWorker(Settings.load())._merge_if_approved(
                client, task, PullRequest(13, "https://forgejo/pr/13"), review
            )
        client.merge_pull.assert_not_called()

    def test_maintainer_review_delegation_mentions_separate_reviewer(self) -> None:
        from agents import AGENTS, review_delegation_comment

        body = review_delegation_comment(
            AGENTS["designer"], 13, "https://forgejo/pr/13", ui_review_required=True
        )
        self.assertIn("@review-agent", body)
        self.assertIn("OpenFace Designer", body)
        self.assertIn("承認されるまで自動マージしません", body)
        self.assertIn("モバイル／デスクトップ", body)

    def test_completion_comment_uploads_and_embeds_ui_screenshots(self) -> None:
        from agents import AGENTS
        from config import Settings
        from forgejo import PullRequest
        from worker import IssueTask, MaintenanceWorker, UiEvidence, UiScreenshot, UiTestResult

        client = Mock()
        client.comment_issue.return_value = {"id": 42}
        client.upload_comment_attachment.side_effect = [
            {"browser_download_url": "https://forgejo/attachments/mobile.png"},
            {"browser_download_url": "https://forgejo/attachments/desktop.png"},
        ]
        evidence = UiEvidence(
            "実操作済み",
            [UiTestResult("追加", "390x844", "passed", "推薦カードへ表示")],
            [
                UiScreenshot("mobile.png", "モバイル", "390x844", "http://app", 390, 844, b"png"),
                UiScreenshot("desktop.png", "デスクトップ", "1440x1000", "http://app", 1440, 1000, b"png"),
            ],
        )
        task = IssueTask("openface", "demo", 10, "UI", "fix", "main", "https://example/10")
        comment_id, body = MaintenanceWorker(Settings.load())._publish_completion_comment(
            client, task, AGENTS["designer"], PullRequest(11, "https://forgejo/pr/11"),
            ["css/styles.css"], evidence, "検証済み・マージ処理中",
        )
        self.assertEqual(comment_id, 42)
        self.assertIn("### UIテスト", body)
        self.assertIn("推薦カードへ表示", body)
        self.assertIn("![モバイル](https://forgejo/attachments/mobile.png)", body)
        self.assertEqual(client.upload_comment_attachment.call_count, 2)
        client.edit_issue_comment.assert_called_once()

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
