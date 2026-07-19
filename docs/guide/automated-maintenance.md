# Automated GLM maintenance

OpenFace can turn a newly opened Forgejo Issue into a bounded, human-reviewed Pull Request using the GLM model already available through the host's Open WebUI.

## Flow

1. Forgejo signs and sends the organization `issues` webhook.
2. `maintenance-agent` validates the HMAC signature and records the delivery in SQLite.
3. `glm-4.7` selects the relevant files and writes a small implementation proposal.
4. A separate GLM reviewer checks every explicit Issue requirement and may correct the proposal.
5. The service applies file and diff limits, checks sensitive paths, and performs static syntax validation.
6. The dedicated `glm-maintainer` account pushes `agent/issue-N`, opens a PR, and comments on the Issue.
7. A human reviews and merges or closes the PR. The agent has no auto-merge path.

## Configure the local model

The API key remains in the existing Open WebUI agent configuration and is mounted read-only. It is never copied into Git or Compose environment values.

```dotenv
OPENWEBUI_AGENT_CONFIG=C:/Users/you/AppData/Local/OpenWebUIAgent/config.env
OPEN_WEBUI_BASE_URL=http://host.docker.internal:3000
OPEN_WEBUI_MODEL=glm-4.7
```

Then rebuild the idempotent seed and start the service:

```powershell
docker compose up -d --build seed
docker compose up -d --build maintenance-agent
docker compose exec maintenance-agent python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8010/health').read().decode())"
```

The seed creates:

- the non-admin `glm-maintainer` user;
- the all-repository, write-only `glm-maintainers` organization team;
- a dedicated Forgejo access token in the shared secret volume;
- a random webhook HMAC secret;
- the organization Issue webhook.

## Trigger and opt out

Every newly opened Issue in the configured owner triggers maintenance by default. Add either of these before creation when automation is inappropriate:

- label: `agent:skip`
- body marker: `<!-- openface-maintenance:skip -->`

Repeated webhook deliveries and repeated events for the same Issue produce one job and one PR. The stable branch is `agent/issue-N`.

## Safety boundary

- Issue text and repository text are explicitly treated as untrusted prompt data.
- Common token, API-key, password, and bearer values are redacted before inference.
- `.env*`, credentials, secrets, keys, lockfiles, CI workflows, and Docker Compose cannot be changed.
- A proposal is limited to 6 files and 800 diff lines by default.
- JSON/YAML parsing, Python compilation, shell parsing, and `git diff --check` are allowed.
- Repository programs and test suites are not executed, so an Issue cannot turn repository code into host code execution.
- Validation failures delete the temporary worktree without pushing a branch.

Tune only the bounded limits through `MAINTENANCE_MAX_FILES` and `MAINTENANCE_MAX_CHANGED_LINES`. Keep the service internal; only Forgejo needs access to port `8010`.

## Operations

```powershell
docker compose ps maintenance-agent
docker compose logs -f maintenance-agent
docker compose exec maintenance-agent python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8010/api/jobs').read().decode())"
```

The first retained E2E example is [Issue #4](https://madesk.tail8be30.ts.net/git/openface/pages-starter/issues/4) and its GLM-authored [PR #5](https://madesk.tail8be30.ts.net/git/openface/pages-starter/pulls/5). It proves signed delivery, three GLM calls, one changed file, bot-authored push, mergeable PR creation, and an Issue backlink.

