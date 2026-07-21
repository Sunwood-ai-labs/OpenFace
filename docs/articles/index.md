---
title: Field notes
type: article
description: Essays on the decisions, trade-offs, and evidence behind OpenFace.
readingTime: Curated reading
tags: [perspective, engineering, operations]
related:
  - title: Knowledge atlas
    link: /wiki/
    note: Look up the concepts behind each story.
  - title: Practical guides
    link: /guide/getting-started
    note: Turn context into action.
---

# Field notes

OpenFace is easier to operate when you understand why its parts exist. These pieces begin with a problem, follow the design decision, and end with links into the reference atlas and practical guides.

## Start with the idea

### [Why a local AI hub?](./local-first-hub.md)

Why the project treats Git repositories and Docker processes as the durable foundation, rather than recreating a cloud catalog in miniature.

### [Put another set of eyes before merge](./independent-review.md)

How a coordinator, specialist accounts, SHA-bound review, and fail-closed auto-merge form one auditable maintenance conversation.

### [A Space is an app and a repository](./docker-spaces.md)

Why a Dockerfile is the useful common denominator for Gradio, static sites, Next.js, Streamlit, FastAPI, and Node.js.

> Prefer facts over narrative? Enter the [Knowledge atlas](../wiki/index.md) or use local search from the navigation bar.
