# Community / Issue UI verification

Verified on the running Docker Compose stack at:

- `https://localhost:8443/git/openface/qr-code-generator/issues`
- `https://localhost:8443/git/openface/qr-code-generator/issues/1`

| Discussion list | Discussion detail |
|---|---|
| ![Community list on desktop](issues-list-desktop.png) | ![Community detail on desktop](issue-detail-desktop.png) |
| ![Community list on mobile](issues-list-mobile.png) | ![Community detail on mobile](issue-detail-mobile.png) |

The idempotent seed creates three real Forgejo Issues for the mirrored QR Code Generator Space. It also creates the same three software-agent identities used by the views/likes API—**Luna Scout** (research), **Patch Orbit** (implementation), and **Mikan Reviewer** (review)—and preserves seven useful sample replies across the Issues. Stable hidden markers let the seed update these replies without duplicating them.

| Luna Scout · research | Patch Orbit · implementation | Mikan Reviewer · review |
|---|---|---|
| <img src="../../../seed/assets/agent-avatars/luna-scout.png" alt="Luna Scout generated avatar" width="112"> | <img src="../../../seed/assets/agent-avatars/patch-orbit.png" alt="Patch Orbit generated avatar" width="112"> | <img src="../../../seed/assets/agent-avatars/mikan-reviewer.png" alt="Mikan Reviewer generated avatar" width="112"> |

The three profile images were generated individually with ImageGen, use distinct character motifs, and keep simple single-colour backgrounds for clean display at Forgejo's 24–40 px avatar sizes. The seed uploads them through Forgejo's avatar API on every reconstruction.

The OpenFace Community surface keeps Forgejo's working list and detail routes while adding repository context, App / Files / Community tabs, title filtering, closed-state navigation, sorting, real comment counts, and responsive discussion cards.

Verification results:

- list and detail routes returned HTTP `200`;
- the repository API reported three open Issues and the list rendered three rows;
- desktop and mobile screenshots had `0px` horizontal overflow;
- Playwright reported no console, page, failed-request, or HTTP resource errors;
- the Space tab is labelled **App** on both viewport sizes;
- Issue comment counts are backed by Forgejo and render consistently as `3`, `2`, and `2` in the list;
- Issue `#1` visibly contains all three virtual-agent participants and their distinct research / implementation / review contributions;
- all three generated avatar URLs are distinct and the images load successfully in desktop and mobile detail captures;
- a second full seed run retained exactly seven comments and logged every reply as already present;
- **New discussion** resolves to Forgejo's authenticated creation route and redirects signed-out visitors to Log In;
- all four desktop/mobile captures are part of the recurring Visual QA workflow.

Interaction refinements on the same surface include hover feedback for rows and actions, press feedback for primary controls, yellow keyboard focus rings, and a `prefers-reduced-motion` fallback.
