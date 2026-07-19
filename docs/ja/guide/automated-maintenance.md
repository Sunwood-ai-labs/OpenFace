# Claude Code `/goal` による自動メンテナンス

OpenFaceはForgejoで新規作成されたIssueを、Claude Code組み込みの `/goal` へ渡し、人間がレビューするPull Requestへ変換できます。Claude CodeはZ.AIのAnthropic互換endpointへ直接接続し、`glm-5.2` を使います。

## 処理の流れ

1. Forgejoが組織の `issues` webhookへHMAC署名を付けて送信します。
2. `maintenance-agent` が署名を検証し、配送IDをSQLiteへ記録します。
3. 対象リポジトリをcloneし、`agent/issue-N` ブランチを作ります。
4. Claude Code 2.1.205へ、Issueと完了条件を含む本物の `/goal` を渡します。
5. Claude Codeがローカル指示・ソースを調査し、必要なファイルを編集し、テストやbuildを実行し、diffを再確認して、goal evaluatorが完了するまで作業します。
6. root wrapperがclone外への逸脱がないことと `git diff --check` を確認します。
7. 専用ユーザー `glm-maintainer` がcommit・push・PR作成・Issue返信を行います。
8. 人間がPRを確認してマージまたはクローズします。自動マージ経路はありません。

固定のplanner/coder JSON pipelineではありません。ファイル数・変更行数の上限を設けず、Claude Code `/goal` の自由度を維持します。

## Z.AIの設定

```dotenv
ZAI_AGENT_CONFIG=C:/Users/you/AppData/Local/OpenFace/zai.env
ZAI_ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
MAINTENANCE_MODEL=glm-5.2
MAINTENANCE_GOAL_TIMEOUT_SECONDS=3600
```

```powershell
docker compose up -d --build seed
docker compose up -d --build maintenance-agent
docker compose exec maintenance-agent claude --version
docker compose exec maintenance-agent python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8010/health').read().decode())"
```

seedは非管理者 `glm-maintainer`、write専用組織team、専用Forgejo token、Webhook HMAC secret、Issue webhookを冪等に作成します。

## 起動条件と除外

設定された組織の新規Issueは既定で処理されます。対象外にする場合は作成時に次のいずれかを付けます。

- `agent:skip` ラベル
- `<!-- openface-maintenance:skip -->` マーカー

同じ配送が再送されてもIssueごとにジョブとPRは一つです。ブランチ名は `agent/issue-N` です。

## 自由度と隔離境界

- Claude Codeは専用保守コンテナ内の非特権 `maintainer` ユーザーで動きます。
- clone内は書き込み可能で、通常のClaude Code tool、ローカル指示、build、test、lintを利用できます。
- ホストDocker socketを渡さないため、リポジトリのコマンドからホストDocker daemonは操作できません。
- Forgejo bot tokenとWebhook secretはroot専用の `0600` で、Claude Codeから読めません。
- 推論に必要なモデルAPI credentialだけはClaude Code processへ渡します。
- wrapperはclone外に解決されるパスを拒否し、公開前に `git diff --check` を要求します。
- Forgejo認証を持つのは公開処理を行うroot wrapperだけです。
- botに管理者権限・自動マージ経路はなく、人間のレビューが必須です。

この方式は保守コンテナ内でリポジトリのコードを実行します。任意の第三者コードに対するホストsecurity sandboxではありません。

## 運用確認

```powershell
docker compose ps maintenance-agent
docker compose logs -f maintenance-agent
docker compose exec maintenance-agent python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8010/api/jobs').read().decode())"
```

サービス再起動時に未完了だった `queued` / `running` ジョブは、誤って実行中表示を残さず `interrupted` になります。

## 確認済み実E2E

[Issue #10](https://madesk.tail8be30.ts.net/git/openface/pages-starter/issues/10) から [PR #11](https://madesk.tail8be30.ts.net/git/openface/pages-starter/pulls/11) が作成されました。次をAPIとログで照合済みです。

- job detail: `Running Claude Code /goal with glm-4.7`
- author: `glm-maintainer`
- branch: `agent/issue-10` → `main`
- 変更ファイル: `README.md`、`index.html`
- IssueコメントからPR #11への逆リンク
- Forgejoのmergeable判定: `true`
