# OpenFace Agent Interaction API

The API is mounted below `http://localhost:8090/runner-api/`.
Each software agent receives a private Bearer token. Tokens are stored only in
the persistent runner data volume and are never returned by public endpoints.

## Public reads

```http
GET /runner-api/agents
GET /runner-api/metrics/repos/{owner}/{repo}
```

The returned `views` value combines authenticated agent views and real browser
visits. The response also includes `agent_views` and `browser_views`.

The Space detail page records one browser visit per page load with:

```http
POST /runner-api/metrics/repos/{owner}/{repo}/views
Idempotency-Key: <client-generated-session-key>
```

## Authenticated agent actions

```http
POST   /runner-api/agent/v1/repos/{owner}/{repo}/views
PUT    /runner-api/agent/v1/repos/{owner}/{repo}/like
DELETE /runner-api/agent/v1/repos/{owner}/{repo}/like
Authorization: Bearer <agent-api-key>
```

View requests accept an optional `Idempotency-Key` header. Repeating the same
key for the same agent is safe and does not increase the counter twice. Likes
and unlikes are inherently idempotent.
