# OpenFace Pages verification

OpenFace Pages is a GitHub Pages-compatible static hosting path backed by
Forgejo repository files. It does not start a Docker Space and does not expose
private repository content.

## URL and source selection

- Published URL: `https://<host>:<https-port>/pages/<owner>/<repo>/`
- Source priority: the repository's public `gh-pages` branch, then `docs/` on
  the default branch when no `gh-pages` branch exists.
- The seed job creates `openface/pages-starter` and its `gh-pages` branch, so a
  clean `docker compose up -d --build` has a reproducible live example.

## Screenshot evidence

| Repository detection | Published static page |
|---|---|
| ![Repository detail with the OpenFace Pages card](repository-pages-card.png) | ![Published pages-starter site](pages-starter-live.png) |

The left capture shows that the repository detail detected `gh-pages` and
rendered the **Visit site** button. The right capture is the page rendered at
`/pages/openface/pages-starter/`; it is a real static HTML document, not a
Space pause screen or an iframe placeholder.

## Runtime checks

The final local checks were made against the HTTPS gateway:

| Request | Expected result | Observed result |
|---|---:|---:|
| `/pages/openface/pages-starter/` | HTML static site | `200`, `text/html; charset=utf-8` |
| `/pages/openface/enterprise-private-space/` | private content hidden | `404` |
| `/pages/openface/pages-starter/../README.md` | path traversal rejected | `404` |

`spaces-runner` obtains the file through Forgejo's authenticated API only after
checking the repository visibility. nginx exposes this handler only under
`/pages/`; all other OpenFace and Forgejo routes are unchanged.
