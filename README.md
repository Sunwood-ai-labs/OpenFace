<p align="center">
  <img src="docs/public/openface.svg" width="104" alt="OpenFace logo">
</p>

<h1 align="center">OpenFace</h1>

<p align="center"><strong>The AI community building locally.</strong></p>

<p align="center">
  A local-first, Forgejo-backed hub for models, datasets, Docker Spaces, Skills, MCPs, versioned Prompts, and static Pages.
</p>

<p align="center">
  <a href="README.md"><strong>English</strong></a> · <a href="README.ja.md">日本語</a> · <a href="https://sunwood-ai-labs.github.io/OpenFace/">Documentation</a>
</p>

<p align="center">
  <a href="https://github.com/Sunwood-ai-labs/OpenFace/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Sunwood-ai-labs/OpenFace/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/Sunwood-ai-labs/OpenFace/actions/workflows/visual-qa.yml"><img alt="Visual QA" src="https://github.com/Sunwood-ai-labs/OpenFace/actions/workflows/visual-qa.yml/badge.svg"></a>
  <a href="https://github.com/Sunwood-ai-labs/OpenFace/actions/workflows/docs.yml"><img alt="Docs" src="https://github.com/Sunwood-ai-labs/OpenFace/actions/workflows/docs.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg"></a>
  <img alt="Docker Compose" src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white">
  <img alt="Forgejo" src="https://img.shields.io/badge/Git-Forgejo-fb923c">
</p>

![OpenFace home showing models, datasets, Spaces, Skills, MCPs, and Prompts](docs/images/openface-home.png)

OpenFace turns one Docker host into a self-contained AI collaboration platform. Forgejo stores real Git repositories, histories, tags, issues, permissions, and LFS objects. A Next.js portal presents those repositories in a Hugging Face-style catalog, while a FastAPI runner builds and embeds CPU-capable Docker applications. nginx exposes the portal, Git UI, apps, APIs, and Pages through one HTTPS gateway.

## ✨ Highlights

- **Real repositories:** models, datasets, Skills, MCPs, and Prompts keep their files, commits, tags, clone URLs, and repository permissions.
- **Dockerfile-first Spaces:** run Gradio, static HTML, React, Vue, Next.js, Streamlit, FastAPI, Node.js, or another CPU web application on port `7860`.
- **Always-on CPU mode:** `IDLE_TIMEOUT_MINUTES=0` keeps CPU Spaces running; a least-recently-used cap prevents unbounded growth.
- **OpenFace Pages:** serve `gh-pages` or default-branch `docs/`, with a seeded VitePress workflow on an isolated Forgejo Actions runner.
- **Agent operations API:** browser views, likes, and agent actions use a persisted metrics service with hashed agent credentials.
- **Claude Code goal maintenance:** a signed Issue webhook runs Claude Code's built-in `/goal` command with Z.AI-hosted `glm-5.2`, opens a human-reviewed Pull Request, and accepts `/goal` follow-up comments on the Issue or agent-created PR.
- **Versioned Prompts:** stable repository slugs point to immutable Git tags that can be switched directly in the Prompt view.
- **Three visual themes:** Standard, Solarpunk, and Cyberpunk persist across visits.
- **Editable organizations:** Forgejo Owners can update organization metadata, avatars, membership, teams, and repositories from the real organization settings UI.
- **Bilingual public docs:** English and Japanese VitePress guides build and deploy through GitHub Actions.

## 🚀 Quick start

### Requirements

- Docker Engine or Docker Desktop
- Docker Compose v2 (`docker compose`)
- Git for cloning or contributing

Node.js and Python are not required on the host for the normal Compose path.

