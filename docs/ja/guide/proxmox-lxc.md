---
title: Proxmox LXCへの配備
type: guide
description: Proxmox LXC内でOpenFaceをDocker ComposeとPostgreSQLにより運用します。
readingTime: 10分
tags: [proxmox, lxc, docker, postgresql]
related:
  - title: アーキテクチャ
    link: /ja/guide/architecture
  - title: 運用
    link: /ja/guide/operations
---

# Proxmox LXCへの配備

検証済み構成では、専用のUbuntu 24.04 privileged LXCを使います。OpenFace
自体はLXC内の1つのDocker Composeプロジェクトとして動き、Proxmoxがリソース
制限、スナップショット、ホスト起動時の自動起動を担当します。

## 検証済みプロファイル

| 設定 | 値 |
|---|---|
| LXC ID / hostname | `101` / `openface` |
| CPU / memory / swap | 6 cores / 8 GiB / 4 GiB |
| root disk | `local-lvm` 上の80 GiB |
| network | `vmbr0`、DHCP |
| container mode | privileged |
| features | `nesting=1,keyctl=1` |
| boot | `onboot=1` |

OpenFace SpacesはDocker imageとcontainerを動的に作るため、nested Dockerが
必要です。`/etc/pve/lxc/<VMID>.conf` に次を追加してLXCを再起動します。

```ini
features: nesting=1,keyctl=1
lxc.apparmor.profile: unconfined
lxc.cgroup2.devices.allow: a
lxc.cap.drop:
```

このLXCだけ隔離を緩和します。信頼済みのアプリケーションホストとして扱い、
信頼できないユーザーにSpaceのDockerfileを公開させないでください。

## Runtimeの導入

LXC内で実行します。

```bash
apt-get update
apt-get install -y ca-certificates curl git openssh-server rsync
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker ssh
docker run --rm alpine echo nested-docker-ok
```

OpenFaceをcloneして起動します。

```bash
git clone https://github.com/Sunwood-ai-labs/OpenFace.git /opt/openface
cd /opt/openface
cp .env.example .env
sed -i 's|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://<LXC-IP>:8443|' .env
docker compose up -d --build
```

`https://<LXC-IP>:8443` を開きます。自己署名証明書を受け付けないローカル
WebViewでは `http://<LXC-IP>:8090` も利用できます。

## PostgreSQLによる永続化

ComposeはPostgreSQL 17を1サービス起動し、用途別に3 DBを作成します。

| Database | 保存内容 |
|---|---|
| `forgejo` | repository、user、Issue、PR、Actions metadata |
| `openface_metrics` | browser/agent view、like、agent identity |
| `openface_maintenance` | webhook deliveryとmaintenance job |

Git repository本体、LFS object、token、agent credential、runner登録はnamed
Docker volumeに残ります。PostgreSQLとnamed volumeの両方をバックアップします。

```bash
docker exec openface-postgres pg_dump -U openface -Fc forgejo \
  -f /tmp/forgejo.dump
docker exec openface-postgres pg_dump -U openface -Fc openface_metrics \
  -f /tmp/openface_metrics.dump
docker exec openface-postgres pg_dump -U openface -Fc openface_maintenance \
  -f /tmp/openface_maintenance.dump
```

`scripts/restore_lxc_deployment.sh` は、準備済みcheckoutへ3つのdumpとnamed
volume archiveを復元します。secretは `.env` と選択したZ.AI環境ファイルにだけ
保存し、Gitにはcommitしません。

## 実機検証

移行後にrepository 105件、Issue 53件、repository view 280行、maintenance job
25件を確認しました。QR Code Generator SpaceをLXC内でbuild・起動し、LXCを
完全再起動した後も `running` へ自動復帰しています。

| LAN上のホーム | 実行中のDocker Space |
|---|---|
| ![Proxmox LXCから配信したOpenFaceホーム](../../evidence/proxmox-lxc/home-lan.png) | ![Proxmox LXC内で実行中のQR Code Generator](../../evidence/proxmox-lxc/qr-space-running.png) |

