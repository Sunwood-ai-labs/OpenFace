# Visual QA for development agents

OpenFace treats screenshots as test evidence, not decoration. The Visual QA workflow starts the real Docker Compose application, waits for the seed catalog, launches a representative Docker Space, and captures every major page type at desktop and mobile sizes.

## What the packet contains

Each `openface-visual-qa-*` GitHub Actions artifact contains:

| Path | Purpose |
|---|---|
| `AGENT_REVIEW.md` | Human- and agent-readable screenshot index with a review focus for each screen |
| `manifest.json` | Exact URL, final URL, viewport, HTTP status, title, heading, overflow, browser errors, request failures, and automated defects |
| `screenshots/*.png` | Full-page desktop and mobile captures |
| `diagnostics/` | Compose process state and logs, including failed runs |

Generated artifacts are intentionally excluded from Git. GitHub Actions retains each packet for 14 days, while source-controlled route coverage lives in `visual-tests/routes.mjs`.

## Agent review procedure

1. Download the artifact for the commit being reviewed.
2. Read `AGENT_REVIEW.md` and open every screenshot.
3. Check the stated focus and look for clipping, blur, overlap, broken assets, wrong navigation, stale runtime state, misleading labels, inconsistent spacing, and mobile regressions.
4. Use `manifest.json` to correlate visual evidence with HTTP failures, console errors, failed requests, and measured horizontal overflow.
5. Report each issue with the screenshot filename, visible evidence, expected result, and likely affected component.

With GitHub CLI:

```bash
gh run list --workflow visual-qa.yml --limit 5
gh run download RUN_ID --name openface-visual-qa-RUN_ID --dir visual-review
```

An agent must not mark a UI task complete from HTTP 200 or the manifest alone. It must inspect the rendered PNGs.

## Run locally

Start OpenFace first, then run:

```bash
npm ci --prefix visual-tests
npm exec --prefix visual-tests -- playwright install chromium
npm run capture --prefix visual-tests
```

The output is written to `visual-tests/artifacts/`. A focused run can reduce iteration time:

```bash
VISUAL_QA_ROUTES=spaces,space-app VISUAL_QA_VIEWPORTS=desktop npm run capture --prefix visual-tests
```

In PowerShell:

```powershell
$env:VISUAL_QA_ROUTES = 'spaces,space-app'
$env:VISUAL_QA_VIEWPORTS = 'desktop'
npm run capture --prefix visual-tests
```

## Keep coverage current

When adding a new user-facing route or materially different page state, add it to `visual-tests/routes.mjs`. Use a stable seeded repository for detail pages. Give the entry a concrete `focus` description so the next agent knows what the screenshot is meant to prove.

The capture fails on navigation errors, HTTP errors, repository-not-found states, uncaught page errors, horizontal overflow, unavailable embedded applications, and contradictory Space runtime state. Console errors and failed requests are retained as review observations even when they do not independently fail the run.
