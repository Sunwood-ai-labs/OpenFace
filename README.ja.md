# OpenFace

<p align="center">
  <a href="README.md">English</a> · <strong>日本語</strong> · <a href="https://sunwood-ai-labs.github.io/OpenFace/ja/">ドキュメント</a>
</p>

セルフホスト版 HuggingFace ライクなプラットフォームです。Forgejo（Git + LFS）を土台に、HuggingFace 風の Web ポータルと、Dockerfile ベースのアプリ（Spaces）をその場でビルド・実行できるランナーを組み合わせています。`docker compose up -d --build` だけで、自分の LAN / サーバー内に「モデル・データセット・Spaces・Skill・MCP・バージョン管理された Prompt」を公開できる場所を丸ごと立ち上げられます。

<p align="center">
  <img src="docs/images/openface-home.png" alt="OpenFace のホーム画面" width="100%">
</p>

計画: Claude Fable 5 / 実装: Claude Sonnet 5

## ✨ プロジェクト概要

OpenFace は次のサービスで構成されています。

| サービス | 役割 | 内部ポート |
|---|---|---|
| `gateway` | nginx リバースプロキシ（唯一の公開口） | 80/443 (公開: 8090/8443) |
| `frontend` | HF風ポータル (Next.js + Tailwind) | 3000 |
| `forgejo` | 改造版 Forgejo（Git + LFS + API + 認証） | 3000 (http), 22 (ssh) |
| `spaces-runner` | Docker Space のビルド・起動・プロキシ (FastAPI + Docker SDK) | 8000 |
| `seed` | 初回起動時に admin ユーザーとサンプルrepoを作成する one-shot ジョブ | - |
| `forgejo-actions-runner` | VitePressなどの静的サイトをビルドする Forgejo Actions Runner | - |
| `forgejo-actions-dind` | Actionsジョブ専用の隔離 Docker daemon | 2375（内部のみ） |

### 編集可能な組織アカウント

初期seedは、静的な見本ではなく実在するForgejo組織 `openface` と、天使をテーマにした架空のAI Safety組織 `seraphim-labs` を作成します。OpenFace側は `openface-admin`、`aiko-mesh`、`ren-vector`、`mira-signal`、Seraphim Labs側は専用の架空メンバー `aurelia-vale`、`cassian-reed`、`ilyana-noor`、`lucien-sol` がOwnerチームに所属します。Seraphimの4名には、それぞれ異なるフォトリアル調の生成アバターを設定しています。**Edit organization** から組織名・説明・アバター・メンバー・チーム・リポジトリ設定を編集でき、公開プロフィールの説明はForgejo Organization APIの値を読み直して表示します。生成プロンプト一式は [docs/evidence/organization/seraphim-avatar-prompts.md](docs/evidence/organization/seraphim-avatar-prompts.md) に保存しています。

| OpenFace | Seraphim Labs | Owner設定 |
|---|---|---|
| <img src="docs/images/openface-organization-mobile.png" alt="新しいシンプルなロゴを使ったOpenFace組織ページ" width="240"> | <img src="docs/images/seraphim-labs-organization-mobile.png" alt="天使の翼と光輪を使ったSeraphim Labs組織ページ" width="240"> | <img src="docs/images/seraphim-labs-owner-settings-mobile.png" alt="編集可能なSeraphim Labs組織設定" width="240"> |

<img src="docs/images/seraphim-labs-team-mobile.png" alt="4名の異なるフォトリアル調架空メンバーを表示したSeraphim Labsチーム" width="390">

<img src="docs/images/seraphim-angel-team-portraits.png" alt="光輪と白い翼を持つAurelia Vale、Cassian Reed、Ilyana Noor、Lucien Solのフォトリアル調天使ポートレート" width="640">

リポジトリの種別（モデル / データセット / Space / Skill / MCP / Prompt）は Forgejo の **topics**（`model` / `dataset` / `space` / `skill` / `mcp` / `prompt`）で判定します。Prompt のリポジトリ名・URLは版に依存しない安定slug（例: `mystic-git-auto-commit`）に固定し、個別版は `version-v4.2` のような追加 topic と同名のGit tagで管理します。版を更新してもリポジトリ名・clone URL・参照先を変更する必要はありません。各詳細カードはリポジトリ直下の `README.md` を使い、相対画像もローカル Forgejo の実ファイルから表示します。