```bash
git clone https://github.com/Sunwood-ai-labs/OpenFace.git
cd OpenFace
cp .env.example .env
docker compose up -d --build
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

Before sharing the deployment, change `OPENFACE_ADMIN_PASSWORD` in `.env`. Then open:

- HTTPS portal: [https://localhost:8443](https://localhost:8443)
- Certificate-free HTTP endpoint: [http://localhost:8090](http://localhost:8090)

For private access from phones or remote devices without managing a local CA, install Tailscale on the host and client, sign both into the same tailnet, then run:

```powershell
.\scripts\enable-tailscale-serve.ps1
```

The script sets `PUBLIC_BASE_URL` to the device's MagicDNS HTTPS URL, recreates the affected Compose services, and enables Tailscale Serve. For direct LAN access, set `PUBLIC_BASE_URL=http://<host-lan-ip>:8090`; if Docker Desktop is not already allowed through Windows Defender Firewall, run `.\scripts\allow-lan-firewall.ps1` once from an administrator PowerShell.
- Forgejo SSH: `ssh://git@localhost:2222/OWNER/REPOSITORY.git`

The local gateway generates a self-signed development certificate on first start. Replace it with a trusted certificate for a shared deployment.

Verify the stack:

```bash
docker compose ps
docker compose logs seed
```

The seed job should finish successfully. Long-running services should be healthy or running.

## 🧭 What gets created

| Service | Responsibility | Exposure |
|---|---|---|
| `gateway` | nginx routing, TLS, WebSockets, single web entrypoint | `8090`, `8443` |
| `frontend` | Next.js discovery portal and repository pages | internal `3000` |
| `forgejo` | Git, LFS, authentication, ACLs, Issues, Pull Requests, Actions | internal `3000`, host SSH `2222` |
| `spaces-runner` | Space build/run/proxy, Pages, views, likes, agent API | internal `8000` |
| `seed` | Idempotent admin, token, organization, catalog, examples, and Prompt tags | one-shot |
| `forgejo-actions-runner` | Pages workflow jobs | internal |
| `forgejo-actions-dind` | Isolated Docker daemon for Actions | internal `2375` |
| `maintenance-agent` | Signed Issue webhook, Claude Code `/goal`, branch and PR creation | internal `8010` |

```mermaid
flowchart LR
    User["Browser / Git / Agent"] --> Gateway["nginx gateway<br/>8090 / 8443"]
    Gateway --> Frontend["Next.js portal"]
    Gateway --> Forgejo["Forgejo Git + LFS"]
    Gateway --> Runner["FastAPI Space runner"]
    Frontend --> Forgejo
    Frontend --> Runner
    Runner --> Space["CPU Docker Spaces"]
    Runner --> Pages["Static Pages"]
    Seed["Idempotent seed"] --> Forgejo
    Actions["Forgejo Actions runner"] --> Dind["Isolated Docker daemon"]
    Actions --> Forgejo
```

