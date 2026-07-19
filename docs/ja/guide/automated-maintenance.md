# GLMによる自動メンテナンス

OpenFaceは、Forgejoで新規作成されたIssueを、このPCのOpen WebUIで利用できるGLMへ渡し、人間がレビューするPull Requestへ変換できます。

## 処理の流れ

1. Forgejoが組織の `issues` webhookへHMAC署名を付けて送信します。
2. `maintenance-agent` が署名を検証し、SQLiteへ配送IDを記録します。
3. `glm-4.7` のplannerが関連ファイルを選び、coderが最小の変更案を作成します。
4. 別のreviewer呼び出しがIssueの明示要件を一つずつ照合し、不足があれば変更案を修正します。
5. 禁止パス、ファイル数、行数、静的構文を検証します。
6. 専用ユーザー `glm-maintainer` が `agent/issue-N` をpushし、PR作成後にIssueへ返信します。
7. 人間がPRを確認してマージまたはクローズします。自動マージ機能はありません。

## ローカルモデルの設定

既存のOpen WebUIエージェント設定を読み取り専用でマウントします。APIキーをGitやCompose環境値へコピーしません。

```dotenv
OPENWEBUI_AGENT_CONFIG=C:/Users/you/AppData/Local/OpenWebUIAgent/config.env
OPEN_WEBUI_BASE_URL=http://host.docker.internal:3000
OPEN_WEBUI_MODEL=glm-4.7
```

```powershell
docker compose up -d --build seed
docker compose up -d --build maintenance-agent
docker compose exec maintenance-agent python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8010/health').read().decode())"
```

seedは次を冪等に作成します。

- 非管理者の `glm-maintainer` ユーザー
- 全リポジトリにwrite権限を持つ専用 `glm-maintainers` チーム
- 共有secret volume内の専用Forgejo token
- ランダムなWebhook HMAC secret
- 組織のIssue webhook

## 起動条件と除外

設定された組織の新規Issueは既定で処理されます。対象外にする場合は次のいずれかをIssue作成時に付けます。

- `agent:skip` ラベル
- `<!-- openface-maintenance:skip -->` マーカー

同じWebhookが再送されてもIssueごとにジョブとPRは一つだけです。ブランチ名は `agent/issue-N` です。

## 安全境界

- Issue本文とリポジトリ本文を信頼できないデータとして扱います。
- token、API key、password、Bearer値らしい文字列を推論前にマスクします。
- `.env*`、credential、secret、鍵、lockfile、CI workflow、Docker Composeは変更できません。
- 既定上限は6ファイル・800差分行です。
- JSON/YAML解析、Python・shell構文検査、`git diff --check` のみ実行します。
- リポジトリのプログラムやテストは実行しないため、Issueからホストコード実行へ到達しません。
- 検証失敗時は一時worktreeを削除し、pushしません。

## 運用確認

```powershell
docker compose ps maintenance-agent
docker compose logs -f maintenance-agent
docker compose exec maintenance-agent python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8010/api/jobs').read().decode())"
```

実E2Eサンプルは [Issue #4](https://madesk.tail8be30.ts.net/git/openface/pages-starter/issues/4) と、GLMが作成した [PR #5](https://madesk.tail8be30.ts.net/git/openface/pages-starter/pulls/5) です。署名配送、3段階GLM処理、1ファイル変更、botによるpush、merge可能なPR、Issueへの逆リンクを確認済みです。