### アーキテクチャ図

```mermaid
flowchart LR
    User((ユーザー<br/>ブラウザ / git / lfs))

    subgraph Docker["docker compose (openface network)"]
        Gateway["gateway<br/>nginx :8090→:80"]
        Frontend["frontend<br/>Next.js :3000"]
        Forgejo["forgejo<br/>Git/LFS/API :3000, ssh:22"]
        Runner["spaces-runner<br/>FastAPI :8000"]
        ActionsRunner["Forgejo Actions Runner<br/>VitePress build"]
        ActionsDind["Actions DIND<br/>isolated Docker"]
        Seed["seed<br/>(one-shot)"]
        SpaceA["Space container<br/>Docker app :7860"]
        SpaceB["Space container<br/>Docker app :7860"]

        Gateway -- "/ , /models, /datasets, /spaces, /skills, /mcps, /prompts, /:owner/:repo/*" --> Frontend
        Gateway -- "/git/" --> Forgejo
        Gateway -- "/run/ (WebSocket対応)" --> Runner
        Gateway -- "/runner-api/ → /api/" --> Runner
        Gateway -- "/pages/{owner}/{repo}/" --> Runner
        Frontend -- "Forgejo API" --> Forgejo
        Runner -- "docker.sock 経由でbuild/run/proxy" --> SpaceA
        Runner -- "docker.sock 経由でbuild/run/proxy" --> SpaceB
        ActionsRunner -- "job containers" --> ActionsDind
        ActionsRunner -- "push gh-pages" --> Forgejo
        Seed -- "初回admin作成 + サンプルrepo投入" --> Forgejo
    end

    User -- ":8090" --> Gateway
```

## 📸 スクリーンショット

以下はローカルで起動した OpenFace の実画面です。Spaces は CPU 上で稼働し、Gradio に加えて静的 HTML、React、Vue、Next.js、Streamlit、FastAPI、Node.js などの Dockerfile ベースのアプリを同じ画面内で公開できます。

| Spaces ディレクトリ | 埋め込みアプリ |
|---|---|
| <img src="docs/images/openface-spaces.png" alt="CPU で稼働中の Space が並ぶ OpenFace の Spaces ディレクトリ" width="100%"> | <img src="docs/images/openface-space-app.png" alt="OpenFace 内に埋め込まれた React Space" width="100%"> |

| ホーム | リポジトリの Files 画面 |
|---|---|
| <img src="docs/images/openface-home.png" alt="モデル、Space、データセットを表示する OpenFace のホーム画面" width="100%"> | <img src="docs/images/openface-files.png" alt="OpenFace の Space リポジトリにある Files 画面" width="100%"> |

### テーマ切替

ヘッダー右上のテーマセレクタから、標準・**Solarpunk**・**Cyberpunk** を即時に切り替えられます。選択はブラウザの `localStorage` に保存され、次回アクセス時も最初の描画から復元されます。スマートフォンではナビゲーションメニュー内に同じセレクタを表示します。

| Standard | Solarpunk | Cyberpunk |
|---|---|---|
| <img src="docs/evidence/themes/standard-home.png" alt="Standard テーマの OpenFace ホーム" width="100%"> | <img src="docs/evidence/themes/solarpunk-home.png" alt="Solarpunk テーマの OpenFace ホーム" width="100%"> | <img src="docs/evidence/themes/cyberpunk-home.png" alt="Cyberpunk テーマの OpenFace ホーム" width="100%"> |

テーマセレクタの実操作・永続化・各画面の確認結果は [Theme verification evidence](docs/evidence/themes/README.md) に記録しています。

### Skills / MCPs

Sunwood AI Labs の公開 GitHub リポジトリから、実ファイルとコミット履歴を含む Skill 10件・MCPサーバー10件を取り込みます。名前だけのダミーではなく、Skill は `SKILL.md`、MCP はサーバー実装と依存定義を検証済みです。

