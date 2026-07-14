# Prompt verification evidence

Verified on 2026-07-15 against the running Docker Compose stack at
`http://localhost:8090`.

## What was verified

- `/prompts` returns **20** repositories classified with the `prompt` topic.
- The catalog contains ten prompt sources from
  [Sunwood-ai-labs/MysticLibrary](https://github.com/Sunwood-ai-labs/MysticLibrary)
  and ten Goal / planning command sources with MIT licenses.
- Every imported prompt repository contains `PROMPT.md` (verbatim source),
  `README.md` (rendered card + provenance), and `SOURCE.md` (durable source
  record).
- Each prompt has a separate `version-v*` topic. The UI renders it as an
  individual version badge on both the directory and the detail card.
- Prompt details link back to `/prompts`, show the version, source repository,
  source license, prompt body, file tree, and Forgejo fork/clone actions.
- The imported source uses its own front matter only in `PROMPT.md`; the
  rendered `README.md` removes that leading block so the prompt body is
  immediately readable.
- `npm run build`, all catalog source URLs, and a repeatable `seed` run passed.

## Reproducible catalog

The exact names, versions, license labels, and raw source URLs are in
[`seed/catalog/prompts.json`](../../../seed/catalog/prompts.json). The seed job
downloads those sources and creates one local Git repository per prompt.

## Screenshots

### Directory

![Prompt directory with Goal command and MysticLibrary sources](prompts-directory.png)

### Individual version detail

![Prompt detail with v4 badge, provenance, and source body](prompt-detail-version.png)
