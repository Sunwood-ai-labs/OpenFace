# Claude Code `/goal` による自動メンテナンス

OpenFaceはForgejoで新規作成されたIssueを、Claude Code組み込みの `/goal` へ渡し、人間がレビューするPull Requestへ変換できます。Claude CodeはZ.AIのAnthropic互換endpointへ直接接続し、`glm-5.2` を使います。

## 処理の流れ

1. Forgejoが組織の `issues`、`issue_comment`、`pull_request_comment` webhookへHMAC署名を付けて送信します。
2. `maintenance-agent` が署名を検証し、配送IDをSQLiteへ記録します。
3. 対象リポジトリをcloneし、`agent/issue-N` ブランチを作ります。
4. Claude Code 2.1.205へ、Issueと完了条件を含む本物の `/goal` を渡します。
5. Claude Codeがローカル指示・ソースを調査し、必要なファイルを編集し、テストやbuildを実行し、diffを再確認して、goal evaluatorが完了するまで作業します。
6. root wrapperがclone外への逸脱がないことと `git diff --check` を確認します。
7. `glm-maintainer` が内容を分類し、専門エージェントへ委任します。担当エージェントがcommit・push・Issue返信を行います。
8. 人間がPRを確認してマージまたはクローズします。自動マージ経路はありません。

固定のplanner/coder JSON pipelineではありません。ファイル数・変更行数の上限を設けず、Claude Code `/goal` の自由度を維持します。

## Z.AIの設定

```dotenv
ZAI_AGENT_CONFIG=C:/Users/you/AppData/Local/OpenFace/zai.env
ZAI_ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
MAINTENANCE_MODEL=glm-5.2
MAINTENANCE_GOAL_TIMEOUT_SECONDS=3600
MAINTENANCE_MAX_WORKERS=2
```

```powershell
docker compose up -d --build seed
docker compose up -d --build maintenance-agent
docker compose exec maintenance-agent claude --version
docker compose exec maintenance-agent python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8010/health').read().decode())"
```

seedは非管理者 `glm-maintainer`、write専用組織team、専用Forgejo token、Webhook HMAC secret、Issue webhookを冪等に作成します。

## 専門エージェントへの委任

新規Issueは司令塔が内容から担当を自動選択します。コメントで担当を明示することもできます。

```text
@designer-agent モバイル画面をスクリーンショット比較して余白を修正してください
@coding-agent APIへJSONレスポンスを追加し、テストしてください
@docs-agent READMEとVitePressの再構築手順を更新してください
@review-agent 現在のPRを独立レビューし、問題があれば修正してください
```

| メンション | 担当 |
|---|---|
| `@designer-agent` | UI/UX、テーマ、レスポンシブ、アクセシビリティ、スクリーンショット比較 |
| `@coding-agent` | 実装、リファクタリング、テスト、ビルド |
| `@docs-agent` | README、VitePress、設定例、再構築手順、リンク |
| `@review-agent` | diff、テスト、セキュリティ、回帰、要件充足の独立レビュー |

1コメントでは1体だけ指定します。複数メンションは曖昧な指令として実行されません。同じIssueが処理中の間は追加ジョブを投入せず、別Issueは `MAINTENANCE_MAX_WORKERS` の範囲で並列処理します。担当一覧は `GET /api/agents`、担当を含むジョブ状態は `GET /api/jobs` で確認できます。

司令塔と4体の専門担当は、それぞれ独立したForgejoユーザーです。seedはアカウントごとに最小権限tokenを発行し、役割ごとに個別生成したキャラクターを無地背景の中央に配置した専用アバターを設定します。workerを開始する前に、`glm-maintainer` は選択した専門担当へのメンションコメントを必ず投稿します。投稿に失敗した場合はDBのジョブ予約も取り消すため、会話に現れない裏側だけの実行は始まりません。保存用の[Issue #21](https://madesk.tail8be30.ts.net/git/openface/pages-starter/issues/21)では、司令塔のメンションから専門担当の完了返信までを順番に確認できます。各プロフィールと会話の撮影結果は [`docs/evidence/agents`](../../evidence/agents/README.md) にあります。

## 起動条件と除外

設定された組織の新規Issueは既定で処理されます。対象外にする場合は作成時に次のいずれかを付けます。

- `agent:skip` ラベル
- `<!-- openface-maintenance:skip -->` マーカー

同じ配送が再送されてもIssueごとにジョブとPRは一つです。ブランチ名は `agent/issue-N` です。

### コメントから追加編集する

元Issueまたはエージェントが作成したPRへ、追加指示を `/goal` から始めるか、専門エージェントをメンションして投稿します。

```text
/goal 見出しも日本語にしてください。ほかのファイルは変更しないでください。
```

エージェントは既存の `agent/issue-N` ブランチをcheckoutし、日本語の完了プロンプトで追加編集と検証を行い、同じPRへ新しいcommitをpushします。通常の議論コメントはモデルを起動しません。同じIssueが `queued` または `running` の間は再投入せず、完了後のコメントだけを受け付けます。

PRで起動した場合も作業ブランチは元Issueの `agent/issue-N` を維持し、処理中リアクションと完了返信は指示を投稿したPR側へ返します。これにより依頼と結果が同じ会話内に残ります。

Issueのリアクションは、👍 が人による賛同、👀 が保守エージェントの処理中、🚀 が公開成功、😕 が公開前の失敗・停止を示します。

最大 `MAINTENANCE_MAX_WORKERS` 件のIssueを並列処理します。ジョブごとにcloneと `agent/issue-N` ブランチを分離しますが、同じ箇所を編集したPR同士では通常のGit競合が発生し得ます。ホストやモデルproviderの過負荷を避けるため、設定値は1〜4に制限されます。

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

[Issue #12](https://madesk.tail8be30.ts.net/git/openface/pages-starter/issues/12) の日本語 `/goal` コメントから既存の [PR #15](https://madesk.tail8be30.ts.net/git/openface/pages-starter/pulls/15) を更新しました。次をAPIとログで照合済みです。

- job detailとClaudeの完了summary: 日本語、モデル `glm-5.2`
- author: `glm-maintainer`
- branch: `agent/issue-12` → `main`
- 重複PRではなく、既存PRへcommit `1a505ce` を追加
- 追加commitの変更: `docs/concurrency-probe-a.md` の1ファイルだけ
- 日本語のIssue返信からPR #15への逆リンク
- Forgejoのmergeable判定: `true`