| Skills | MCPs |
|---|---|
| <img src="docs/evidence/skills-mcps/skills-directory.png" alt="実在するSkill 10件を表示するOpenFace Skills一覧" width="100%"> | <img src="docs/evidence/skills-mcps/mcps-directory.png" alt="実在するMCPサーバー10件を表示するOpenFace MCP一覧" width="100%"> |

| ホームのAgent tooling | Skill詳細 |
|---|---|
| <img src="docs/evidence/skills-mcps/home-agent-tooling.png" alt="SkillsとMCPsを追加したOpenFaceホーム" width="100%"> | <img src="docs/evidence/skills-mcps/skill-detail.png" alt="実READMEと相対画像を表示するSkill詳細" width="100%"> |

選定根拠と検証結果は [Skill / MCP verification evidence](docs/evidence/skills-mcps/README.md) にまとめています。

### Community / Issues

Forgejo のIssueとPull RequestをOpenFaceのCommunity導線として扱います。初期seedはQR Code Generator Spaceに実Issueを4件作成し、一覧・詳細・フィルター・認証付き作成導線を再構築直後から検証できます。さらに、Luna Scout（調査）、Patch Orbit（実装）、Mikan Reviewer（レビュー）の仮想エージェント3体が実ユーザーとして議論します。10件のサンプルコメントは再seedしても重複せず、そのまま検証用データとして残ります。Issue #4では引用、各種リスト、タスクリスト、コードブロック、表、リンク、メンション、折りたたみなどのMarkdown表示も検証できます。

| Issue一覧 | Issue詳細 |
|---|---|
| <img src="docs/evidence/community-ui/issues-list-desktop.png" alt="OpenFace CommunityのIssue一覧" width="100%"> | <img src="docs/evidence/community-ui/issue-detail-desktop.png" alt="OpenFace CommunityのIssue詳細" width="100%"> |

デスクトップ／モバイルのスクリーンショット、ルート確認、レスポンシブ検証結果は [Community / Issue UI verification](docs/evidence/community-ui/README.md) を参照してください。

### OpenFace Pages

公開リポジトリの静的サイトを、GitHub Pages と同じ感覚で公開できます。リポジトリ詳細に **OpenFace Pages** カードが表示され、`Visit site` からそのまま開けます。

| リポジトリ詳細の公開導線 | 実際に配信された静的ページ |
|---|---|
| <img src="docs/evidence/pages/repository-pages-card.png" alt="gh-pages を検出して Visit site を表示するリポジトリ詳細" width="100%"> | <img src="docs/evidence/pages/pages-starter-live.png" alt="OpenFace Pages が実際に配信した pages-starter の静的ページ" width="100%"> |

仕様とアクセス制御を含む検証記録は [OpenFace Pages verification evidence](docs/evidence/pages/README.md) を参照してください。

VitePress は Forgejo Actions でビルドして `gh-pages` へ自動公開できます。実際に `main` へのpushから作られたページは以下です。

<img src="docs/evidence/pages/vitepress-actions-live.png" alt="Forgejo ActionsでビルドされOpenFace Pagesから配信されたVitePressサイト" width="100%">

初期seedには、用途別のPages例も含まれます。

| リポジトリ | 配信元 | 例 |
|---|---|---|
| `openface/pages-starter` | `gh-pages` | 最小の1ファイルHTML |
| `openface/pages-portfolio` | `gh-pages` | 外部CSS・JavaScriptを読む静的ポートフォリオ |
| `openface/pages-docs-fallback` | `main/docs` | `gh-pages` なしで配信する複数ページのドキュメント |
| `openface/vitepress-pages-starter` | Forgejo Actions → `gh-pages` | pushでビルド・公開されるVitePress |

| HTML + CSS + JavaScript | `docs/` フォールバック |
|---|---|
| <img src="docs/evidence/pages/pages-portfolio-live.png" alt="外部CSSとJavaScriptを読み込んで動作するOpenFace Pagesの静的ポートフォリオ" width="100%"> | <img src="docs/evidence/pages/pages-docs-fallback-live.png" alt="mainのdocsディレクトリから公開された複数ページのドキュメントサイト" width="100%"> |

