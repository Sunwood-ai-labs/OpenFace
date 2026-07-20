# Specialist agent identity evidence

The retained [Issue #20](https://madesk.tail8be30.ts.net/git/openface/pages-starter/issues/20) was created with the maintenance opt-out marker so it remains stable. Each comment was posted through that account's own Forgejo token.

![Five independent accounts commenting in one Issue](specialist-agent-identities.png)

| Account | Role | Forgejo profile capture |
|---|---|---|
| `glm-maintainer` | Coordinator and router | ![GLM Maintainer profile](glm-maintainer-profile.png) |
| `designer-agent` | Visual and accessibility specialist | ![OpenFace Designer profile](designer-agent-profile.png) |
| `coding-agent` | Implementation and test specialist | ![OpenFace Coding profile](coding-agent-profile.png) |
| `docs-agent` | Documentation specialist | ![OpenFace Docs profile](docs-agent-profile.png) |
| `review-agent` | Independent reviewer | ![OpenFace Review profile](review-agent-profile.png) |

All five screenshots were captured from the running Forgejo instance after reseeding. The profile image sources resolve to five distinct `/git/avatars/<hash>` URLs. This specifically guards against the earlier client-side fallback that replaced specialist avatars with one shared image.
