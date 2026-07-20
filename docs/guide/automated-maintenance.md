# Automated Claude Code `/goal` maintenance

OpenFace can turn a newly opened Forgejo Issue into a human-reviewed Pull Request by running Claude Code's built-in `/goal` command against the cloned repository. Claude Code connects directly to Z.AI's Anthropic-compatible endpoint and uses `glm-5.2`.

## Flow

1. Forgejo signs and sends the organization `issues`, `issue_comment`, or `pull_request_comment` webhook.
2. `maintenance-agent` validates the HMAC signature and records the delivery in SQLite.
3. The service clones the repository and creates `agent/issue-N`.
4. Claude Code 2.1.205 receives `/goal` followed by the Issue and explicit completion conditions.
5. Claude Code inspects local instructions and source, edits any required repository files, runs relevant commands and tests, reviews its diff, and keeps working until the goal evaluator finishes.
6. The root wrapper verifies repository containment and `git diff --check`.
7. `glm-maintainer` classifies the request and delegates it to a specialist identity. That specialist commits, pushes, and posts the completion reply.
8. After successful validation, the wrapper requests a server-side Forgejo merge and source-branch deletion when `MAINTENANCE_AUTO_MERGE=true` (the Compose default). Set it to `false` when human review must gate merging.

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

The seed creates the non-admin orchestrator and specialist users, their write-only organization team, separate Forgejo tokens, a random webhook HMAC secret, and the Issue/PR-comment webhook.

## Trigger and opt out

Every newly opened Issue in the configured owner triggers maintenance by default. Add either of these before creation when automation is inappropriate:

- label: `agent:skip`
- body marker: `<!-- openface-maintenance:skip -->`

Repeated deliveries produce one job and one PR per Issue. The stable branch is `agent/issue-N`.

### Continue editing from a comment

On the source Issue or its agent-created PR, start a comment with `/goal` followed by the additional instruction:

```text
/goal 見出しも日本語にしてください。ほかのファイルは変更しないでください。
```

The agent checks out the existing `agent/issue-N` branch, runs the Japanese completion prompt, verifies the new diff, and pushes a new commit to the same PR. Ordinary discussion comments do not trigger a model run. A currently queued or running Issue cannot be queued again; edit or post the follow-up after the active run finishes.

### Delegate to a specialist

New Issues are classified automatically. To override the routing for a follow-up, mention exactly one registered persona in an Issue or PR comment:

```text
@designer-agent Verify the responsive spacing with screenshots and fix any regression.
@coding-agent Implement the endpoint and its focused tests.
@docs-agent Update the rebuild guide and verify every command.
@review-agent Independently review this PR and change files only when a defect is found.
```

One comment routes to one specialist so ownership remains explicit. `/api/agents` lists the persona contracts, while `/api/jobs` records the selected username and job state. A PR-triggered job keeps the source Issue branch but posts reactions and the completion reply back to the PR conversation where it was requested.

The coordinator and four specialists are independent Forgejo users. Seed assigns each account its own least-privilege token and a separately generated, centered character avatar on a plain role color. Before a worker can start, `glm-maintainer` must successfully post a comment that mentions the selected specialist. If that announcement fails, the queued database reservation is removed and no hidden specialist run starts. The retained [Issue #21](https://madesk.tail8be30.ts.net/git/openface/pages-starter/issues/21) demonstrates this ordered hand-off through completion; profile and discussion screenshots are kept in [`docs/evidence/agents`](../evidence/agents/README.md).

The Issue reaction trail is intentionally small: 👍 for human support, 👀 while the maintenance agent is working, 🚀 after successful publication, and 😕 when a run fails or stops before publication.

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

[Issue #12](https://madesk.tail8be30.ts.net/git/openface/pages-starter/issues/12) updated existing [PR #15](https://madesk.tail8be30.ts.net/git/openface/pages-starter/pulls/15) from a Japanese `/goal` comment. The retained evidence confirms:

- job detail and Claude completion summary are Japanese and use `glm-5.2`;
- author: `glm-maintainer`;
- branch: `agent/issue-12` into `main`;
- the existing PR received commit `1a505ce` rather than a duplicate PR;
- only `docs/concurrency-probe-a.md` changed in the follow-up commit;
- the Japanese Issue reply links back to PR #15;
- Forgejo reports the PR as mergeable.
