---
layout: home

hero:
  name: OpenFace
  text: ローカルで育てるAIコミュニティ。
  tagline: モデル、データセット、Docker Spaces、Skills、MCPs、バージョン管理されたPrompts、静的Pagesを、1つのForgejo基盤で運用します。
  image:
    src: /openface.svg
    alt: OpenFace
  actions:
    - theme: brand
      text: はじめる
      link: /ja/guide/getting-started
    - theme: alt
      text: GitHubで見る
      link: https://github.com/Sunwood-ai-labs/OpenFace

features:
  - icon: 🧱
    title: 1つのComposeスタック
    details: Gateway、Next.js、Forgejo、Space runner、seed、Forgejo Actionsをまとめて起動します。
  - icon: 🚀
    title: Dockerfile前提のSpaces
    details: Gradio、HTML、React、Vue、Next.js、Streamlit、FastAPI、Node.jsなどのCPUアプリを埋め込めます。
  - icon: 📚
    title: Gitベースのカタログ
    details: モデル、データセット、Skills、MCPs、Promptsは、ファイル・履歴・tag・clone URLを持つ通常のリポジトリです。
  - icon: 🌐
    title: OpenFace Pages
    details: gh-pagesまたはdocsから静的サイトを公開し、VitePressは隔離されたActions runnerでビルドできます。
---

## ダミーカタログではなく、実リポジトリを動かす

OpenFaceはForgejoにソースとメタデータを保持し、検索・一覧用ポータルとDockerアプリ実行環境を加えます。CPU Spaceはローカルで起動し、ポータル、Git UI、埋め込みアプリ、API、Pagesを同じHTTPS gatewayから公開します。

![OpenFace ホーム](../images/openface-home.png)

まず[導入手順](./guide/getting-started.md)を実施し、他ユーザーにDockerfileの公開を許可する前に[セキュリティ境界](./guide/operations.md#セキュリティ境界)を確認してください。
