# Automated Claude Code `/goal` maintenance

OpenFace can turn a newly opened Forgejo Issue into a human-reviewed Pull Request by running Claude Code's built-in `/goal` command against the cloned repository. Claude Code connects directly to Z.AI's Anthropic-compatible endpoint and uses `glm-5.2`.

## Flow

1. Forgejo signs and sends the organization `issues` webhook.
2. `maintenance-agent` validates the HMAC signature and records the delivery in SQLite.
3. The service clones the repository and creates `agent/issue-N`.
4. Claude Code 2.1.205 receives `/goal` followed by the Issue and explicit completion conditions.
5. Claude Code inspects local instructions and source, edits any required repository files, runs relevant commands and tests, reviews its diff, and keeps working until the goal evaluator finishes.
6. The root wrapper verifies repository containment and `git diff --check`.
7. The dedicated `glm-maintainer` account commits, pushes, opens a PR, and comments on the Issue.
8. A human reviews and merges or closes the PR. The agent has no auto-merge path.

This is deliberately not a fixed planner/coder JSON pipeline. There is no file-count or changed-line cap; `/goal` retains Claude Code's repository-level freedom.

## Configure Z.AI

Keep the Z.AI API key in a protected env file outside the repository. Compose reads that file at container creation; the credential is never committed to Git.

```dotenv
ZAI_AGENT_CONFIG=C:/Users/you/AppData/Local/OpenFace/zai.env
ZAI_ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
MAINTENANCE_MODEL=glm-5.2
MAINTENANCE_GOAL_TIMEOUT_SECONDS=3600
MAINTENANCE_MAX_WORKERS=2
```

Then rebuild the idempotent seed and service:

```powershell
docker compose up -d --build seed
docker compose up -d --build maintenance-agent
docker compose exec maintenance-agent claude --version
docker compose exec maintenance-agent python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8010/health').read().decode())"
```

The seed creates the non-admin `glm-maintainer` user, its write-only organization team, a dedicated Forgejo token, a random webhook HMAC secret, and the Issue webhook.

## Trigger and opt out

Every newly opened Issue in the configured owner triggers maintenance by default. Add either of these before creation when automation is inappropriate:

- label: `agent:skip`
- body marker: `<!-- openface-maintenance:skip -->`

Repeated deliveries produce one job and one PR per Issue. The stable branch is `agent/issue-N`.

Up to `MAINTENANCE_MAX_WORKERS` Issues run concurrently. Each job has its own clone and `agent/issue-N` branch; overlapping edits can still produce normal Git conflicts between the resulting PRs. Values are bounded to 1–4 to avoid exhausting the host or the model provider.

## Freedom and isolation

- Claude Code runs as the unprivileged `maintainer` user inside the dedicated maintenance container.
- The cloned repository is writable and normal Claude Code tools, local instructions, builds, tests, and linters are available.
- The container has no host Docker socket, so repository commands cannot control the host Docker daemon.
- Forgejo bot credentials and the webhook secret are root-only (`0600`) and unreadable by Claude Code.
- The model API credential is necessarily available to the Claude Code process for inference.
- The wrapper rejects paths that resolve outside the clone and requires `git diff --check` before publication.
- Only the root wrapper receives Forgejo authentication for commit publication. Claude Code is instructed not to push or open PRs.
- Human review is mandatory; the bot has no merge or administrator path.

This boundary permits repository code execution inside the maintenance container. Treat third-party repositories and Issue automation accordingly; it is not a host security sandbox for arbitrary untrusted code.

## Operations

```powershell
docker compose ps maintenance-agent
docker compose logs -f maintenance-agent
docker compose exec maintenance-agent python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8010/api/jobs').read().decode())"
```

Interrupted `queued` or `running` jobs are marked `interrupted` on service restart instead of remaining falsely active.

## Verified end-to-end example

[Issue #10](https://madesk.tail8be30.ts.net/git/openface/pages-starter/issues/10) produced [PR #11](https://madesk.tail8be30.ts.net/git/openface/pages-starter/pulls/11). The retained evidence confirms:

- job detail: `Running Claude Code /goal with glm-4.7`;
- author: `glm-maintainer`;
- branch: `agent/issue-10` into `main`;
- changed files: `README.md` and `index.html`;
- Issue comment links back to PR #11;
- Forgejo reports the PR as mergeable.