### Sorting

Spaceの「Most liked」は、表示中のカードだけでなく全public Spaceをmetricsで順位付けしてからページ分割します。実操作・全件照合・スクリーンショットは [Space sorting verification](docs/evidence/sorting/README.md) に記録しています。

### Prompts

`/prompts` は、Prompt をそのまま Forgejo リポジトリとして管理するカタログです。リポジトリslugには `-v1` などを含めず、`PROMPT.md` に原文、`README.md` に閲覧用カードと出典、`SOURCE.md` に追跡情報を置きます。版は `version-v*` topic と同名のGit tag（例: `v1` / `v4` / `v4.2`）としてseed時に作成され、一覧の版フィルターも実在topicから自動生成されます。個別に branch・tag・fork・差分比較を行えます。初期 seed は MysticLibrary 由来 10件と、MIT ライセンスの Goal / planning コマンド由来 10件を取り込みます。

Prompt詳細の **Revision history** では、`Latest` と実在するGit tagをその場で切り替えられます。tag選択時はそのtagに固定された `PROMPT.md` 原文を表示し、URLは `?revision=v4.1` のように直接共有できます。存在しないrevisionは実行せず、安全にLatestへ戻ります。

| Prompt一覧 | 個別版の詳細 |
|---|---|
| <img src="docs/evidence/prompts/prompts-directory.png" alt="安定slugの20件と動的なVersion tagsを表示する OpenFace Prompt一覧" width="100%"> | <img src="docs/evidence/prompts/prompt-detail-version.png" alt="安定slugと v4.2 topic・版バッジを表示する OpenFace Prompt詳細" width="100%"> |

出典・ライセンス・再現検証は [Prompt verification evidence](docs/evidence/prompts/README.md) にまとめています。

#### Prompt revision switching

| v4.1 tag | v4.2 tag |
| --- | --- |
| <img src="docs/evidence/prompts/prompt-revision-v4-1.png" alt="Prompt詳細でv4.1 Git tagを選択しV4.1原文を表示" width="100%"> | <img src="docs/evidence/prompts/prompt-revision-v4-2.png" alt="同じPrompt詳細からv4.2 Git tagへ切り替えV4.2原文を表示" width="100%"> |

## ⚙️ Spacesのスケーラビリティ

サービスやDBを増やさず、現在のDocker Compose・Forgejo・SQLite構成のまま、リポジトリ数が増えても一覧処理量がほぼ一定になるようにしています。

- 一覧は **48件単位**。`/spaces?page=2` の形式で前後移動できます。
- カードの閲覧数・いいね数は **1回のバッチAPI**、Docker状態は **`/runner-api/spaces` 1回**で取得します。
- Space絵文字用READMEは現在ページの最大48件だけを対象に、既定 **5分間**メモリキャッシュします。
- 同時起動は既定 **24件**。25件目を開くと自動起動し、最終アクセスが最も古いSpaceを1件だけ停止します。
- 停止中のSpaceは `Paused` ではなく **`On demand`** と表示します。

実ブラウザでの検証画像とリクエスト数の記録は [Spaces scalability verification evidence](docs/evidence/scalability/README.md) にまとめています。

## ✅ 必要要件

- Docker
- Docker Compose (v2, `docker compose` サブコマンド)

それ以外の依存関係は全て compose がビルドするコンテナ内に閉じています。

## 🚀 クイックスタート

```bash
cp .env.example .env
# 必要なら .env を編集（admin資格情報、公開URLなど）

docker compose up -d --build
```

