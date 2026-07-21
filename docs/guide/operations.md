---
title: Operations
type: guide
description: Run backups, upgrades, security checks, and day-two platform maintenance.
readingTime: 9 min
tags: [operations, security, backup]
related:
  - title: Platform map
    link: /wiki/platform-map
  - title: Troubleshooting
    link: /guide/troubleshooting
---

# Operations

## Configuration

Copy `.env.example` to `.env`. The most important settings are:

| Variable | Purpose |
|---|---|
| `OPENFACE_ADMIN_USER` | Initial Forgejo administrator |
| `OPENFACE_ADMIN_PASSWORD` | Bootstrap password; change it before shared use |
| `PUBLIC_BASE_URL` | Canonical gateway URL used by Forgejo and embedded links |
| `OPENFACE_HTTPS_PORT` | Host HTTPS port |
| `DISABLE_REGISTRATION` | Keeps public self-registration closed when `true` |
| `MAX_RUNNING_SPACES` | Maximum simultaneous Space containers |
| `IDLE_TIMEOUT_MINUTES` | Optional inactivity shutdown; `0` disables it |

## Backups

Back up the named volumes `openface_forgejo-data`, `openface_agent-metrics-data`, `openface_shared-token`, and `openface_forgejo-runner-data`. Test restore procedures before relying on the backup.

## TLS

The gateway creates a self-signed development certificate when none exists. For a shared deployment, place a trusted certificate at `gateway/certs/cert.pem` and its private key at `gateway/certs/key.pem`, then set the public URL and port in `.env` before restarting.

## Security boundary

OpenFace is intended for trusted local or private-network collaboration. It is not a hardened multi-tenant sandbox. The Space runner has host Docker control, so only trusted maintainers should be able to create or change runnable Space repositories.

Keep Forgejo registration disabled, rotate the bootstrap password, review Dockerfiles, protect backups, and do not expose token-bearing logs or clone URLs.

## Useful commands

```bash
docker compose ps
docker compose logs --tail=200 gateway frontend forgejo spaces-runner
docker compose up -d --build
docker compose down
```
