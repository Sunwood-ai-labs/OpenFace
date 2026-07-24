---
title: Architecture
type: guide
description: Understand the Compose services, trust boundaries, and persistence model.
readingTime: 6 min
tags: [architecture, compose, security]
related:
  - title: Platform map
    link: /wiki/platform-map
  - title: Why a local AI hub matters
    link: /articles/local-first-hub
---

# Architecture

OpenFace exposes one HTTP/HTTPS gateway and keeps application services on a private Compose network.

| Service | Responsibility |
|---|---|
| `gateway` | nginx routing, TLS termination, WebSocket proxying, and the single public web entrypoint |
| `frontend` | Next.js discovery portal and repository presentation layer |
| `forgejo` | Git, LFS, authentication, permissions, issues, pull requests, and Actions metadata |
| `postgres` | PostgreSQL persistence for Forgejo, metrics, and maintenance state |
| `spaces-runner` | Space validation, clone, Docker build/run, metrics API, proxy, and Pages file serving |
| `seed` | Idempotent bootstrap of the admin, token, organization, examples, catalogs, and prompt tags |
| `forgejo-actions-runner` | Executes Pages workflows against an isolated Docker-in-Docker daemon |

## Request routing

- `/`, `/models`, `/datasets`, `/spaces`, `/skills`, `/mcps`, `/prompts`, and repository routes go to the frontend.
- `/git/` goes to Forgejo.
- `/run/{owner}/{repo}/` proxies a running Space.
- `/runner-api/` exposes the runner API through the gateway.
- `/pages/{owner}/{repo}/` serves public repository Pages.

## State

Forgejo metadata, metrics, and maintenance jobs live in three PostgreSQL databases. Git repository files, LFS objects, the runner registration, shared control tokens, and agent credentials live in named Docker volumes. Application images and build cache live in Docker. The Git checkout itself contains configuration, UI code, templates, and documentation but no production secrets.

## Trust model

Catalog visibility follows Forgejo repository visibility. Space control checks the signed-in Forgejo user's repository permission. The frontend and runner share an internal control token, while agent metrics use separate hashed API credentials. The Actions runner uses a dedicated Docker daemon and does not receive the host Docker socket.
