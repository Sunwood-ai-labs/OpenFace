# Skill relationship metadata

OpenFace reads Skill-to-Skill relationships from `openface.skill.json` in the
root of each repository tagged with the `skill` topic. The file stays in the
same Git history as `SKILL.md`, so repository members can review, branch, edit,
and revert relationship changes through the normal Forgejo workflow.

## Schema

```json
{
  "schemaVersion": 1,
  "dependencies": [
    {
      "repo": "frontend-design-skill",
      "type": "recommended",
      "reason": "Refine product-facing documentation and Pages surfaces."
    },
    {
      "repo": "openface/security-review-skill",
      "type": "required",
      "reason": "Complete the security gate before publishing."
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Metadata contract version. Use `1`. |
| `dependencies[].repo` | Repository slug in the same organization, or a full `owner/repo` reference. |
| `dependencies[].type` | `required` for a hard workflow requirement; `recommended` for an optional pairing. |
| `dependencies[].reason` | Short explanation shown on the relationship card. |

OpenFace automatically derives **Referenced by** links from every public Skill
in the catalog. No reverse list needs to be maintained manually. Missing or
invalid metadata degrades to a visible **Standalone** state instead of breaking
the Skill directory.

## Editing

1. Open the Skill repository in Forgejo.
2. Create or edit `openface.skill.json` on the default branch.
3. Commit the change through a normal branch or pull-request workflow.
4. Reload the Skill page. OpenFace caches relationship files briefly, then
   rebuilds both dependency and reverse-reference views automatically.

