# Automated Claude Code `/goal` maintenance

OpenFace can turn a Forgejo Issue addressed to `@glm-maintainer` into a verified, automatically merged Pull Request by running Claude Code's built-in `/goal` command against the cloned repository. Claude Code connects directly to Z.AI's Anthropic-compatible endpoint and uses `glm-5.2`.

## Flow

1. Forgejo signs and sends the organization `issues`, `issue_comment`, or `pull_request_comment` webhook.
2. `maintenance-agent` validates the HMAC signature and records the delivery in SQLite.
3. `glm-maintainer` classifies the request and posts a visible `@specialist` delegation comment.
4. Only after that comment succeeds, the service clones the repository and creates `agent/issue-N`.
5. Claude Code 2.1.205 receives `/goal` followed by the Issue, the selected specialist contract, and explicit completion conditions.
6. Claude Code inspects local instructions and source, edits any required repository files, runs relevant commands and tests, reviews its diff, and keeps working until the goal evaluator finishes.
7. The root wrapper verifies repository containment, required UI evidence, and `git diff --check`. The specialist identity commits, pushes, and posts the completion reply with status `independent review pending`.
8. `glm-maintainer` visibly mentions `@review-agent` with the PR URL and review contract.
9. A second Claude Code `/goal` run checks the exact PR head SHA read-only. It traces every Issue requirement, reads the full diff, reruns relevant checks, records severity/location/remediation for findings, and emits an `approved` or `rejected` report.
10. UI/app reviews must independently start and operate the app and attach reviewer-owned mobile and desktop captures. The implementer's screenshots alone cannot satisfy this gate.
11. Only a schema-valid approval for the unchanged head SHA permits server-side merge. The merge request also supplies Forgejo's `head_commit_id`; rejection, missing evidence, reviewer edits, timeout, stale SHA, or merge conflict leaves the PR open.

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

Mention `@glm-maintainer` in a newly opened Issue to start maintenance. Users do not address specialists directly; the maintainer owns classification and delegation. Issues without the maintainer mention remain ordinary discussions. Add either opt-out marker when automation is inappropriate:

- label: `agent:skip`
- body marker: `<!-- openface-maintenance:skip -->`

Repeated deliveries produce one job and one PR per Issue. The stable branch is `agent/issue-N`.

### Continue editing from a comment

On the source Issue or its agent-created PR, mention the maintainer followed by the additional instruction:

```text
@glm-maintainer 見出しも日本語にしてください。ほかのファイルは変更しないでください。
```

The agent checks out the existing `agent/issue-N` branch, runs the Japanese completion prompt, verifies the new diff, and pushes a new commit to the same PR. Ordinary discussion comments do not trigger a model run. A currently queued or running Issue cannot be queued again; edit or post the follow-up after the active run finishes.

### Maintainer-led specialist delegation

New Issues and follow-up comments are classified automatically by `glm-maintainer`. Direct `@designer-agent`, `@coding-agent`, `@docs-agent`, or `@review-agent` mentions do not start a run and do not override routing. The maintainer selects one specialist, announces that assignment in the conversation, and only then submits that specialist's worker. `/api/agents` lists the persona contracts, while `/api/jobs` records the selected username and job state. A PR-triggered job keeps the source Issue branch but posts reactions and the completion reply back to the PR conversation where it was requested.

