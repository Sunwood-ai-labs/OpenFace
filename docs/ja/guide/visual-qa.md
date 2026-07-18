# 開発エージェント向けVisual QA

OpenFaceでは、スクリーンショットを装飾ではなくテスト証跡として扱います。Visual QA workflowは実際のDocker Compose環境を起動し、シード完了を待ち、代表的なDocker Spaceを起動したうえで、主要な全ページ種別をデスクトップとモバイルで撮影します。

## パケットの内容

GitHub Actionsの各 `openface-visual-qa-*` artifactには次が入ります。

| パス | 用途 |
|---|---|
| `AGENT_REVIEW.md` | 画面ごとの確認観点を含む、人間／エージェント向け画像一覧 |
| `manifest.json` | URL、遷移先、viewport、HTTP状態、title、見出し、横はみ出し、ブラウザエラー、失敗request、自動検出結果 |
| `screenshots/*.png` | デスクトップ／モバイルの全ページ画像 |
| `diagnostics/` | 失敗時を含むCompose状態とログ |

生成artifactはGitに含めません。GitHub Actionsで14日保持し、撮影対象の定義は `visual-tests/routes.mjs` でバージョン管理します。

## エージェントの確認手順

1. 対象commitのartifactをダウンロードします。
2. `AGENT_REVIEW.md` を読み、すべての画像を開きます。
3. 指定された観点に沿って、切れ、ぼやけ、重なり、asset欠損、誤遷移、古いruntime状態、誤解を招くlabel、spacing不整合、mobile崩れを確認します。
4. `manifest.json` で、画像上の問題とHTTP失敗、console error、request失敗、横はみ出し量を対応付けます。
5. 問題ごとに画像ファイル名、目視できる根拠、期待結果、影響componentを記載します。

GitHub CLIでは次のように取得できます。

```bash
gh run list --workflow visual-qa.yml --limit 5
gh run download RUN_ID --name openface-visual-qa-RUN_ID --dir visual-review
```

HTTP 200やmanifestのPASSだけでUIタスクを完了にしてはいけません。必ずPNGを目視します。

## ローカル実行

OpenFaceを起動してから実行します。

```bash
npm ci --prefix visual-tests
npm exec --prefix visual-tests -- playwright install chromium
npm run capture --prefix visual-tests
npm run capture:themes --prefix visual-tests
npm run capture:scroll --prefix visual-tests
```

`capture:themes` は30ルートを3テーマ・PC／モバイルで描画し、180枚の全ページ画像を作ります。`capture:scroll` は同じルートの上・中・下に加え、遅れて描画される Dataset Viewer、Inference Providers、両組織の Team members へ直接スクロールし、564枚のviewport画像と66枚のcontact sheetを作ります。

出力先は `visual-tests/artifacts/` です。部分実行もできます。

```powershell
$env:VISUAL_QA_ROUTES = 'spaces,space-app'
$env:VISUAL_QA_VIEWPORTS = 'desktop'
npm run capture --prefix visual-tests
```

## 対象画面を増やす

新しいuser-facing route、または見た目が大きく異なる状態を追加したら、`visual-tests/routes.mjs` に登録します。詳細画面には安定したシードrepositoryを使い、次のエージェントが画像の目的を判断できる具体的な `focus` を書いてください。

撮影は、遷移失敗、HTTP error、repository not found、未処理page error、横はみ出し、埋め込みapp停止、Space runtime表示の矛盾、Cyberpunk内に残った大きな明色surfaceをFAILにします。console errorと失敗requestは、単独でFAILにしない場合も確認情報として保存します。