See the [architecture guide](https://sunwood-ai-labs.github.io/OpenFace/guide/architecture) for routing, storage, and trust boundaries.

## 🏛️ Editable organizations

The seed creates two real Forgejo organizations rather than static profile fixtures:

- [`openface`](https://localhost:8443/git/openface) uses a compact aperture mark for the main local AI community.
- [`seraphim-labs`](https://localhost:8443/git/seraphim-labs) is an angel-inspired AI safety collective with its own repositories and visual identity.

OpenFace keeps `openface-admin`, `aiko-mesh`, `ren-vector`, and `mira-signal` in its Owners team. Seraphim Labs has its own fictional angel-themed team—`aurelia-vale`, `cassian-reed`, `ilyana-noor`, and `lucien-sol`—with distinct high-end anime/game-character avatars. Owners can use **Edit organization** to update the profile, avatar, members, teams, and repository settings; the public profile description is read back from the Forgejo organization API. The complete avatar prompt set is preserved in [docs/evidence/organization/seraphim-avatar-prompts.md](docs/evidence/organization/seraphim-avatar-prompts.md).

| OpenFace | Seraphim Labs | Owner settings |
|---|---|---|
| <img src="docs/images/openface-organization-mobile.png" alt="OpenFace organization page with the compact aperture logo" width="240"> | <img src="docs/images/seraphim-labs-organization-mobile.png" alt="Seraphim Labs organization page with the halo and wing logo" width="240"> | <img src="docs/images/seraphim-labs-owner-settings-mobile.png" alt="Editable Seraphim Labs organization settings" width="240"> |

<img src="docs/images/seraphim-labs-team-mobile.png" alt="Seraphim Labs team with four distinct fictional angel character avatars" width="390">

<img src="docs/images/seraphim-angel-team-portraits.png" alt="Aurelia Vale, Cassian Reed, Ilyana Noor, and Lucien Sol character portraits with halos and white wings" width="640">

## 🗂️ Repository types, topics, and tags

OpenFace chooses the catalog from a **Forgejo topic**:

| Topic | Catalog |
|---|---|
| `model` | Models |
| `dataset` | Datasets |
| `space` | Spaces |
| `skill` | Skills |
| `mcp` | MCPs |
| `prompt` | Prompts |

Topics classify the repository itself. README frontmatter `tags` add multiple content labels such as `audio`, `gradio`, or `classification`; they do not replace the type topic.

```yaml
---
title: Local audio utility
emoji: "🎧"
sdk: docker
license: mit
tags:
  - audio
  - utility
---
```

The detail view reads the repository's actual `README.md`, including relative images stored in Forgejo.

## 🚀 Docker Spaces

Add the `space` topic and a root `Dockerfile`. The application container must listen on port `7860`. Seeded examples cover:

- Gradio
- static HTML
- React and Vue
- Next.js
- Streamlit
- FastAPI
- Node.js

Stopped public Spaces show **On demand**. A signed-in maintainer with write permission can start or stop them. The runner clones the repository, builds the image, starts the container, and proxies it under `/run/OWNER/REPOSITORY/`.

![OpenFace Spaces directory with running CPU applications](docs/images/openface-spaces.png)

![A React Space embedded in an OpenFace repository page](docs/images/openface-space-app.png)

Capacity controls:

- `MAX_RUNNING_SPACES=24` limits simultaneous containers.
- Starting a Space at capacity stops the least recently accessed one.
- `IDLE_TIMEOUT_MINUTES=0` disables time-based automatic stopping.
- README metadata is cached and card metrics are fetched in batches for paginated directories.

Read the full [Spaces guide](https://sunwood-ai-labs.github.io/OpenFace/guide/spaces).

## 🌐 OpenFace Pages

Public repositories can expose static sites at:

```text
https://HOST/pages/OWNER/REPOSITORY/
```

The source priority is:

1. the root of `gh-pages`;
2. the default branch's `docs/` directory when `gh-pages` is absent.

The initial seed includes a one-file page, an HTML/CSS/JavaScript portfolio, a multi-page `docs/` fallback, and a VitePress project published by Forgejo Actions.

| Repository Pages card | Live seeded site |
|---|---|
| ![Repository Pages card](docs/evidence/pages/repository-pages-card.png) | ![OpenFace Pages starter](docs/evidence/pages/pages-starter-live.png) |

See [OpenFace Pages](https://sunwood-ai-labs.github.io/OpenFace/guide/pages) and the [browser verification record](docs/evidence/pages/README.md).

## 💬 Community and Issues

Every repository keeps Forgejo-backed Issues and Pull Requests behind the OpenFace **Community** tab. The initial seed adds real discussion records to the QR Code Generator Space so list, detail, filtering, and authenticated creation routes can be verified after a fresh rebuild. The sample discussion is conducted by three persistent virtual-agent accounts—Luna Scout, Patch Orbit, and Mikan Reviewer—whose research, implementation, and review replies are idempotently recreated without duplicate comments. A dedicated fourth thread verifies blockquotes, lists, task items, code fences, tables, links, mentions, and disclosures as a natural review conversation.

| Discussion list | Discussion detail |
|---|---|
| ![OpenFace Community list](docs/evidence/community-ui/issues-list-desktop.png) | ![OpenFace Community detail](docs/evidence/community-ui/issue-detail-desktop.png) |

Desktop and mobile evidence, route checks, and responsive results are recorded in the [Community / Issue verification](docs/evidence/community-ui/README.md).

## 🧠 Skills, MCPs, and versioned Prompts

The seed imports pinned public repositories rather than label-only fixtures. Skill entries contain `SKILL.md`; MCP entries contain an implementation and dependency definition. Source selection and verification are recorded in [docs/research/skill-mcp-sources.md](docs/research/skill-mcp-sources.md).

Skill repositories can also declare typed Skill-to-Skill relationships in an editable `skill.json`. OpenFace shows required/recommended dependencies, derives reverse **Referenced by** links, and marks Skills without declarations as **Standalone**. See the [relationship metadata schema and editing guide](docs/skill-relationships.md).

| Skills | MCPs |
|---|---|
| ![Skills directory](docs/evidence/skills-mcps/skills-directory.png) | ![MCP directory](docs/evidence/skills-mcps/mcps-directory.png) |

| Workflow-link status in the directory | Evidence-backed sidebar |
|---|---|
| ![Skill workflow-link counts](docs/evidence/skill-relationships/skills-desktop.png) | ![Skill relationship sidebar](docs/evidence/skill-relationships/graph-desktop.png) |

The [screenshot-backed relationship verification](docs/evidence/skill-relationships/README.md) also covers mobile layouts, link navigation, and repositories without a `README.md`.

Prompts use a stable repository slug. Versions are represented by `version-v*` topics and matching immutable Git tags. The detail page can switch among existing tags, and `?revision=v4.2` creates a directly shareable revision URL.

| Prompt v4.1 | Prompt v4.2 |
|---|---|
| ![Prompt revision v4.1](docs/evidence/prompts/prompt-revision-v4-1.png) | ![Prompt revision v4.2](docs/evidence/prompts/prompt-revision-v4-2.png) |

## 🎨 Themes and browser evidence

The theme selector stores Standard, Solarpunk, or Cyberpunk in `localStorage` and restores it before the first visible render.

| Standard | Solarpunk | Cyberpunk |
|---|---|---|
| ![Standard theme](docs/evidence/themes/standard-home.png) | ![Solarpunk theme](docs/evidence/themes/solarpunk-home.png) | ![Cyberpunk theme](docs/evidence/themes/cyberpunk-home.png) |

Additional screenshot-backed QA lives under [`docs/evidence/`](docs/evidence/): community UI, enterprise access, Pages, Prompts, scalability, Skills/MCPs, sorting, and themes.

## 🤖 Agent metrics API

OpenFace creates demo agents and stores API keys only at creation time; the database keeps hashes. Agents can record views and likes through authenticated endpoints, while browser views are recorded by the repository detail page. See [spaces-runner/AGENT_API.md](spaces-runner/AGENT_API.md) for endpoint and authentication details.

The metrics API is for OpenFace automation. It does not grant Forgejo repository permissions or Space control.

## ⚙️ Configuration

Copy `.env.example` to `.env`. Important values include:

| Variable | Default | Purpose |
|---|---|---|
| `PUBLIC_BASE_URL` | `https://localhost:8443` | Canonical gateway URL |
| `OPENFACE_PORT` | `8090` | Certificate-free HTTP gateway port |
| `OPENFACE_HTTPS_PORT` | `8443` | HTTPS port |
| `DISABLE_REGISTRATION` | `true` | Keep public self-registration closed |
| `MAX_RUNNING_SPACES` | `24` | Maximum simultaneous Space containers |
| `IDLE_TIMEOUT_MINUTES` | `0` | Optional inactivity stop; zero disables it |
| `README_CACHE_TTL_SECONDS` | `300` | Repository card metadata cache |

Named volumes keep Forgejo data, shared control tokens, agent metrics, and Actions runner state. `docker compose down` preserves them. Add `--volumes` only when permanent deletion is intentional.

## 🔐 Security boundary

OpenFace is designed for trusted local or private-network collaboration. It is **not** a hardened multi-tenant sandbox.

The Space runner mounts `/var/run/docker.sock`; a malicious Dockerfile can control the Docker host. Keep repository creation restricted, review every runnable Space, leave registration disabled, replace the bootstrap password, and avoid exposing a default deployment to the public internet.

Read [SECURITY.md](SECURITY.md) and the [operations guide](https://sunwood-ai-labs.github.io/OpenFace/guide/operations) before shared deployment.

## 🧪 Development and verification

Validate Compose without changing runtime state:

```bash
docker compose config
```

Build the frontend:

```bash
cd frontend
npm ci
npm run build
```

Build the documentation:

```bash
cd docs
npm ci
npm run docs:build
```

The repository CI performs these structural checks and Python syntax compilation. User-facing changes should include browser or screenshot evidence when practical.

### Agent-readable visual QA

Every UI-affecting push or pull request runs the real Compose stack and captures each major page type at desktop and mobile sizes. The **Visual QA** workflow uploads an `openface-visual-qa-*` artifact containing:

- `AGENT_REVIEW.md`: a screenshot index and explicit review instructions;
- `manifest.json`: URLs, viewport sizes, HTTP status, headings, overflow, browser errors, and detected defects;
- `screenshots/`: full-page PNGs for every catalog, representative detail view, Files tab, live Space, and Pages site;
- `diagnostics/`: Compose state and logs for failed runs.

Run the same review locally:

```bash
npm ci --prefix visual-tests
npm exec --prefix visual-tests -- playwright install chromium
npm run capture --prefix visual-tests
npm run capture:themes --prefix visual-tests
npm run capture:scroll --prefix visual-tests
```

`capture:themes` is the exhaustive theme matrix: **Standard, Solarpunk, and Cyberpunk × light and dark OS color schemes × desktop and mobile × 32 major screens = 384 full-page screenshots**. It calculates rendered text contrast after alpha compositing and enforces WCAG AA (4.5:1 for normal text, 3:1 for large text). The direct Skill repository Files route is included so file names and tree edges cannot hide behind the decorative page grid. `capture:scroll` adds viewport screenshots across the top, middle, and bottom of every page, plus direct checkpoints for Dataset Viewer, Inference Providers, and both organizations' Team members. Both commands accept `VISUAL_QA_THEMES`, `VISUAL_QA_COLOR_SCHEMES`, `VISUAL_QA_VIEWPORTS`, or `VISUAL_QA_ROUTES` filters (comma-separated IDs).

`npm run audit:organization --prefix visual-tests` adds focused desktop/mobile evidence for the organization profile. It fails on exposed mobile side gutters, decorative fake members, member-count mismatches, or unreadable repository focus states.

Open the generated reports and contact sheets, then inspect the images rather than relying on PASS/FAIL alone. The current matrix produces 48 full-page contact sheets; the scroll audit provides additional top, middle, bottom, and direct-section evidence.

The latest committed manual review is the [2026-07-19 exhaustive theme contrast audit](docs/evidence/visual-qa/2026-07-19-theme-contrast-audit.md): **384 / 384 screenshots passed**, **20,196 rendered text nodes** were calculated, and all **48 contact sheets** were visually reviewed across every theme, OS color scheme, viewport, and all 32 routes. The Skill Files page also passed **18 / 18** top, middle, and bottom scroll captures across all themes and both viewports.

| Cyberpunk Dataset Viewer | Cyberpunk Inference Providers | Generated organization identity and team |
|---|---|---|
| ![Cyberpunk Dataset Viewer on mobile](docs/evidence/themes/cyberpunk-dataset-viewer-mobile.png) | ![Cyberpunk Inference Providers on mobile](docs/evidence/themes/cyberpunk-inference-providers-mobile.png) | ![OpenFace generated organization identity and team members](docs/evidence/themes/cyberpunk-organization-team-mobile.png) |

See the [visual QA guide](https://sunwood-ai-labs.github.io/OpenFace/guide/visual-qa) for the agent feedback workflow and focused-capture options.

## Automated Claude Code `/goal` maintenance

Point `ZAI_AGENT_CONFIG` in the untracked `.env` file to a protected env file containing `ZAI_API_KEY`, then start `maintenance-agent`. A newly opened Issue under the `openface` organization is passed to Claude Code 2.1.205 as a real `/goal` completion condition. Claude Code connects directly to Z.AI's Anthropic-compatible endpoint with `glm-5.2`, freely inspects and edits the cloned repository, runs relevant repository verification, and publishes the result as an `agent/issue-N` Pull Request. Agent prompts, completion summaries, PR bodies, and status replies are written in Japanese. Add the `agent:skip` label or `<!-- openface-maintenance:skip -->` to opt out.

After the PR exists, post a comment beginning with `/goal`, for example `/goal 見出しも日本語にしてください。`. The agent checks out the existing `agent/issue-N` branch, applies and verifies the additional instruction, pushes another commit to the same PR, and replies in Japanese. Ordinary comments do not run the agent. The trigger works on the source Issue and on its agent-created PR.

The orchestrator automatically delegates each new Issue to one specialist: `@designer-agent`, `@coding-agent`, `@docs-agent`, or `@review-agent`. A maintainer can also mention exactly one specialist in an Issue or PR comment to route a follow-up explicitly. Each specialist has its own Forgejo identity, avatar, least-privilege token, role contract, commit author, reactions, and completion reply; `/api/agents` and `/api/jobs` expose the available personas and current assignment.

Issue reactions provide a compact progress signal: 👍 records human support, 👀 means `glm-maintainer` accepted and is processing the request, 🚀 means the verified PR or follow-up commit was published, and 😕 marks a stopped or failed run that needs log inspection.

The service validates the Forgejo HMAC signature and deduplicates deliveries in SQLite. Claude Code runs as an unprivileged user inside the maintenance container: it has no host Docker socket and cannot read the Forgejo bot token, while retaining normal repository-level tools and test execution. The root wrapper alone commits and pushes after `git diff --check`; it never merges its own PR. See [Automated Claude Code maintenance](https://sunwood-ai-labs.github.io/OpenFace/guide/automated-maintenance).

The retained follow-up proof is [Issue #12](https://madesk.tail8be30.ts.net/git/openface/pages-starter/issues/12) → [PR #15](https://madesk.tail8be30.ts.net/git/openface/pages-starter/pulls/15): a Japanese `/goal` comment produced commit `1a505ce` on the existing PR, changed only the requested file, returned a Japanese completion summary, and kept the PR mergeable.

Specialist delegation is retained as [Issue #18](https://madesk.tail8be30.ts.net/git/openface/pages-starter/issues/18) → [PR #19](https://madesk.tail8be30.ts.net/git/openface/pages-starter/pulls/19): automatic classification assigned the documentation persona, and an explicit `@review-agent` PR comment launched an independent review on the same branch.

## 📖 Documentation

| Published English Docs | Published Japanese Docs |
|---|---|
| ![Published English VitePress documentation](docs/repository-polish/github-pages-en.png) | ![Published Japanese VitePress documentation](docs/repository-polish/github-pages-ja.png) |

The complete [repository polish verification record](docs/repository-polish/index.md) also includes the post-upgrade OpenFace home, Spaces directory, and immutable Prompt revision screenshots.

- [English documentation](https://sunwood-ai-labs.github.io/OpenFace/)
- [日本語ドキュメント](https://sunwood-ai-labs.github.io/OpenFace/ja/)
- [Japanese README](README.ja.md)
- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)
- [Security policy](SECURITY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## 📄 License

OpenFace-specific code and documentation are released under the [MIT License](LICENSE). Forgejo, fonts, package dependencies, base images, and seeded public repositories retain their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
