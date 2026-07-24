---
title: アーキテクチャ
type: guide
description: Composeサービス、信頼境界、永続化モデルを理解します。
readingTime: 6分
tags: [アーキテクチャ, compose, セキュリティ]
related:
  - title: プラットフォーム地図
    link: /ja/wiki/platform-map
  - title: ローカルAI Hubをつくる理由
    link: /ja/articles/local-first-hub
---

# アーキテクチャ

OpenFaceはHTTP/HTTPS gatewayだけを公開し、アプリケーションサービスをComposeのprivate networkに置きます。

| サービス | 役割 |
|---|---|
| `gateway` | nginxルーティング、TLS終端、WebSocket proxy、単一のWeb公開口 |
| `frontend` | Next.js製の検索・一覧ポータルとリポジトリ表示 |
| `forgejo` | Git、LFS、認証、権限、Issues、Pull Requests、Actionsメタデータ |
| `postgres` | Forgejo、metrics、自動保守状態を保存するPostgreSQL |
| `spaces-runner` | Space検証、clone、Docker build/run、metrics API、proxy、Pages配信 |
| `seed` | admin、token、組織、サンプル、カタログ、Prompt tagの冪等な初期化 |
| `forgejo-actions-runner` | 隔離したDocker-in-Docker上でPages workflowを実行 |

## ルーティング

- ポータルとリポジトリ画面はfrontendへ送ります。
- `/git/` はForgejo、`/run/{owner}/{repo}/` はSpace、`/pages/{owner}/{repo}/` はPagesへ送ります。
- `/runner-api/` はgateway経由でrunner APIを公開します。

## 状態の保存

Forgejo metadata、metrics、自動保守jobは3つのPostgreSQL databaseへ保存します。Git repository本体、LFS object、runner登録、共有control token、agent credentialはnamed Docker volumeへ保存します。Space imageとbuild cacheはDockerが管理します。Gitリポジトリには構成、UI、テンプレート、ドキュメントだけを置き、本番secretは置きません。

## 信頼モデル

一覧公開範囲はForgejoのvisibilityに従います。Space操作はForgejoユーザーのwrite権限を確認します。frontendとrunnerは内部control tokenを共有し、agent APIはhash化された別credentialを使います。Actions runnerは専用Docker daemonを使い、ホストのDocker socketを受け取りません。
