# Repository polish QA inventory

Updated: 2026-07-17

## Requested outcome

- Install and verify `Sunwood-ai-labs/repository-polish-skill` on this PC.
- Apply the skill in `完全整備` mode to the public OpenFace repository.
- Commit and push each coherent stage.
- Verify the finished repository locally, on GitHub, and with screenshots for user-facing documentation.

## Planned polish surfaces

- Root onboarding: `README.md`, `README.ja.md`, `.env.example`, and rebuild commands.
- Public project files: license, contribution, security, support, conduct, and GitHub templates.
- Browsable documentation: English and Japanese VitePress pages, navigation, screenshots, and build output.
- Automation: application CI, documentation CI, GitHub Pages deployment, and dependency updates.
- GitHub metadata: description, homepage, topics, visibility, default branch, Pages status, and workflow results.
- Repository hygiene: tracked diagnostics, generated output, secrets, oversized files, and clean working tree.

## User-facing QA routes

### README

- GitHub repository landing page in English.
- Japanese language switch and Japanese README.
- Quick start, architecture, security warning, screenshots, documentation links, and license section.

### Documentation

- English home and getting-started guide.
- Japanese home and getting-started guide.
- Architecture, Spaces, Pages, operations, and troubleshooting navigation.
- English/Japanese locale switch and links back to the GitHub repository.

### Product evidence

- OpenFace home at `https://localhost:8443/`.
- Spaces directory at `https://localhost:8443/spaces`.
- One running Space detail page.
- Prompt revision selection on a versioned Prompt detail page.

## Mechanical checks

- `docker compose config`
- frontend clean install and production build
- Python syntax compilation for `spaces-runner`
- VitePress clean install and production build
- Markdown links and referenced local images
- GitHub Actions workflow syntax and completed remote runs
- GitHub Pages enablement and published URL
- staged payload size review before every GitHub-bound commit
- final `git status`, local HEAD, and `origin/main` equality

## Final claims and required evidence

| Planned claim | Required evidence |
|---|---|
| The requested skill is installed and current | SHA-256 comparison against the specified GitHub commit |
| A fresh environment can rebuild OpenFace | documented prerequisites plus validated Compose configuration and clean-start commands |
| The repository has bilingual public documentation | parallel README/docs files, successful docs build, and browser screenshots |
| CI and Pages are operational | successful GitHub workflow runs and live Pages response |
| Public metadata is complete | `gh repo view` and Pages API output |
| No unintended payload was pushed | payload guard output and clean synchronized Git status |

This inventory is updated during signoff if the final change surface differs from the plan.

## Completed change inventory

| Surface | Completed work |
|---|---|
| Skill installation | Compared all 34 installed files with GitHub commit `89e98c1` by SHA-256 |
| Public project files | Added MIT license, third-party notices, contribution, support, conduct, security, Issue forms, and a PR template |
| Documentation | Added an editorial VitePress theme, bilingual field notes, connected Wiki nodes, metadata-rich guides, locked dependencies, identity assets, and Pages deployment |
| Repository landing | Rebuilt `README.md` in English, preserved and corrected `README.ja.md`, added language switches, screenshots, Docs links, badges, and security guidance |
| Application maintenance | Migrated Next.js 14 to supported Next.js 16 and React 19, updated asynchronous route props, and made Docker dependency installation deterministic |
| Automation | Added CI, Pages, Dependabot, compatible update grouping, and explicit major-version exclusion |
| GitHub metadata | Set the public description, Docs homepage, eleven repository topics, workflow Pages mode, and public governance links |
| Browser evidence | Captured GitHub README, English/Japanese Docs, OpenFace home, CPU Spaces, and immutable Prompt v4.2 views |

## Signoff results

- `docker compose config --quiet`: passed.
- frontend clean install, TypeScript check, Next.js production build, and Docker image build: passed.
- VitePress clean install and production build: passed with English and Japanese routes.
- `python -m compileall -q spaces-runner`: passed.
- GitHub CI on `main`: passed.
- GitHub Pages build and deployment: passed; English and Japanese URLs returned HTTP 200.
- GitHub Community Profile: 100%.
- Local Compose frontend recreated from the final image; home, Spaces, and Prompt v4.2 returned HTTP 200.
- Browser checks found no horizontal overflow on the tested OpenFace and Docs routes.
- README local links and images resolved, and GitHub rendered the identity, language links, passing badges, and product screenshot.
- Every direct polish commit passed the staged payload guard before push.

## 2026-07-21 editorial atlas follow-up

- Added matching English/Japanese article, Wiki, and guide inventories.
- Added a custom VitePress theme with dark mode and responsive layouts.
- Added `npm run docs:check` and made it a required step before the Pages build.
- Browser-tested English/Japanese home, article, and Wiki routes at 1440 × 1000 and 390 × 844.
- Click-tested dark-theme and mobile-navigation controls; browser console remained free of errors and warnings.
- Preserved the screenshot packet in [`docs/evidence/docs-atlas`](../evidence/docs-atlas/README.md).

## Known dependency note

`npm audit --omit=dev --audit-level=high` passes. npm still reports two moderate advisories through the version of PostCSS pinned internally by the latest stable Next.js 16.2.10. npm's suggested forced remediation downgrades Next.js to 9.3.3, so it was rejected as incompatible. Dependabot remains enabled for compatible fixes, while framework majors require an explicit tested migration.
