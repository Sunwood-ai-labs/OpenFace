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
