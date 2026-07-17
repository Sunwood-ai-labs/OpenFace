# OpenFace Pages

OpenFace Pages serves static files from public repositories at:

```text
https://HOST/pages/OWNER/REPOSITORY/
```

The runner prefers the root of the `gh-pages` branch. If that branch is absent, it serves the `docs/` directory from the default branch. Private repositories return `404` and do not show a Pages card.

## Minimal static page

Create an orphan `gh-pages` branch, add `index.html`, and push it to the local Forgejo remote.

## VitePress with Forgejo Actions

The seeded `vitepress-pages-starter` repository contains a complete workflow. It checks out `main`, installs dependencies, builds with a repository-specific base path, replaces the `gh-pages` branch, and pushes the static output using the workflow token.

The Compose stack runs Forgejo Actions jobs in a dedicated Docker-in-Docker service. This keeps documentation builds away from the host Docker socket used by Spaces.

## Other frameworks

Any framework that produces static files can publish through the same branch: Vite, React static exports, Vue, Astro, plain HTML/CSS/JavaScript, and other static documentation generators. Server-rendered applications belong in Docker Spaces instead.
