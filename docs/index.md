---
layout: home

hero:
  name: OpenFace
  text: The AI community building locally.
  tagline: Run models, datasets, Docker Spaces, Skills, MCPs, versioned Prompts, and static Pages on one self-hosted Forgejo foundation.
  image:
    src: /openface.svg
    alt: OpenFace
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/Sunwood-ai-labs/OpenFace

features:
  - icon: 🧱
    title: One Compose stack
    details: Gateway, Next.js portal, Forgejo, Docker Space runner, seed catalog, and Forgejo Actions start together.
  - icon: 🚀
    title: Dockerfile-first Spaces
    details: Embed Gradio, static HTML, React, Vue, Next.js, Streamlit, FastAPI, Node.js, or another CPU-capable web app.
  - icon: 📚
    title: Git-backed catalogs
    details: Models, datasets, Skills, MCPs, and Prompts remain ordinary repositories with files, commits, tags, and clone URLs.
  - icon: 🌐
    title: OpenFace Pages
    details: Publish static sites from gh-pages or docs, including VitePress builds produced by the isolated Actions runner.
---

## A local-first platform, not a mock catalog

OpenFace keeps project metadata and source material in Forgejo, then adds a focused discovery portal and a Docker-backed application runtime. Public catalog entries link to real repositories. CPU Spaces start locally, and the same gateway serves the portal, Git UI, embedded apps, APIs, and Pages over HTTPS.

![OpenFace home](./images/openface-home.png)

Start with the [installation guide](./guide/getting-started.md), then review the [security boundary](./guide/operations.md#security-boundary) before allowing other users to publish Dockerfiles.
