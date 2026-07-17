# Docker Spaces

Every Space is a Forgejo repository with the `space` topic and a root `Dockerfile`. The container must listen on port `7860` and accept the path prefix supplied by OpenFace when the framework supports one.

## Supported application styles

The seed catalog demonstrates Gradio, static HTML, React, Vue, Next.js, Streamlit, FastAPI, and Node.js. These are examples rather than a hard allowlist: a CPU-capable web server that can be containerized and proxied can work.

## Repository metadata

Use README frontmatter for the card title, emoji, SDK label, and tags:

```yaml
---
title: Local audio utility
emoji: "🎧"
sdk: docker
tags:
  - audio
  - utility
---
```

The Forgejo `space` topic selects the catalog type. README `tags` classify the project inside its card; they do not replace the topic.

## Runtime behavior

- CPU Spaces can stay running when `IDLE_TIMEOUT_MINUTES=0`.
- The default running limit is 24 and can be changed with `MAX_RUNNING_SPACES`.
- At capacity, starting another Space stops the least recently accessed Space.
- Stopped public Spaces appear as **On demand** and can be started by a signed-in maintainer with write access.
- Browser views and agent API actions feed the same persisted metrics store.

## Security warning

The runner mounts `/var/run/docker.sock`. A malicious Dockerfile can control the Docker host. Review every Space repository and keep repository creation restricted to trusted users unless the runner host is disposable and isolated.
