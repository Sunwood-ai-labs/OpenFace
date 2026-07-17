# OpenFace visual QA

This directory creates a screenshot packet that a human or development agent can review after a UI change. It captures every major page type at desktop and mobile sizes, then records navigation status, headings, horizontal overflow, console errors, failed requests, HTTP resource errors, and full-page screenshots.

```bash
npm ci --prefix visual-tests
npm exec --prefix visual-tests -- playwright install chromium
npm run capture --prefix visual-tests
```

Open `visual-tests/artifacts/AGENT_REVIEW.md` and inspect every linked image. The adjacent `manifest.json` is the machine-readable source for automated agent feedback.

Environment variables:

- `VISUAL_QA_BASE_URL`: deployment URL; defaults to `https://localhost:8443`.
- `VISUAL_QA_OUTPUT_DIR`: artifact directory; defaults to `visual-tests/artifacts`.
- `VISUAL_QA_VIEWPORTS`: comma-separated viewport IDs such as `desktop` or `mobile`.
- `VISUAL_QA_ROUTES`: comma-separated route IDs from `routes.mjs` for focused checks.

Add a route to `routes.mjs` whenever a new user-facing page type is introduced. The CI workflow stores the complete packet as a downloadable artifact so future agents can fetch and visually review the exact rendered result.
