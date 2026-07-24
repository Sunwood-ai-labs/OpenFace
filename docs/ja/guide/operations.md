---
title: 運用
type: guide
description: バックアップ、更新、セキュリティ確認、日常保守を実施します。
readingTime: 9分
tags: [運用, セキュリティ, バックアップ]
related:
  - title: プラットフォーム地図
    link: /ja/wiki/platform-map
  - title: トラブルシューティング
    link: /ja/guide/troubleshooting
---

# 運用

## 設定

`.env.example` を `.env` にコピーします。

| 変数 | 用途 |
|---|---|
| `OPENFACE_ADMIN_USER` | 初期Forgejo administrator |
| `OPENFACE_ADMIN_PASSWORD` | 初期password。共有前に変更必須 |
| `PUBLIC_BASE_URL` | Forgejoと埋め込みlinkが使うgateway URL |
| `OPENFACE_HTTPS_PORT` | ホストのHTTPS port |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | 内部PostgreSQL 3 DBが使うcredential |
| `DISABLE_REGISTRATION` | `true` でpublic self-registrationを停止 |
| `MAX_RUNNING_SPACES` | Spaceの最大同時起動数 |
| `IDLE_TIMEOUT_MINUTES` | 無操作停止。`0` で無効 |

## バックアップ

`forgejo`、`openface_metrics`、`openface_maintenance` のPostgreSQL dumpを作成します。さらに `openface_forgejo-data`、`openface_agent-metrics-data`、`openface_maintenance-agent-data`、`openface_shared-token`、`openface_forgejo-runner-data` のnamed volumeをバックアップします。実運用前にrestoreも試してください。

Proxmox環境では [Proxmox LXCへの配備](./proxmox-lxc) も参照してください。

## TLS

証明書がない場合、gatewayは自己署名の開発用証明書を生成します。共有環境ではtrusted certificateを `gateway/certs/cert.pem`、private keyを `gateway/certs/key.pem` に置き、`.env` の公開URLとportを合わせて再起動します。

## セキュリティ境界

OpenFaceは信頼できるローカルまたはprivate network向けです。堅牢なmulti-tenant sandboxではありません。Space runnerはホストDockerを制御できるため、実行可能リポジトリを作成・変更できるのはtrusted maintainerに限定してください。

registrationを閉じ、初期passwordを変更し、Dockerfileを確認し、backupを保護してください。tokenを含むlogやclone URLは共有しないでください。

## 運用コマンド

```bash
docker compose ps
docker compose logs --tail=200 gateway frontend forgejo spaces-runner
docker compose up -d --build
docker compose down
```
