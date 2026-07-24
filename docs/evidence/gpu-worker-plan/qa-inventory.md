# Remote GPU worker documentation QA inventory

## Requested outcome

- Preserve the proposed LXC control-plane and local GPU worker architecture as
  maintainable project documentation.

## User-facing artifacts

- English guide: `docs/guide/gpu-workers.md`
- Japanese guide: `docs/ja/guide/gpu-workers.md`
- English and Japanese VitePress navigation and sidebars
- Architecture cross-links in both locales
- README discovery links in both locales

## Signoff claims and checks

| Claim | Check |
|---|---|
| Both locales describe the same target architecture | Compare headings and diagrams in both guide files |
| The plan is discoverable | Inspect VitePress nav/sidebar config, architecture links, and README links |
| The proposal does not claim to be implemented | Confirm the status callout in both guides |
| Security boundaries are explicit | Confirm Docker API/socket, database, token, authorization, and Tailscale sections |
| Delivery is actionable | Confirm phases, API sketch, lifecycle, acceptance criteria, and rollback |
| Public docs remain buildable | Run `npm run docs:check` and `npm run docs:build` in `docs/` |
