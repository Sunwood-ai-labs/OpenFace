# アーキテクチャ

OpenFaceはHTTP/HTTPS gatewayだけを公開し、アプリケーションサービスをComposeのprivate networkに置きます。

| サービス | 役割 |
|---|---|
| `gateway` | nginxルーティング、TLS終端、WebSocket proxy、単一のWeb公開口 |
| `frontend` | Next.js製の検索・一覧ポータルとリポジトリ表示 |
| `forgejo` | Git、LFS、認証、権限、Issues、Pull Requests、Actionsメタデータ |
| `spaces-runner` | Space検証、clone、Docker build/run、metrics API、proxy、Pages配信 |
| `seed` | admin、token、組織、サンプル、カタログ、Prompt tagの冪等な初期化 |
| `forgejo-actions-runner` | 隔離したDocker-in-Docker上でPages workflowを実行 |

## ルーティング

- ポータルとリポジトリ画面はfrontendへ送ります。
- `/git/` はForgejo、`/run/{owner}/{repo}/` はSpace、`/pages/{owner}/{repo}/` はPagesへ送ります。
- `/runner-api/` はgateway経由でrunner APIを公開します。

## 状態の保存

Forgejo、runner登録、共有control token、agent metricsはnamed Docker volumeに保存します。Space imageとbuild cacheはDockerが管理します。Gitリポジトリには構成、UI、テンプレート、ドキュメントだけを置き、本番secretは置きません。

## 信頼モデル

一覧公開範囲はForgejoのvisibilityに従います。Space操作はForgejoユーザーのwrite権限を確認します。frontendとrunnerは内部control tokenを共有し、agent APIはhash化された別credentialを使います。Actions runnerは専用Docker daemonを使い、ホストのDocker socketを受け取りません。
