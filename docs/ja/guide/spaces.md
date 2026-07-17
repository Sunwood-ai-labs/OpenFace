# Docker Spaces

Spaceは、`space` topicとroot `Dockerfile`を持つForgejoリポジトリです。コンテナはport `7860`でlistenし、frameworkが対応している場合はOpenFaceのpath prefixを受け入れます。

## アプリの種類

seedにはGradio、静的HTML、React、Vue、Next.js、Streamlit、FastAPI、Node.jsの例があります。固定allowlistではなく、container化してproxyできるCPU向けWebサーバーなら利用できます。

## カード情報

README frontmatterでタイトル、絵文字、SDK、tagsを指定します。

```yaml
---
title: Local audio utility
emoji: "🎧"
sdk: docker
tags:
  - audio
  - utility
---
```

Forgejo topicの `space` はカタログ種別を決めます。READMEの `tags` はカード内の分類であり、topicの代わりにはなりません。

## 実行動作

- `IDLE_TIMEOUT_MINUTES=0` ならCPU Spaceを常時起動できます。
- 同時起動数は既定24で、`MAX_RUNNING_SPACES` で変更できます。
- 上限時は最終アクセスが最も古いSpaceを停止してから新しいSpaceを起動します。
- 停止中のpublic Spaceは **On demand** と表示し、write権限を持つログイン済みmaintainerが起動できます。
- ブラウザ閲覧とagent API操作は同じ永続metrics storeに記録します。

## セキュリティ警告

runnerは `/var/run/docker.sock` をmountします。悪意あるDockerfileはDocker hostを制御できます。全Spaceを確認し、runner hostを破棄可能な隔離環境にしない限り、リポジトリ作成者を信頼できるユーザーに限定してください。