The coordinator and four specialists are independent Forgejo users. Seed assigns each account its own least-privilege token and a separately generated, centered character avatar on a plain role color. Before a worker can start, `glm-maintainer` must successfully post a comment that mentions the selected specialist. If that announcement fails, the queued database reservation is removed and no hidden specialist run starts. The retained [Issue #21](https://madesk.tail8be30.ts.net/git/openface/pages-starter/issues/21) demonstrates this ordered hand-off through completion; profile and discussion screenshots are kept in [`docs/evidence/agents`](../evidence/agents/README.md).

The Issue reaction trail is intentionally small: 👍 for human support, 👀 while the maintenance agent is working, 🚀 after successful publication, and 😕 when a run fails or stops before publication.

### UI and application evidence gate

UI/app work cannot auto-merge from code inspection alone. The specialist must start the real app, exercise the changed interaction, and produce `.openface-maintenance/ui-report.json` plus real PNG captures. The wrapper requires all listed tests to be `passed`, at least one mobile capture at 480px or below, and at least one desktop capture at 1024px or above. It validates PNG signatures and dimensions, removes the private evidence directory from the commit, uploads the files to the Forgejo completion comment, and renders a Markdown table describing exactly what was tested. The maintenance image includes Chromium, Japanese CJK fonts, and color emoji so Japanese screenshots remain readable.

That implementer report is not approval. After the PR is pushed, `glm-maintainer` assigns `@review-agent`. The reviewer uses a distinct Forgejo token and a read-only prompt, validates the exact current head SHA, and writes `.openface-maintenance/review-report.json`. Approval requires every requirement and executed check to pass and the findings list to be empty. For UI work, the reviewer must independently capture at least one real PNG at 480px or below and one at 1024px or above; those images are uploaded from the reviewer account. A malformed report, missing image, changed tracked file, failed check, any finding, or stale head SHA blocks merge.

The retained [ClearNext Issue #22](https://madesk.tail8be30.ts.net/git/openface/clear-next/issues/22) demonstrates the complete contract: human `@glm-maintainer` request, maintainer-to-designer hand-off, real disclosure interaction, mobile/desktop evidence, explicit overflow and browser-error checks, and verified auto-merge.

| Forgejo completion comment | Opened mobile attachment |
|---|---|
| ![UI test table and auto-merge result](../evidence/automated-maintenance/issue-22-completion-comment.png) | ![Readable Japanese disclosure in the attached app screenshot](../evidence/automated-maintenance/issue-22-mobile-opened.png) |

Up to `MAINTENANCE_MAX_WORKERS` Issues run concurrently. Each job has its own clone and `agent/issue-N` branch; overlapping edits can still produce normal Git conflicts between the resulting PRs. Values are bounded to 1–4 to avoid exhausting the host or the model provider.

## Freedom and isolation

- Claude Code runs as the unprivileged `maintainer` user inside the dedicated maintenance container.
- The cloned repository is writable and normal Claude Code tools, local instructions, builds, tests, and linters are available.
- The container has no host Docker socket, so repository commands cannot control the host Docker daemon.
- Forgejo bot credentials and the webhook secret are root-only (`0600`) and unreadable by Claude Code.
- The model API credential is necessarily available to the Claude Code process for inference.
- The wrapper rejects paths that resolve outside the clone and requires `git diff --check` before publication.
- Only the root wrapper receives Forgejo authentication for commit publication. Claude Code is instructed not to push or open PRs.
- With `MAINTENANCE_AUTO_MERGE=true` (the Compose default), the root wrapper requests a server-side Forgejo merge only after independent approval of the unchanged head SHA, then deletes the work branch. Set it to `false` when an additional human merge is mandatory.

This boundary permits repository code execution inside the maintenance container. Treat third-party repositories and Issue automation accordingly; it is not a host security sandbox for arbitrary untrusted code.

## Operations

```powershell
docker compose ps maintenance-agent
docker compose logs -f maintenance-agent
docker compose exec maintenance-agent python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8010/api/jobs').read().decode())"
```

Interrupted `queued` or `running` jobs are marked `interrupted` on service restart instead of remaining falsely active.

## Verified end-to-end example

[Issue #22](https://madesk.tail8be30.ts.net/git/openface/clear-next/issues/22) produced and auto-merged [PR #23](https://madesk.tail8be30.ts.net/git/openface/clear-next/pulls/23). The retained evidence confirms:

- the human request mentions only `@glm-maintainer`;
- `glm-maintainer` visibly assigns `@designer-agent` before the worker starts;
- Claude Code `/goal` uses `glm-5.2` and returns a Japanese completion summary;
- the specialist's own account posts an 18-row UI-test table and four PNG attachments;
- click, Enter, Space, light/dark, 390px/1440px, overflow, console errors, and page errors are explicitly tested;
- the attached mobile screenshot contains readable Japanese CJK glyphs;
- Forgejo reports the PR closed and merged at commit `22430240bf329d67da36636f7ba58a63002350ea`.

### End-to-end app delivery

Starting from an empty public repository, the workflow designed, implemented, containerized, and independently reviewed ClearNext through eight specialist stages with verified auto-merge. The [ClearNext maintenance evidence](../evidence/automated-maintenance/clear-next/README.md) preserves live Runner screenshots, Issue and PR links, merge commits, and the 103-test result.
