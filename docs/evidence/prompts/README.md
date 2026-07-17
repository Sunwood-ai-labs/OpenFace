# Prompt verification evidence

Verified on 2026-07-17 against the running Docker Compose stack at
`https://localhost:8443` (the screenshot browser used an equivalent temporary
HTTP binding of the same production frontend image because the local HTTPS
certificate is self-signed).

## What was verified

- `/prompts` returns **20** repositories classified with the `prompt` topic.
- All 20 repositories use stable, version-independent slugs. For example,
  `mystic-git-auto-commit` remains the repository and clone URL when a new
  prompt version is added; the old `mystic-git-auto-commit-v4-2` slug is no
  longer displayed.
- The catalog contains ten prompt sources from
  [Sunwood-ai-labs/MysticLibrary](https://github.com/Sunwood-ai-labs/MysticLibrary)
  and ten Goal / planning command sources with MIT licenses.
- Every imported prompt repository contains `PROMPT.md` (verbatim source),
  `README.md` (rendered card + provenance), and `SOURCE.md` (durable source
  record).
- Each prompt has a separate `version-v*` topic. The UI renders it as an
  individual version badge on both the directory and the detail card.
- The directory's **Version tags** controls are generated from the actual
  repository topics. No `v7` / `v8` values are hardcoded in the frontend;
  selecting `v4.2` was verified to return only
  `openface/mystic-git-auto-commit`.
- The seed also creates the matching native Forgejo Git tag (`v1`, `v3`,
  `v4.2`, and so on) for all 20 imported prompts. The topic and Git tag are
  therefore the same individual prompt version, rather than a catalog-wide
  release number.
- Prompt details link back to `/prompts`, show the version, source repository,
  source license, prompt body, file tree, and Forgejo fork/clone actions.
- The imported source uses its own front matter only in `PROMPT.md`; the
  rendered `README.md` removes that leading block so the prompt body is
  immediately readable.
- The Forgejo API returned exactly 20 prompt repositories. The representative
  `openface/goal-research-cycle` repository returned topic `version-v1` and Git
  tag `v1`; its former versioned URL redirects to the stable slug after the
  history-preserving rename.
- `npm run build`, the Docker frontend build, the seed image build, and a
  repeatable `seed` run passed.

## Reproducible catalog

The exact names, versions, license labels, and raw source URLs are in
[`seed/catalog/prompts.json`](../../../seed/catalog/prompts.json). The seed job
downloads those sources and creates one local Git repository per prompt.

## Screenshots

### Directory

![Prompt directory with stable slugs and dynamically discovered version tags](prompts-directory.png)

### Individual version detail

![Stable prompt detail URL with v4.2 topic, badge, provenance, and source body](prompt-detail-version.png)