起動後、ブラウザで [https://localhost:8443](https://localhost:8443) を開いてください。自己署名証明書を受け付けないモバイルのアプリ内ブラウザでは、証明書不要の [http://localhost:8090](http://localhost:8090) も利用できます。

### LAN・Tailscaleから開く

同じLANの端末からは、`.env` の `PUBLIC_BASE_URL` を `http://<PCのLAN IP>:8090` に変更してComposeを再起動します。Windows Defender FirewallでDocker DesktopのPrivateネットワーク受信が許可されていない環境では、管理者PowerShellで次を一度実行します。

```powershell
.\scripts\allow-lan-firewall.ps1
```

自己署名証明書やルーターの端末分離を避ける場合は、PCと閲覧端末を同じTailnetへ参加させます。Windows版Tailscaleをインストールしてログイン後、次のスクリプトがMagicDNSのHTTPS URL設定、Compose再起動、Tailscale Serve公開までを一括実行します。

```powershell
.\scripts\enable-tailscale-serve.ps1
```

- 初期 admin ユーザーの資格情報は `.env` の `OPENFACE_ADMIN_USER` / `OPENFACE_ADMIN_PASSWORD`（デフォルト: `openface-admin` / `openface1234`。※`admin`はForgejoの予約名のため使用不可）です。初回ログイン後にパスワードを変更することを推奨します。
- `seed` サービスがサンプルリポジトリと、`seed/catalog/sunwood-ai-labs.json` に固定した実在 Skill 10件・MCP 10件、`seed/catalog/prompts.json` に固定した Prompt 20件を冪等に取り込みます。トップページや `/models` `/datasets` `/spaces` `/skills` `/mcps` `/prompts` で確認できます。

## 🧭 使い方

### モデル / データセット / Skill / MCP / Prompt の公開手順

1. Forgejo の Web UI（`/git/repo/create` 、またはトップページの「新規作成」導線）でリポジトリを作成します。
2. リポジトリ設定画面から **topic** に `model`、`dataset`、`skill`、`mcp`、`prompt` のいずれかを追加します（これで OpenFace 上での種別が決まります）。Prompt はリポジトリ名を版なしの安定slugにし、個別版を表す `version-v1`、`version-v4.2` のような topic と、同名のGit tag（`v1`、`v4.2`）を追加します。
3. `README.md` に HuggingFace 互換の YAML frontmatter（`license`, `tags`, `pipeline_tag`, `language` など）を書くと、frontend がバッジとして表示します。
4. 大きなファイルは Git LFS でpushします。

```bash
git clone http://localhost:8090/git/<owner>/<repo>.git
cd <repo>

git lfs install
git lfs track "*.bin" "*.safetensors"
git add .gitattributes
git add model.safetensors README.md
git commit -m "add model weights"
git push origin main
```

### Spaces の作り方

1. Forgejo でリポジトリを作成し、topic に `space` を追加します。
2. リポジトリ直下に `app.py`（Gradio アプリのエントリポイント）と `requirements.txt` を置きます（`Dockerfile` を置けばそちらを優先してビルドします）。

Spaceカードの絵文字は、`README.md` のYAML frontmatterにHugging Face互換の `emoji` を設定できます。

```yaml
---
title: Realtime Voice
emoji: "🎙️"
sdk: gradio
---
```

未設定の場合はリポジトリ名・説明・topicsから絵文字を自動選択します。

```python
# app.py の最小例
import gradio as gr

def greet(name):
    return f"Hello, {name}!"

demo = gr.Interface(fn=greet, inputs="text", outputs="text")

if __name__ == "__main__":
    demo.launch()
```

```
gradio
```

3. 停止中の Space は、Forgejo にサインイン済みで当該リポジトリへの **write** 権限を持つメンテナーだけがオンデマンド起動できます。`spaces-runner` がリポジトリを clone → イメージビルド → コンテナ起動し、`/run/{owner}/{repo}/` 配下で埋め込み表示します。ビルドには数十秒〜数分かかることがあります（ステータスは building → running / error で確認可能）。
4. 同時起動数は `MAX_RUNNING_SPACES`（既定24）で制限されます。上限到達時は、最終アクセスが最も古いSpaceを停止してから新しいSpaceを起動します。
5. `IDLE_TIMEOUT_MINUTES` は既定0（時間による自動停止なし）です。必要な環境だけ正の分数を設定できます。

### OpenFace Pages の公開手順

OpenFace Pages は **public リポジトリだけ**を配信します。公開URLは次の形式です。

```
https://<host>:<https-port>/pages/<owner>/<repo>/
```

配信元は次の優先順位です。

1. `gh-pages` ブランチのルート（推奨）
2. `gh-pages` がない場合は、既定ブランチの `docs/` ディレクトリ

例えば `index.html` を用意して `gh-pages` に push するだけです。`css`、JavaScript、画像、フォントなどの相対パスの静的ファイルも同じURL配下で配信されます。新規Compose環境には `openface/pages-starter` の公開デモと `gh-pages` ブランチが seed されます。

```bash
git checkout --orphan gh-pages
git rm -rf .
printf '<h1>Hello from OpenFace Pages</h1>' > index.html
git add index.html
git commit -m "publish site"
git push origin gh-pages
```

private リポジトリはURLを直接指定しても `404` になり、Pages カードも表示されません。

### VitePress を push だけで公開する

Compose 起動時に Forgejo Actions と `openface` 組織専用Runnerが有効になります。Runnerは OpenFace のホストDockerソケットを共有せず、専用の Docker-in-Docker 内でビルドします。初回seedには動作する `openface/vitepress-pages-starter` が含まれます。

VitePressプロジェクトに次のワークフローを置くと、`main` のドキュメント変更または手動実行で、ビルド結果を `gh-pages` へ公開します。特別なアクセストークンの作成は不要で、Forgejo Actions がその実行だけに使える一時トークンを渡します。

```yaml
# .forgejo/workflows/publish-pages.yml
name: Publish VitePress to OpenFace Pages
on:
  push:
    branches: [main]
    paths: ['docs/**', 'package.json', 'package-lock.json']
  workflow_dispatch:

jobs:
  publish:
    runs-on: node20
    steps:
      - uses: https://data.forgejo.org/actions/checkout@v4
      - run: npm install --no-audit --no-fund
      - run: VITEPRESS_BASE="/pages/${GITHUB_REPOSITORY}/" npm run docs:build
      - env:
          PAGES_TOKEN: ${{ github.token }}
        run: |
          git config user.name "OpenFace Pages"
          git config user.email "pages@openface.local"
          git checkout --orphan gh-pages
          git rm -rf .
          cp -R docs/.vitepress/dist/. .
          touch .nojekyll
          git add --all
          git commit -m "Publish Pages for ${GITHUB_SHA}"
          git remote set-url origin "http://oauth2:${PAGES_TOKEN}@forgejo:3000/${GITHUB_REPOSITORY}.git"
          git push --force origin gh-pages
```

`docs/.vitepress/config.mts` では、配下URLでアセットが壊れないよう `base: process.env.VITEPRESS_BASE ?? '/'` を指定してください。完全な実行例は `seed/templates/vitepress-pages-starter/` にあります。

## 🔌 ポート一覧

| ポート | 用途 |
|---|---|
| `8090` | HTTP gateway（LAN・ローカル証明書非対応WebView向け） |
| `8443` | HTTPS gateway（Web UI・API・Git・Spaces、すべてここ経由） |
| `2222` | Forgejo への直接 SSH（`git clone ssh://git@localhost:2222/...`） |

それ以外のポート（frontend:3000, forgejo:3000, spaces-runner:8000）はコンテナネットワーク内部のみで公開されません。

## 🔐 HTTPS

`docker compose up -d --build` で gateway が HTTPS を公開します。ローカルでは `https://localhost:8443` を使います。初回起動時は自己署名証明書を `gateway/certs/` に自動作成するため、ブラウザにはローカル証明書の警告が出ます。

実運用では、公開ドメインの証明書を次のファイル名で配置してから再起動してください。証明書が存在する場合は自動生成せず、そのまま利用します。

```
gateway/certs/cert.pem  # fullchain.pem 相当
gateway/certs/key.pem   # private key
```

ドメイン運用では `.env` の `OPENFACE_HTTPS_PORT=443` と `PUBLIC_BASE_URL=https://openface.example.com` を設定してください。証明書の自動取得（ACME）はDNS名と公開到達性が必要なため、このCompose構成では外部の証明書発行手段で取得したものを配置します。

## 🗂️ ディレクトリ構成

```
OpenFace/
├── docker-compose.yml
├── .env.example
├── README.md            # 本ファイル
├── PLAN.md              # 設計書
├── gateway/nginx.conf
├── forgejo/              # Dockerfile + custom/ (templates, assets)
├── frontend/             # Next.js アプリ
├── spaces-runner/         # FastAPI + Dockerfile（Spaceのビルド・実行・プロキシ）
├── seed/                  # seed.sh + 実在Skill/MCPのインポートマニフェスト
└── docs/evidence/         # 実ブラウザ検証のスクリーンショットと計測記録
```

## 🛠️ トラブルシューティング

- **初回起動がうまくいかない / サンプルrepoが出てこない**: `docker compose logs seed` でログを確認してください。Forgejo の起動待ち・admin作成・token発行・サンプルrepo投入の各ステップがログに出力されます。
- **API tokenを再生成したい**: `seed` は `/shared/token`（共有ボリューム `shared-token`）に一度だけ書き込みます。作り直したい場合はボリュームを削除して `docker compose up -d --build` を再実行するか、Forgejo の Web UI（設定 → アプリケーション）からトークンを再発行し、`/shared/token` を手動で書き換えてください。
- **Space が起動しない / building のまま止まる**: `docker compose logs spaces-runner` を確認してください。多くの場合 `requirements.txt` の依存解決失敗か、`app.py` の実行時エラーです。`GET /runner-api/spaces/{owner}/{repo}/status` のレスポンスにエラーメッセージが入ります。
- **セキュリティ上の注意（重要）**: `spaces-runner` はホストの `/var/run/docker.sock` をマウントしており、任意の Docker イメージのビルド・実行が可能な強い権限を持っています。信頼できないユーザーにリポジトリ作成を許可する環境（`DISABLE_REGISTRATION=false`）では、実質的にホスト上で任意コード実行が可能になることを理解した上で運用してください。インターネットに直接公開せず、信頼できるLAN内での利用を強く推奨します。
- **企業向けのアクセス境界**: カタログは public repo のみ、Space の起動・停止は Forgejo の write 権限を持つメンテナーのみです。private Space は既定で実行不可です。詳細と実ブラウザ検証は [docs/enterprise-access.md](docs/enterprise-access.md) を参照してください。

## 🧪 完全整備の検証

### 公開ドキュメントの実画面

| English | 日本語 |
|---|---|
| ![公開済み英語VitePressドキュメント](docs/repository-polish/github-pages-en.png) | ![公開済み日本語VitePressドキュメント](docs/repository-polish/github-pages-ja.png) |

Next.js更新後のOpenFaceホーム、CPU Space一覧、Prompt v4.2固定表示を含む実ブラウザ検証は [Repository polish verification](docs/repository-polish/index.md) に記録しています。

### エージェント向け画面撮影テスト

画面に影響するpush／pull requestでは、**Visual QA** workflowが実際のDocker Compose環境を起動し、主要な全ページ種別をデスクトップとモバイルで撮影します。ダウンロードできる `openface-visual-qa-*` artifactには、全画面PNG、エージェント向けの `AGENT_REVIEW.md`、機械可読な `manifest.json`、Compose診断ログが入ります。

ローカルでも同じ撮影を実行できます。

```bash
npm ci --prefix visual-tests
npm exec --prefix visual-tests -- playwright install chromium
npm run capture --prefix visual-tests
```

`visual-tests/artifacts/AGENT_REVIEW.md` を開き、PASS/FAILだけでなく全画像を確認してください。詳しい取得方法・指摘形式・部分撮影は[Visual QAガイド](https://sunwood-ai-labs.github.io/OpenFace/ja/guide/visual-qa)に記載しています。

## 📄 ライセンス

OpenFace固有のコードとドキュメントは [MIT License](LICENSE) で公開します。Forgejo、フォント、依存パッケージ、seedで取り込む公開リポジトリには、それぞれのライセンスが適用されます。詳細は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。
