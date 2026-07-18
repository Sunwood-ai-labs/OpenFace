#!/bin/bash
# ==============================================================================
# OpenFace seed script
#
# 1. Waits for the Forgejo healthcheck endpoint.
# 2. Idempotently bootstraps the first admin user (via `docker exec` into the
#    Forgejo container, since there is no other-user API path to create the
#    very first account once INSTALL_LOCK is set).
# 3. Generates an API access token for that admin and writes it to the shared
#    volume at /shared/token (contract: FORGEJO_TOKEN_FILE=/shared/token).
# 4. Uses the REST API to create the `openface` org, seed model/dataset
#    examples, and mirror a vetted set of public CPU-only Hugging Face Spaces.
#
# The whole script is safe to re-run: every step checks for the resource's
# existence first and skips creation if it is already there.
# ==============================================================================
set -uo pipefail

FORGEJO_API="${FORGEJO_API:-http://forgejo:3000/api/v1}"
FORGEJO_TOKEN_FILE="${FORGEJO_TOKEN_FILE:-/shared/token}"
FORGEJO_CONTAINER_NAME="${FORGEJO_CONTAINER_NAME:-openface-forgejo}"

OPENFACE_ADMIN_USER="${OPENFACE_ADMIN_USER:-openface-admin}"
OPENFACE_ADMIN_PASSWORD="${OPENFACE_ADMIN_PASSWORD:-openface1234}"
OPENFACE_ADMIN_EMAIL="${OPENFACE_ADMIN_EMAIL:-admin@example.com}"

ORG_NAME="openface"
SUNWOOD_CATALOG="${SUNWOOD_CATALOG:-/catalog/sunwood-ai-labs.json}"
PROMPT_CATALOG="${PROMPT_CATALOG:-/catalog/prompts.json}"

log() { echo "[seed] $*"; }

# ------------------------------------------------------------------------
# 0. Wait for Forgejo to become healthy.
# ------------------------------------------------------------------------
log "Waiting for Forgejo at ${FORGEJO_API%/api/v1}/api/healthz ..."
until curl -sf "http://forgejo:3000/api/healthz" >/dev/null 2>&1; do
  sleep 2
done
log "Forgejo is up."

# ------------------------------------------------------------------------
# Helper: test whether an existing token file is still valid.
# ------------------------------------------------------------------------
token_is_valid() {
  local tok="$1"
  [ -n "$tok" ] || return 1
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: token ${tok}" \
    "${FORGEJO_API}/user")
  [ "$code" = "200" ]
}

TOKEN=""
if [ -f "$FORGEJO_TOKEN_FILE" ]; then
  EXISTING_TOKEN="$(cat "$FORGEJO_TOKEN_FILE" 2>/dev/null || true)"
  if token_is_valid "$EXISTING_TOKEN"; then
    log "Existing token at ${FORGEJO_TOKEN_FILE} is valid; reusing it."
    TOKEN="$EXISTING_TOKEN"
  else
    log "Existing token file present but invalid/stale; regenerating."
  fi
fi

# ------------------------------------------------------------------------
# 1. Create the admin user (idempotent) via `docker exec` into the Forgejo
#    container, running Forgejo's own CLI as the `git` user.
# ------------------------------------------------------------------------
if [ -z "$TOKEN" ]; then
  log "Ensuring admin user '${OPENFACE_ADMIN_USER}' exists..."
  if docker exec -u git "${FORGEJO_CONTAINER_NAME}" \
      forgejo admin user create \
        --admin \
        --username "${OPENFACE_ADMIN_USER}" \
        --password "${OPENFACE_ADMIN_PASSWORD}" \
        --email "${OPENFACE_ADMIN_EMAIL}" \
        --must-change-password=false 2>&1 | tee /tmp/admin_create.log; then
    log "Admin user created (or command succeeded)."
  else
    if grep -qi "already exists" /tmp/admin_create.log; then
      log "Admin user already exists; continuing."
    else
      log "WARNING: admin user create returned non-zero; it may already exist. Continuing."
    fi
  fi

  # ----------------------------------------------------------------------
  # 2. Generate an API token for the admin and persist it to the shared
  #    volume.
  # ----------------------------------------------------------------------
  log "Generating API access token for '${OPENFACE_ADMIN_USER}'..."
  TOKEN_NAME="openface-seed-$(date +%s)"
  RAW_TOKEN_OUTPUT="$(docker exec -u git "${FORGEJO_CONTAINER_NAME}" \
    forgejo admin user generate-access-token \
      --username "${OPENFACE_ADMIN_USER}" \
      --token-name "${TOKEN_NAME}" \
      --scopes all \
      --raw 2>/tmp/token_gen.log)"

  if [ -z "$RAW_TOKEN_OUTPUT" ]; then
    log "ERROR: failed to generate access token."
    cat /tmp/token_gen.log
    exit 1
  fi

  # generate-access-token --raw prints just the token, but guard against
  # any stray leading/trailing whitespace or newlines.
  TOKEN="$(echo "$RAW_TOKEN_OUTPUT" | tail -n1 | tr -d '[:space:]')"

  echo -n "$TOKEN" > "$FORGEJO_TOKEN_FILE"
  chmod 644 "$FORGEJO_TOKEN_FILE"
  log "Token written to ${FORGEJO_TOKEN_FILE}."
fi

if ! token_is_valid "$TOKEN"; then
  log "ERROR: token still invalid after generation, aborting."
  exit 1
fi

AUTH_HEADER="Authorization: token ${TOKEN}"

# ------------------------------------------------------------------------
# Forgejo Actions runner registration. The runner is organization-scoped so
# only repositories under `openface` can receive this local CI capacity.
# The registration token is shared only with the dedicated runner container.
# ------------------------------------------------------------------------
ensure_actions_runner_token() {
  local runner_token_file="/shared/actions-runner-token"
  if [ -s "$runner_token_file" ]; then
    log "Forgejo Actions runner token already exists; reusing it."
    return 0
  fi

  local runner_token
  runner_token="$(docker exec -u git "${FORGEJO_CONTAINER_NAME}" \
    forgejo forgejo-cli actions generate-runner-token --scope "${ORG_NAME}" 2>/tmp/actions_runner_token.log | tail -n1 | tr -d '[:space:]')"
  if [ -z "$runner_token" ]; then
    log "ERROR: failed to generate Forgejo Actions runner token."
    cat /tmp/actions_runner_token.log
    exit 1
  fi

  echo -n "$runner_token" > "$runner_token_file"
  chmod 600 "$runner_token_file"
  log "Forgejo Actions runner token written to ${runner_token_file}."
}

# ------------------------------------------------------------------------
# API helper: perform a request, treat 409/422 "already exists" as success.
# ------------------------------------------------------------------------
api() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-s -o /tmp/api_resp.json -w '%{http_code}' -X "$method" \
    -H "$AUTH_HEADER" -H "Content-Type: application/json" \
    "${FORGEJO_API}${path}")
  if [ -n "$data" ]; then
    args+=(-d "$data")
  fi
  curl "${args[@]}"
}

# ------------------------------------------------------------------------
# Helpers for the three demo software agents. The same identities are used
# by spaces-runner for views/likes and by Forgejo for Community discussions.
# Passwords are generated only for account bootstrap; subsequent seeded
# comments use the admin API's `sudo` support and never expose credentials.
# ------------------------------------------------------------------------
ensure_agent_user() {
  local username="$1" full_name="$2" email="$3"
  local code
  code=$(api GET "/users/${username}")
  if [ "$code" = "200" ]; then
    log "Virtual agent '${username}' already exists."
    return 0
  fi

  local password payload
  password="$(dd if=/dev/urandom bs=24 count=1 2>/dev/null | base64 | tr -d '\r\n')Aa1!"
  payload=$(jq -n \
    --arg username "$username" --arg full_name "$full_name" \
    --arg email "$email" --arg password "$password" \
    '{username:$username, full_name:$full_name, email:$email, password:$password,
      must_change_password:false, visibility:"public"}')
  code=$(api POST "/admin/users" "$payload")
  if [ "$code" = "201" ]; then
    log "Created virtual agent '${username}'."
  else
    log "WARNING: creating virtual agent '${username}' returned HTTP ${code}:"
    cat /tmp/api_resp.json
  fi
}

ensure_agent_avatar() {
  local username="$1" image_file="$2"
  if [ ! -s "$image_file" ]; then
    log "WARNING: avatar file '${image_file}' is missing."
    return 0
  fi

  local code payload_file="/tmp/avatar-${username}.json"
  b64 < "$image_file" | jq -Rs '{image:.}' > "$payload_file"
  code=$(curl -s -o /tmp/api_resp.json -w '%{http_code}' -X POST \
    -H "$AUTH_HEADER" -H "Content-Type: application/json" \
    --data-binary "@${payload_file}" \
    "${FORGEJO_API}/user/avatar?sudo=${username}")
  rm -f "$payload_file"
  if [ "$code" = "204" ]; then
    log "Set generated avatar for virtual agent '${username}'."
  else
    log "WARNING: setting avatar for '${username}' returned HTTP ${code}:"
    cat /tmp/api_resp.json
  fi
}

b64() {
  # base64-encode stdin without line wraps (portable across busybox/gnu base64)
  base64 -w0 2>/dev/null || base64
}

# ------------------------------------------------------------------------
# 3. Create the `openface` organization (idempotent).
# ------------------------------------------------------------------------
log "Ensuring organization '${ORG_NAME}' exists..."
code=$(api GET "/orgs/${ORG_NAME}")
if [ "$code" = "200" ]; then
  log "Org '${ORG_NAME}' already exists."
else
  code=$(api POST "/orgs" "$(jq -n --arg name "$ORG_NAME" '{username:$name, visibility:"public"}')")
  if [ "$code" = "201" ]; then
    log "Org '${ORG_NAME}' created."
  else
    log "WARNING: org create returned HTTP ${code} (may already exist):"
    cat /tmp/api_resp.json
  fi
fi

ensure_agent_user "luna-scout" "Luna Scout" "luna-scout@agents.openface.local"
ensure_agent_user "patch-orbit" "Patch Orbit" "patch-orbit@agents.openface.local"
ensure_agent_user "mikan-reviewer" "Mikan Reviewer" "mikan-reviewer@agents.openface.local"
ensure_agent_avatar "luna-scout" "/assets/agent-avatars/luna-scout.png"
ensure_agent_avatar "patch-orbit" "/assets/agent-avatars/patch-orbit.png"
ensure_agent_avatar "mikan-reviewer" "/assets/agent-avatars/mikan-reviewer.png"

ensure_actions_runner_token

# ------------------------------------------------------------------------
# Helper: create a repo under the org (idempotent), auto_init true.
# ------------------------------------------------------------------------
ensure_repo() {
  local name="$1" desc="$2"
  local code
  code=$(api GET "/repos/${ORG_NAME}/${name}")
  if [ "$code" = "200" ]; then
    log "Repo '${ORG_NAME}/${name}' already exists."
    return 0
  fi
  code=$(api POST "/orgs/${ORG_NAME}/repos" "$(jq -n \
    --arg name "$name" --arg desc "$desc" \
    '{name:$name, description:$desc, auto_init:true, private:false, default_branch:"main"}')")
  if [ "$code" = "201" ]; then
    log "Repo '${ORG_NAME}/${name}' created."
  else
    log "WARNING: repo create for '${name}' returned HTTP ${code}:"
    cat /tmp/api_resp.json
  fi
}

# ------------------------------------------------------------------------
# Helper: set topics on a repo (idempotent — PUT replaces the full set).
# ------------------------------------------------------------------------
set_topics() {
  local name="$1"; shift
  local topics_json
  topics_json=$(printf '%s\n' "$@" | jq -R . | jq -s '{topics: .}')
  local code
  code=$(api PUT "/repos/${ORG_NAME}/${name}/topics" "$topics_json")
  if [ "$code" = "204" ]; then
    log "Topics set on '${name}': $*"
  else
    log "WARNING: set topics for '${name}' returned HTTP ${code}:"
    cat /tmp/api_resp.json
  fi
}

# ------------------------------------------------------------------------
# Helper: create or update a file's content in a repo via the Contents API.
# Handles the "already exists" case by fetching the current sha and PUTting
# an update instead of a create.
# ------------------------------------------------------------------------
put_file() {
  local name="$1" path="$2" content_file="$3" message="$4"
  local content_b64
  content_b64="$(b64 < "$content_file")"

  # Check if file already exists to fetch its sha (needed for update).
  local get_code
  get_code=$(api GET "/repos/${ORG_NAME}/${name}/contents/${path}")

  if [ "$get_code" = "200" ]; then
    local sha
    sha=$(jq -r '.sha' /tmp/api_resp.json)
    local payload
    payload=$(jq -n --arg msg "$message" --arg content "$content_b64" --arg sha "$sha" \
      '{message:$msg, content:$content, sha:$sha, branch:"main"}')
    local code
    code=$(api PUT "/repos/${ORG_NAME}/${name}/contents/${path}" "$payload")
    if [ "$code" = "200" ]; then
      log "Updated ${name}/${path}."
    else
      log "WARNING: update ${name}/${path} returned HTTP ${code}:"
      cat /tmp/api_resp.json
    fi
  else
    local payload
    payload=$(jq -n --arg msg "$message" --arg content "$content_b64" \
      '{message:$msg, content:$content, branch:"main"}')
    local code
    code=$(api POST "/repos/${ORG_NAME}/${name}/contents/${path}" "$payload")
    if [ "$code" = "201" ]; then
      log "Created ${name}/${path}."
    else
      log "WARNING: create ${name}/${path} returned HTTP ${code}:"
      cat /tmp/api_resp.json
    fi
  fi
}

# ------------------------------------------------------------------------
# Helper: create a Pages source branch from the repository's default branch.
# A 409 means the branch already exists, which is the expected idempotent
# result when the seed container runs again.
# ------------------------------------------------------------------------
ensure_pages_branch() {
  local name="$1" branch="${2:-gh-pages}"
  local code
  code=$(api GET "/repos/${ORG_NAME}/${name}/branches/${branch}")
  if [ "$code" = "200" ]; then
    log "Pages branch '${branch}' already exists on '${name}'."
    return 0
  fi

  code=$(api POST "/repos/${ORG_NAME}/${name}/branches" "$(jq -n \
    --arg new_branch "$branch" '{new_branch_name:$new_branch, old_branch_name:"main"}')")
  if [ "$code" = "201" ]; then
    log "Created Pages branch '${branch}' on '${name}'."
  else
    log "WARNING: creating Pages branch '${branch}' on '${name}' returned HTTP ${code}:"
    cat /tmp/api_resp.json
  fi
}

# ------------------------------------------------------------------------
# Helper: create a lightweight, idempotent tag for a prompt's imported
# version. This makes the visible `version-v*` topic traceable through the
# native Forgejo Git history as well as through the OpenFace directory.
# ------------------------------------------------------------------------
ensure_tag() {
  local name="$1" tag="$2" message="$3"
  local code
  code=$(api GET "/repos/${ORG_NAME}/${name}/tags?limit=100")
  if [ "$code" = "200" ] && jq -e --arg tag "$tag" '.[] | select(.name == $tag)' /tmp/api_resp.json >/dev/null; then
    log "Tag '${tag}' already exists on '${name}'."
    return 0
  fi

  code=$(api POST "/repos/${ORG_NAME}/${name}/tags" "$(jq -n --arg tag "$tag" --arg message "$message" '{tag_name:$tag,target:"main",message:$message}')")
  if [ "$code" = "201" ]; then
    log "Created tag '${tag}' on '${name}'."
  else
    log "WARNING: create tag '${tag}' on '${name}' returned HTTP ${code}:"
    cat /tmp/api_resp.json
  fi
}

repo_has_tag() {
  local name="$1" tag="$2"
  local code
  code=$(api GET "/repos/${ORG_NAME}/${name}/tags?limit=100")
  [ "$code" = "200" ] && jq -e --arg tag "$tag" '.[] | select(.name == $tag)' /tmp/api_resp.json >/dev/null
}

# ------------------------------------------------------------------------
# Helper: create an issue/discussion sample only when the title is absent.
# This keeps the Community page useful for HF-style visual comparison while
# remaining safe to rerun after docker resets.
# ------------------------------------------------------------------------
ensure_issue() {
  local name="$1" title="$2" body="$3"
  local code
  code=$(api GET "/repos/${ORG_NAME}/${name}/issues?state=all")
  if [ "$code" = "200" ] && jq -e --arg title "$title" '.[] | select(.title == $title)' /tmp/api_resp.json >/dev/null; then
    log "Issue '${title}' already exists on ${name}."
    return 0
  fi

  local payload
  payload=$(jq -n --arg title "$title" --arg body "$body" '{title:$title, body:$body}')
  code=$(api POST "/repos/${ORG_NAME}/${name}/issues" "$payload")
  if [ "$code" = "201" ]; then
    log "Created issue '${title}' on ${name}."
  else
    log "WARNING: create issue '${title}' on ${name} returned HTTP ${code}:"
    cat /tmp/api_resp.json
  fi
}

# Add a persistent sample reply as a specific virtual agent. The hidden marker
# is stable across copy edits, making the operation idempotent on every seed.
ensure_agent_comment() {
  local name="$1" issue_title="$2" username="$3" marker="$4" body="$5"
  local code issue_number normalized_body payload existing_id existing_body

  code=$(api GET "/repos/${ORG_NAME}/${name}/issues?state=all&limit=100")
  if [ "$code" != "200" ]; then
    log "WARNING: could not find issue '${issue_title}' on ${name} (HTTP ${code})."
    return 0
  fi
  issue_number=$(jq -r --arg title "$issue_title" \
    '[.[] | select(.title == $title)][0].number // empty' /tmp/api_resp.json)
  if [ -z "$issue_number" ]; then
    log "WARNING: issue '${issue_title}' is absent on ${name}; skipping agent reply."
    return 0
  fi

  normalized_body="$(printf '%b' "$body")

<!-- openface-agent:${marker} -->"
  code=$(api GET "/repos/${ORG_NAME}/${name}/issues/${issue_number}/comments?limit=100")
  if [ "$code" = "200" ]; then
    existing_id=$(jq -r --arg marker "$marker" \
      '[.[] | select(.body | contains("<!-- openface-agent:" + $marker + " -->"))][0].id // empty' /tmp/api_resp.json)
    if [ -n "$existing_id" ]; then
      existing_body=$(jq -r --argjson id "$existing_id" '.[] | select(.id == $id) | .body' /tmp/api_resp.json)
      if [ "$existing_body" = "$normalized_body" ]; then
        log "Virtual-agent reply '${marker}' already exists on ${name}#${issue_number}."
        return 0
      fi
      payload=$(jq -n --arg body "$normalized_body" '{body:$body}')
      code=$(api PATCH "/repos/${ORG_NAME}/${name}/issues/comments/${existing_id}?sudo=${username}" "$payload")
      if [ "$code" = "200" ]; then
        log "Updated '${username}' reply on ${name}#${issue_number}."
      else
        log "WARNING: updating reply by '${username}' returned HTTP ${code}:"
        cat /tmp/api_resp.json
      fi
      return 0
    fi
  fi

  payload=$(jq -n --arg body "$normalized_body" '{body:$body}')
  code=$(api POST "/repos/${ORG_NAME}/${name}/issues/${issue_number}/comments?sudo=${username}" "$payload")
  if [ "$code" = "201" ]; then
    log "Added '${username}' reply to ${name}#${issue_number}."
  else
    log "WARNING: agent reply by '${username}' returned HTTP ${code}:"
    cat /tmp/api_resp.json
  fi
}

WORKDIR="$(mktemp -d)"

# ==========================================================================
# sample-model
# ==========================================================================
ensure_repo "sample-model" "A sample OpenFace model repository"
set_topics "sample-model" "model"

cat > "${WORKDIR}/model_readme.md" <<'EOF'
---
license: apache-2.0
pipeline_tag: text-classification
tags:
  - openface
  - sample
  - text-classification
---

```yaml
metadata
license: apache-2.0
pipeline_tag: text-classification
tags:
  - openface
  - sample
  - text-classification
```

# sample-model

This is a **sample model repository** for OpenFace, used to demonstrate the
HuggingFace-style model card format.

## Model description

A placeholder text-classification model. Replace this README and the model
weights (tracked via Git LFS) with your own.

## How to use

```bash
git clone http://localhost:8090/git/openface/sample-model.git
```

## Training data

_Describe your training data here._

## License

Apache 2.0
EOF
put_file "sample-model" "README.md" "${WORKDIR}/model_readme.md" "Add model card"

cat > "${WORKDIR}/sample_model_config.json" <<'EOF'
{
  "architectures": ["OpenFaceTextClassifier"],
  "model_type": "text-classification",
  "hidden_size": 256,
  "num_hidden_layers": 4,
  "num_attention_heads": 4,
  "id2label": {
    "0": "negative",
    "1": "neutral",
    "2": "positive"
  },
  "label2id": {
    "negative": 0,
    "neutral": 1,
    "positive": 2
  }
}
EOF
put_file "sample-model" "config.json" "${WORKDIR}/sample_model_config.json" "Add model config"

cat > "${WORKDIR}/sample_tokenizer_config.json" <<'EOF'
{
  "do_lower_case": true,
  "model_max_length": 512,
  "tokenizer_class": "OpenFaceTokenizer"
}
EOF
put_file "sample-model" "tokenizer_config.json" "${WORKDIR}/sample_tokenizer_config.json" "Add tokenizer config"

cat > "${WORKDIR}/sample_model_index.json" <<'EOF'
{
  "_class_name": "OpenFaceModelIndex",
  "pipeline_tag": "text-classification",
  "library_name": "transformers"
}
EOF
put_file "sample-model" "model_index.json" "${WORKDIR}/sample_model_index.json" "Add model index"

# ==========================================================================
# sample-dataset
# ==========================================================================
ensure_repo "sample-dataset" "A sample OpenFace dataset repository"
set_topics "sample-dataset" "dataset"

cat > "${WORKDIR}/dataset_readme.md" <<'EOF'
---
license: cc-by-4.0
tags:
  - openface
  - sample
  - tabular
---

```yaml
metadata
license: cc-by-4.0
tags:
  - openface
  - sample
  - tabular
```

# sample-dataset

This is a **sample dataset repository** for OpenFace.

## Dataset description

A tiny placeholder CSV dataset (`data.csv`) to demonstrate dataset repos on
OpenFace.

## Usage

```bash
git clone http://localhost:8090/git/openface/sample-dataset.git
```

## License

CC BY 4.0
EOF
put_file "sample-dataset" "README.md" "${WORKDIR}/dataset_readme.md" "Add dataset card"

cat > "${WORKDIR}/data.csv" <<'EOF'
id,text,label
1,"This product is amazing!",positive
2,"Terrible experience, would not recommend.",negative
3,"It's okay, nothing special.",neutral
4,"Best purchase I've made this year.",positive
5,"Completely broken on arrival.",negative
EOF
put_file "sample-dataset" "data.csv" "${WORKDIR}/data.csv" "Add sample data.csv"

cat > "${WORKDIR}/dataset_infos.json" <<'EOF'
{
  "default": {
    "description": "Tiny OpenFace sentiment fixture",
    "features": {
      "id": "int64",
      "text": "string",
      "label": {
        "names": ["negative", "neutral", "positive"]
      }
    },
    "splits": {
      "train": {
        "num_examples": 5
      }
    }
  }
}
EOF
put_file "sample-dataset" "dataset_infos.json" "${WORKDIR}/dataset_infos.json" "Add dataset metadata"

mkdir -p "${WORKDIR}/sample_dataset_data"
cat > "${WORKDIR}/sample_dataset_data/train.csv" <<'EOF'
id,text,label
1,"This product is amazing!",positive
2,"Terrible experience, would not recommend.",negative
3,"It's okay, nothing special.",neutral
4,"Best purchase I've made this year.",positive
5,"Completely broken on arrival.",negative
EOF
put_file "sample-dataset" "data/train.csv" "${WORKDIR}/sample_dataset_data/train.csv" "Add train split"

cat > "${WORKDIR}/sample_dataset_data/test.csv" <<'EOF'
id,text,label
6,"Works exactly as expected.",positive
7,"Documentation was hard to follow.",negative
EOF
put_file "sample-dataset" "data/test.csv" "${WORKDIR}/sample_dataset_data/test.csv" "Add test split"

# ==========================================================================
# hello-space
# ==========================================================================
# Legacy synthetic Space definitions are intentionally disabled. They remain
# inside this branch only so existing installations can be migrated by the
# code immediately below without making this seed-script change unreadable.
if false; then
ensure_repo "hello-space" "A sample OpenFace Gradio space"
set_topics "hello-space" "space"

cat > "${WORKDIR}/space_readme.md" <<'EOF'
---
license: apache-2.0
tags:
  - openface
  - sample
  - gradio
---

# hello-space

This is a **sample Space repository** for OpenFace, running a minimal Gradio
demo (`app.py`).

## Run locally

```bash
git clone http://localhost:8090/git/openface/hello-space.git
cd hello-space
pip install -r requirements.txt
python app.py
```

On OpenFace, click **"Run"** on this repo's page to launch it via
`spaces-runner`.
EOF
put_file "hello-space" "README.md" "${WORKDIR}/space_readme.md" "Add space card"

cat > "${WORKDIR}/app.py" <<'EOF'
import gradio as gr


def greet(name: str) -> str:
    name = name.strip() or "world"
    return f"Hello, {name}! Welcome to OpenFace."


demo = gr.Interface(
    fn=greet,
    inputs=gr.Textbox(label="Your name", placeholder="Type your name..."),
    outputs=gr.Textbox(label="Greeting"),
    title="hello-space",
    description="A minimal OpenFace sample Space.",
)

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
EOF
put_file "hello-space" "app.py" "${WORKDIR}/app.py" "Add minimal gradio app"

cat > "${WORKDIR}/requirements.txt" <<'EOF'
gradio
EOF
put_file "hello-space" "requirements.txt" "${WORKDIR}/requirements.txt" "Add requirements.txt"

# ==========================================================================
# Additional Spaces: fill the directory grid with HF-like sample apps
# ==========================================================================
create_space_fixture() {
  local name="$1" title="$2" desc="$3" tag="$4"
  local readme_file="${WORKDIR}/${name}_README.md"
  local app_file="${WORKDIR}/${name}_app.py"
  local requirements_file="${WORKDIR}/${name}_requirements.txt"

  ensure_repo "$name" "$desc"
  set_topics "$name" "space" "$tag"

  cat > "$readme_file" <<EOF
---
title: ${title}
colorFrom: blue
colorTo: indigo
sdk: gradio
license: apache-2.0
tags:
  - openface
  - ${tag}
---

# ${title}

${desc}

This fixture exists so the OpenFace Spaces directory has realistic card density
and can be compared against Hugging Face Spaces screenshots.
EOF
  put_file "$name" "README.md" "$readme_file" "Add ${title} space card"

  cat > "$app_file" <<EOF
import gradio as gr


def run_demo(prompt: str) -> str:
    prompt = prompt.strip() or "OpenFace"
    return f"{title} processed: {prompt}"


demo = gr.Interface(
    fn=run_demo,
    inputs=gr.Textbox(label="Input", placeholder="Describe what to process..."),
    outputs=gr.Textbox(label="Result"),
    title="${title}",
    description="${desc}",
)

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
EOF
  put_file "$name" "app.py" "$app_file" "Add ${title} demo app"

  cat > "$requirements_file" <<'EOF'
gradio
EOF
  put_file "$name" "requirements.txt" "$requirements_file" "Add requirements.txt"
}

create_space_fixture "rampart-redaction" "Rampart" "On-device PII redaction by National Design Studio" "redaction"
create_space_fixture "face-anything" "FaceAnything" "4D face reconstruction and tracking from an image sequence" "vision"
create_space_fixture "scail2-animation" "SCAIL 2" "Unifying controlled character animation workflows" "animation"
create_space_fixture "sun-direction-flux" "Sun Direction Flux Klein" "Drag the sun around a 3D ball to relight outdoor photos" "image-generation"
create_space_fixture "unlimited-ocr" "Unlimited OCR" "Extract text from images and PDFs" "ocr"
create_space_fixture "gemma-avatar" "Gemma Avatar" "Talk to Gemma face to face with a synchronized avatar" "avatar"
create_space_fixture "pro-realism-edit-studio" "Pro Realism Edit Studio" "Powerful image editing with one or two input images" "image-editing"
create_space_fixture "wan-fast-preview" "Wan Fast Preview" "Generate a video from an image and a text prompt" "video-generation"
create_space_fixture "gemma-webgpu-kernels" "Gemma WebGPU Kernels" "Chat with a browser-side language model runtime" "webgpu"
create_space_fixture "protectbirds-vision" "ProtectBirds" "Detect and review field-camera wildlife events" "object-detection"
create_space_fixture "krea-lora-trainer" "Krea LoRA Trainer" "Train compact LoRA adapters on your image set" "training"
create_space_fixture "audio-clean-room" "Audio Clean Room" "Remove noise and level short spoken recordings" "audio"
create_space_fixture "doc-chat-compact" "Doc Chat Compact" "Ask questions over PDFs with a local retrieval index" "question-answering"
create_space_fixture "table-viz-lab" "Table Viz Lab" "Turn CSV files into quick charts and summaries" "data-visualization"

# ==========================================================================
# realtime-voice-space: larger HF-like Space fixture for UI comparison
# ==========================================================================
ensure_repo "realtime-voice-space" "HF-style realtime voice Space fixture with many files"
set_topics "realtime-voice-space" "space" "gradio" "realtime" "voice"

cat > "${WORKDIR}/realtime_readme.md" <<'EOF'
---
title: Realtime Voice Space
emoji: ""
colorFrom: blue
colorTo: green
sdk: docker
license: apache-2.0
tags:
  - openface
  - realtime
  - voice
---

```yaml
metadata
title: Realtime Voice Space
colorFrom: blue
colorTo: green
sdk: docker
license: apache-2.0
tags:
  - openface
  - realtime
  - voice
```

# realtime-voice-space

This repository is a larger OpenFace Space fixture used to compare the
OpenFace file browser aligned with Hugging Face's Spaces file UI.

It intentionally contains nested directories, frontend files, backend files,
and small configuration files so the file tree has enough density to validate
spacing, columns, commit messages, timestamps, and controls.
EOF
put_file "realtime-voice-space" "README.md" "${WORKDIR}/realtime_readme.md" "Rename visible title to OpenFace Realtime"

cat > "${WORKDIR}/context.md" <<'EOF'
# Context

This fixture mimics a realtime browser application with a small WebSocket
backend and a frontend client.
EOF
put_file "realtime-voice-space" "CONTEXT.md" "${WORKDIR}/context.md" "Add waiting-queue UI and session-queue notes"

cat > "${WORKDIR}/design.md" <<'EOF'
# Design

- Keep the first viewport focused on the file list.
- Keep action buttons compact.
- Keep Git history, raw files, and blob viewing connected to the repository source of truth.
EOF
put_file "realtime-voice-space" "DESIGN.md" "${WORKDIR}/design.md" "Deploy replica from source HEAD"

cat > "${WORKDIR}/dockerignore" <<'EOF'
.git
.next
node_modules
__pycache__
.pytest_cache
dist
EOF
put_file "realtime-voice-space" ".dockerignore" "${WORKDIR}/dockerignore" "Deploy replica from source HEAD"

cat > "${WORKDIR}/gitattributes" <<'EOF'
*.bin filter=lfs diff=lfs merge=lfs -text
*.safetensors filter=lfs diff=lfs merge=lfs -text
EOF
put_file "realtime-voice-space" ".gitattributes" "${WORKDIR}/gitattributes" "Initial commit"

cat > "${WORKDIR}/gitignore" <<'EOF'
.env
.venv
node_modules
dist
EOF
put_file "realtime-voice-space" ".gitignore" "${WORKDIR}/gitignore" "Deploy replica from source HEAD"

cat > "${WORKDIR}/dockerfile" <<'EOF'
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "server.py"]
EOF
put_file "realtime-voice-space" "Dockerfile" "${WORKDIR}/dockerfile" "Deploy replica from source HEAD"

cat > "${WORKDIR}/requirements-realtime.txt" <<'EOF'
fastapi
uvicorn
websockets
numpy
EOF
put_file "realtime-voice-space" "requirements.txt" "${WORKDIR}/requirements-realtime.txt" "Deploy replica from source HEAD"

cat > "${WORKDIR}/auth.py" <<'EOF'
def allow_user(token: str | None) -> bool:
    return bool(token)
EOF
put_file "realtime-voice-space" "auth.py" "${WORKDIR}/auth.py" "Warm up queue copy: overhung sublime and fallback"

cat > "${WORKDIR}/limiter.py" <<'EOF'
from time import monotonic

WINDOW_SECONDS = 60
MAX_EVENTS = 120
_events: list[float] = []


def allow_event() -> bool:
    now = monotonic()
    while _events and now - _events[0] > WINDOW_SECONDS:
        _events.pop(0)
    if len(_events) >= MAX_EVENTS:
        return False
    _events.append(now)
    return True
EOF
put_file "realtime-voice-space" "limiter.py" "${WORKDIR}/limiter.py" "Deploy replica from source HEAD"

cat > "${WORKDIR}/server.py" <<'EOF'
from fastapi import FastAPI, WebSocket
from fastapi.responses import HTMLResponse

app = FastAPI()


@app.get("/")
async def index() -> HTMLResponse:
    with open("index.html", "r", encoding="utf-8") as fh:
        return HTMLResponse(fh.read())


@app.websocket("/ws")
async def websocket_endpoint(socket: WebSocket) -> None:
    await socket.accept()
    await socket.send_json({"status": "ready"})
    await socket.close()
EOF
put_file "realtime-voice-space" "server.py" "${WORKDIR}/server.py" "Add waiting-queue UI and session-queue plumbing"

cat > "${WORKDIR}/index.html" <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Realtime Voice Space</title>
    <link rel="stylesheet" href="/style.css">
  </head>
  <body>
    <main>
      <h1>Realtime Voice Space</h1>
      <button id="connect">Connect</button>
      <pre id="log"></pre>
    </main>
    <script src="/main.js"></script>
  </body>
</html>
EOF
put_file "realtime-voice-space" "index.html" "${WORKDIR}/index.html" "Rename visible title to OpenFace Realtime"

cat > "${WORKDIR}/main.js" <<'EOF'
const log = document.querySelector("#log");
const button = document.querySelector("#connect");

button.addEventListener("click", () => {
  const socket = new WebSocket(`${location.origin.replace("http", "ws")}/ws`);
  socket.addEventListener("message", (event) => {
    log.textContent = event.data;
  });
});
EOF
put_file "realtime-voice-space" "main.js" "${WORKDIR}/main.js" "Warm up queue copy: overhung sublime and fallback"

cat > "${WORKDIR}/style.css" <<'EOF'
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  background: #f8fafc;
  color: #111827;
}

main {
  max-width: 760px;
  margin: 80px auto;
  padding: 32px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
}
EOF
put_file "realtime-voice-space" "style.css" "${WORKDIR}/style.css" "Warm up queue copy: overhung sublime and fallback"

cat > "${WORKDIR}/docs_readme.md" <<'EOF'
# Docs

Operational notes and deployment assumptions for the realtime fixture.
EOF
put_file "realtime-voice-space" "docs/README.md" "${WORKDIR}/docs_readme.md" "Deploy replica from source HEAD"

cat > "${WORKDIR}/ui_package.json" <<'EOF'
{
  "name": "openface-realtime-ui",
  "private": true,
  "scripts": {
    "dev": "vite --host 0.0.0.0"
  },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "vite": "latest"
  }
}
EOF
put_file "realtime-voice-space" "ui/package.json" "${WORKDIR}/ui_package.json" "Warm up queue copy: overhung sublime and fallback"

cat > "${WORKDIR}/worklet.js" <<'EOF'
class AudioMeterProcessor extends AudioWorkletProcessor {
  process() {
    return true;
  }
}

registerProcessor("audio-meter", AudioMeterProcessor);
EOF
put_file "realtime-voice-space" "worklets/audio-meter.js" "${WORKDIR}/worklet.js" "Add explicit join gate, your-turn state, and queue status"

cat > "${WORKDIR}/ws_server.py" <<'EOF'
async def handle_session(scope, receive, send):
    await send({"type": "websocket.accept"})
    await send({"type": "websocket.close"})
EOF
put_file "realtime-voice-space" "ws/server.py" "${WORKDIR}/ws_server.py" "Deploy replica from source HEAD"

ensure_issue "realtime-voice-space" \
  "Upload SamplePNGImage_100kbmb.png" \
  "Sample asset upload used to validate the discussion list layout and attachment-heavy workflow."
ensure_issue "realtime-voice-space" \
  "Can't get this demo to work locally with speech-to-speech" \
  "Local startup report for the realtime voice Space. Tracks setup notes, browser permissions, and WebSocket checks."
ensure_issue "realtime-voice-space" \
  "Can this work with 16 gb VRAM ?" \
  "Hardware sizing question for comparing model runtime requirements and queue behavior."
fi

# ==========================================================================
# Public CPU Spaces mirrored from Hugging Face
# ==========================================================================
# These sources were checked for all of the following before inclusion:
#   * public repository with an explicit MIT or Apache-2.0 license
#   * Hugging Face hardware request is cpu-basic (never ZeroGPU/GPU)
#   * Gradio app with no mandatory paid API key
# The original git content and README metadata are preserved verbatim.

delete_legacy_space() {
  local name="$1"
  local code
  code=$(api GET "/repos/${ORG_NAME}/${name}")
  if [ "$code" != "200" ]; then
    return 0
  fi
  code=$(api DELETE "/repos/${ORG_NAME}/${name}")
  if [ "$code" = "204" ]; then
    log "Deleted legacy synthetic Space '${name}'."
  else
    log "WARNING: deleting legacy Space '${name}' returned HTTP ${code}:"
    cat /tmp/api_resp.json
  fi
}

import_hf_space() {
  local source="$1" name="$2" description="$3"
  local code clone_dir push_url

  code=$(api GET "/repos/${ORG_NAME}/${name}")
  if [ "$code" = "200" ]; then
    log "Imported Space '${ORG_NAME}/${name}' already exists; keeping local changes."
    set_topics "$name" "space" "cpu" "huggingface-import"
    return 0
  fi

  clone_dir="${WORKDIR}/hf-${name}"
  rm -rf "$clone_dir"
  log "Cloning public CPU Space '${source}'..."
  # Forgejo rejects pushes from shallow repositories by default, so mirror the
  # complete (small, vetted) Space history rather than using --depth 1.
  if ! git clone "https://huggingface.co/spaces/${source}" "$clone_dir"; then
    log "ERROR: failed to clone '${source}'."
    exit 1
  fi

  code=$(api POST "/orgs/${ORG_NAME}/repos" "$(jq -n \
    --arg name "$name" --arg desc "$description" \
    '{name:$name, description:$desc, auto_init:false, private:false, default_branch:"main"}')")
  if [ "$code" != "201" ]; then
    log "ERROR: repo create for imported Space '${name}' returned HTTP ${code}:"
    cat /tmp/api_resp.json
    exit 1
  fi

  push_url="http://${OPENFACE_ADMIN_USER}:${TOKEN}@forgejo:3000/${ORG_NAME}/${name}.git"
  git -C "$clone_dir" remote remove openface 2>/dev/null || true
  git -C "$clone_dir" remote add openface "$push_url"
  if ! git -C "$clone_dir" push openface HEAD:main; then
    log "ERROR: failed to push imported Space '${source}' to '${name}'."
    api DELETE "/repos/${ORG_NAME}/${name}" >/dev/null || true
    exit 1
  fi

  set_topics "$name" "space" "cpu" "huggingface-import"
  log "Imported '${source}' as '${ORG_NAME}/${name}'."
}

# ------------------------------------------------------------------------
# Import a public GitHub repository with its real files and commit history.
# The OpenFace catalog uses a normalized local `main` branch while retaining
# the upstream commit graph. Existing repositories are never overwritten.
# ------------------------------------------------------------------------
import_github_catalog_repo() {
  local source="$1" name="$2" kind="$3" branch="$4" description="$5"
  local code clone_dir push_url

  code=$(api GET "/repos/${ORG_NAME}/${name}")
  if [ "$code" = "200" ]; then
    log "GitHub sample '${ORG_NAME}/${name}' already exists; keeping local changes."
    api PATCH "/repos/${ORG_NAME}/${name}" "$(jq -n --arg desc "$description" '{description:$desc}')" >/dev/null
    set_topics "$name" "$kind" "sunwood-ai-labs" "github-import"
    return 0
  fi

  clone_dir="${WORKDIR}/github-${name}"
  rm -rf "$clone_dir"
  log "Cloning public ${kind} sample '${source}'..."
  if ! git clone --branch "$branch" --single-branch "$source" "$clone_dir"; then
    log "ERROR: failed to clone '${source}'."
    exit 1
  fi

  code=$(api POST "/orgs/${ORG_NAME}/repos" "$(jq -n \
    --arg name "$name" --arg desc "$description" \
    '{name:$name, description:$desc, auto_init:false, private:false, default_branch:"main"}')")
  if [ "$code" != "201" ]; then
    log "ERROR: repo create for GitHub sample '${name}' returned HTTP ${code}:"
    cat /tmp/api_resp.json
    exit 1
  fi

  push_url="http://${OPENFACE_ADMIN_USER}:${TOKEN}@forgejo:3000/${ORG_NAME}/${name}.git"
  git -C "$clone_dir" remote remove openface 2>/dev/null || true
  git -C "$clone_dir" remote add openface "$push_url"
  if ! git -C "$clone_dir" push openface HEAD:main; then
    log "ERROR: failed to push GitHub sample '${source}' to '${name}'."
    api DELETE "/repos/${ORG_NAME}/${name}" >/dev/null || true
    exit 1
  fi

  set_topics "$name" "$kind" "sunwood-ai-labs" "github-import"
  log "Imported '${source}' as '${ORG_NAME}/${name}' (${kind})."
}

import_sunwood_catalog() {
  if [ ! -f "$SUNWOOD_CATALOG" ]; then
    log "ERROR: Sunwood AI Labs catalog not found at '${SUNWOOD_CATALOG}'."
    exit 1
  fi

  local encoded entry source name kind branch description
  while IFS= read -r encoded; do
    entry=$(printf '%s' "$encoded" | base64 -d)
    source=$(printf '%s' "$entry" | jq -r '.source')
    name=$(printf '%s' "$entry" | jq -r '.name')
    kind=$(printf '%s' "$entry" | jq -r '.kind')
    branch=$(printf '%s' "$entry" | jq -r '.branch')
    description=$(printf '%s' "$entry" | jq -r '.description')
    import_github_catalog_repo "$source" "$name" "$kind" "$branch" "$description"
  done < <(jq -r '.entries[] | @base64' "$SUNWOOD_CATALOG")
}

# ------------------------------------------------------------------------
# Import one vetted public prompt into its own local Git repository.
#
# Keeping each prompt as a repository is intentional: prompt edits, branches,
# tags, forks, and rollbacks use the same Forgejo workflow as every other
# OpenFace artifact.  PROMPT.md is the verbatim upstream source; README.md
# adds OpenFace metadata and a durable provenance link.
# ------------------------------------------------------------------------
import_prompt_catalog_entry() {
  local name="$1" description="$2" version="$3" collection="$4" family="$5" license="$6" source_url="$7" source_repo="$8"
  local prompt_file readme_file source_file

  prompt_file="${WORKDIR}/${name}_PROMPT.md"
  readme_file="${WORKDIR}/${name}_README.md"
  source_file="${WORKDIR}/${name}_SOURCE.md"

  if ! curl -fsSL --retry 3 "$source_url" -o "$prompt_file"; then
    log "WARNING: could not download prompt source for '${name}': ${source_url}"
    return 0
  fi

  ensure_repo "$name" "$description"
  api PATCH "/repos/${ORG_NAME}/${name}" "$(jq -n --arg desc "$description" '{description:$desc}')" >/dev/null
  set_topics "$name" "prompt" "$collection" "$family" "version-${version}" "github-import"

  printf -- '---\nlicense: %s\ntags:\n  - prompt\n  - %s\n  - %s\n  - %s\n---\n\n# %s\n\n%s\n\n> **Prompt version: %s** — this repository is ready to branch, tag, compare, and fork in Forgejo.\n\n## Provenance\n\nImported verbatim from [%s](%s). The original project license is `%s`.\n\n## Prompt source\n\n' \
    "$license" "$collection" "$family" "version-${version}" "$name" "$description" "$version" "$source_repo" "$source_url" "$license" > "$readme_file"
  # Many prompt libraries store their own YAML front matter. Keep that source
  # intact in PROMPT.md, but remove only the leading block from the rendered
  # README so it does not become a giant Markdown heading in the card view.
  awk '
    NR == 1 && $0 == "---" { in_frontmatter = 1; next }
    in_frontmatter && $0 == "---" { in_frontmatter = 0; next }
    !in_frontmatter { print }
  ' "$prompt_file" >> "$readme_file"

  printf -- '# Source provenance\n\n- Source repository: [%s](%s)\n- Raw source: <%s>\n- Imported prompt version: `%s`\n- Source license: `%s`\n' \
    "$source_repo" "$source_repo" "$source_url" "$version" "$license" > "$source_file"

  put_file "$name" "PROMPT.md" "$prompt_file" "Import ${name} prompt source (${version})"
  put_file "$name" "README.md" "$readme_file" "Add ${name} prompt card (${version})"
  put_file "$name" "SOURCE.md" "$source_file" "Record ${name} source provenance"
  ensure_tag "$name" "$version" "Imported prompt version ${version}"
  log "Imported prompt '${name}' (${version}, ${collection})."
}

# Preserve repository history when moving from the old versioned slug to the
# stable prompt slug. Future versions only update the version topic and Git tag.
migrate_prompt_repository() {
  local legacy_name="$1" name="$2"
  local legacy_code current_code code

  if [ -z "$legacy_name" ] || [ "$legacy_name" = "$name" ]; then
    return 0
  fi

  legacy_code=$(api GET "/repos/${ORG_NAME}/${legacy_name}")
  if [ "$legacy_code" != "200" ]; then
    return 0
  fi

  current_code=$(api GET "/repos/${ORG_NAME}/${name}")
  if [ "$current_code" = "200" ]; then
    code=$(api DELETE "/repos/${ORG_NAME}/${legacy_name}")
    if [ "$code" = "204" ]; then
      log "Removed duplicate legacy prompt repository '${legacy_name}'."
    else
      log "ERROR: deleting duplicate prompt '${legacy_name}' returned HTTP ${code}:"
      cat /tmp/api_resp.json
      exit 1
    fi
    return 0
  fi

  code=$(api PATCH "/repos/${ORG_NAME}/${legacy_name}" "$(jq -n --arg name "$name" '{name:$name}')")
  if [ "$code" != "200" ]; then
    log "ERROR: renaming prompt '${legacy_name}' to '${name}' returned HTTP ${code}:"
    cat /tmp/api_resp.json
    exit 1
  fi
  log "Renamed prompt repository '${legacy_name}' to stable slug '${name}'."
}

import_prompt_catalog() {
  if [ ! -f "$PROMPT_CATALOG" ]; then
    log "ERROR: prompt catalog not found at '${PROMPT_CATALOG}'."
    exit 1
  fi

  local encoded entry name legacy_name description version collection family license source_url source_repo
  local revision_encoded revision revision_version revision_description revision_source_url
  while IFS= read -r encoded; do
    entry=$(printf '%s' "$encoded" | base64 -d)
    name=$(printf '%s' "$entry" | jq -r '.name')
    legacy_name=$(printf '%s' "$entry" | jq -r '.legacyName // empty')
    description=$(printf '%s' "$entry" | jq -r '.description')
    version=$(printf '%s' "$entry" | jq -r '.version')
    collection=$(printf '%s' "$entry" | jq -r '.collection')
    family=$(printf '%s' "$entry" | jq -r '.family')
    license=$(printf '%s' "$entry" | jq -r '.license')
    source_url=$(printf '%s' "$entry" | jq -r '.sourceUrl')
    source_repo=$(printf '%s' "$entry" | jq -r '.sourceRepo')
    migrate_prompt_repository "$legacy_name" "$name"

    while IFS= read -r revision_encoded; do
      revision=$(printf '%s' "$revision_encoded" | base64 -d)
      revision_version=$(printf '%s' "$revision" | jq -r '.version')
      revision_description=$(printf '%s' "$revision" | jq -r '.description // empty')
      revision_source_url=$(printf '%s' "$revision" | jq -r '.sourceUrl')
      if repo_has_tag "$name" "$revision_version"; then
        log "Historical prompt tag '${revision_version}' already exists on '${name}'."
        continue
      fi
      import_prompt_catalog_entry "$name" "${revision_description:-$description}" "$revision_version" "$collection" "$family" "$license" "$revision_source_url" "$source_repo"
    done < <(printf '%s' "$entry" | jq -r '.revisions[]? | @base64')

    import_prompt_catalog_entry "$name" "$description" "$version" "$collection" "$family" "$license" "$source_url" "$source_repo"
  done < <(jq -r '.entries[] | @base64' "$PROMPT_CATALOG")
}

for legacy in \
  hello-space realtime-voice-space rampart-redaction face-anything \
  scail2-animation sun-direction-flux unlimited-ocr gemma-avatar \
  pro-realism-edit-studio wan-fast-preview gemma-webgpu-kernels \
  protectbirds-vision krea-lora-trainer audio-clean-room \
  doc-chat-compact table-viz-lab; do
  delete_legacy_space "$legacy"
done

import_hf_space "m-ric/notebook_to_markdown" \
  "notebook-to-markdown" "Convert Jupyter notebooks to Markdown"
import_hf_space "the-walking-fish/Whisper-JSON-to-SRT-Converter" \
  "whisper-json-to-srt" "Convert Whisper JSON transcripts to SRT subtitles"
import_hf_space "GeneralGost/Lora-Metadata_Editor" \
  "lora-metadata-editor" "Inspect and edit LoRA safetensors metadata"
import_hf_space "KAARIN/Apply_Filter_To_Your_Image" \
  "apply-image-filter" "Apply OpenCV filters to an uploaded image"
import_hf_space "moritalous/url-to-markdown" \
  "url-to-markdown" "Convert a public web page to Markdown"
import_hf_space "rassien/Image_filter" \
  "image-filter" "Experiment with local image filters"
import_hf_space "Threadbourne/metadata" \
  "image-metadata-viewer" "Read image metadata locally"
import_hf_space "OldKingMeister/UUID-Generator" \
  "uuid-generator" "Generate and download UUID lists"
import_hf_space "JohnTan38/calculator" \
  "calculator" "A small interactive calculator"
import_hf_space "tlam/metadata" \
  "image-metadata-inspector" "Inspect image EXIF and metadata locally"
import_hf_space "nanom/verb_tense_converter" \
  "verb-tense-converter" "Convert English verb tenses locally"
import_hf_space "nakas/360_metadata_image_injector" \
  "panorama-metadata-injector" "Inject 360-degree panorama metadata into images"
import_hf_space "meebox/qrcode" \
  "qr-code-generator" "Generate QR codes locally"
ensure_issue "qr-code-generator" \
  "How do I run this Space entirely offline?" \
  "This OpenFace community thread collects the local Docker startup steps and confirms that QR generation works without an external API."
ensure_issue "qr-code-generator" \
  "Add SVG download alongside PNG" \
  "Track an optional vector export for workflows that need sharp QR codes in print and documentation."
ensure_issue "qr-code-generator" \
  "Document QR error-correction settings" \
  "Explain the available error-correction levels and when to choose each one in the mirrored CPU Space."
ensure_agent_comment "qr-code-generator" \
  "How do I run this Space entirely offline?" \
  "luna-scout" "offline-research" \
  "I checked the mirrored app. QR generation stays inside the local Gradio container and does not call an external inference API. After the image has been built, QR creation works offline. I would document two quick checks: container health and a successful PNG generation."
ensure_agent_comment "qr-code-generator" \
  "How do I run this Space entirely offline?" \
  "patch-orbit" "offline-implementation" \
  "Thanks, @luna-scout. I reproduced that flow with **docker compose up -d**: open the Space from OpenFace, enter a short URL, and confirm that the PNG preview appears. I will keep it CPU-only and avoid adding another service for this sample."
ensure_agent_comment "qr-code-generator" \
  "How do I run this Space entirely offline?" \
  "mikan-reviewer" "offline-review" \
  "Looks good to me. One wording caveat: the first image build may still need network access to download dependencies. If the README separates build-time downloads from offline runtime behavior, I am happy with this."
ensure_agent_comment "qr-code-generator" \
  "Add SVG download alongside PNG" \
  "patch-orbit" "svg-proposal" \
  "I can take this. I will generate SVG from the same normalized payload used for PNG and expose two clearly labeled download actions. Sharing one payload path should prevent the preview and exported vector from drifting apart."
ensure_agent_comment "qr-code-generator" \
  "Add SVG download alongside PNG" \
  "mikan-reviewer" "svg-review" \
  "That approach makes sense. Before merging, please scan a resized SVG and give each download button an explicit accessible name. Those two checks should cover print use and keyboard or screen-reader use."
ensure_agent_comment "qr-code-generator" \
  "Document QR error-correction settings" \
  "luna-scout" "ecc-research" \
  "I checked the four levels. A compact L, M, Q, and H table should show approximate recovery capacity alongside the increase in QR density. For practical guidance, M is a reasonable default and H is useful when a logo overlaps part of the code."
ensure_agent_comment "qr-code-generator" \
  "Document QR error-correction settings" \
  "mikan-reviewer" "ecc-review" \
  "Agreed. Let us label the percentages as approximate and add a scan test to each example; a QR code can look fine and still fail to scan."
import_hf_space "umuth/image-metadata-editor" \
  "image-metadata-editor" "View and edit common image metadata"
import_hf_space "NeuralFalcon/Remove-Silence-From-Audio" \
  "remove-silence-audio" "Remove silent sections from audio using local FFmpeg"
import_hf_space "tregu0458/image_converter_for_patent" \
  "patent-image-converter" "Convert images for patent-document workflows"

# ==========================================================================
# vision-transformer-mini: larger model fixture
# ==========================================================================
ensure_repo "vision-transformer-mini" "Model fixture with config, tokenizer, and nested assets"
set_topics "vision-transformer-mini" "model" "vision" "transformer"

cat > "${WORKDIR}/vit_readme.md" <<'EOF'
---
license: apache-2.0
pipeline_tag: image-classification
tags:
  - openface
  - vision
  - transformer
---

# vision-transformer-mini

Small model fixture for testing OpenFace model repository pages.
EOF
put_file "vision-transformer-mini" "README.md" "${WORKDIR}/vit_readme.md" "Add model card"

cat > "${WORKDIR}/config.json" <<'EOF'
{
  "architectures": ["OpenFaceVisionTransformer"],
  "hidden_size": 384,
  "num_attention_heads": 6,
  "num_hidden_layers": 6,
  "image_size": 224,
  "patch_size": 16
}
EOF
put_file "vision-transformer-mini" "config.json" "${WORKDIR}/config.json" "Add model configuration"

cat > "${WORKDIR}/preprocessor_config.json" <<'EOF'
{
  "do_resize": true,
  "size": {"height": 224, "width": 224},
  "do_normalize": true
}
EOF
put_file "vision-transformer-mini" "preprocessor_config.json" "${WORKDIR}/preprocessor_config.json" "Add preprocessing config"

cat > "${WORKDIR}/model_index.json" <<'EOF'
{
  "_class_name": "OpenFaceModelIndex",
  "model_type": "image-classification"
}
EOF
put_file "vision-transformer-mini" "model_index.json" "${WORKDIR}/model_index.json" "Add model index"

cat > "${WORKDIR}/training_args.json" <<'EOF'
{
  "epochs": 3,
  "learning_rate": 0.00003,
  "batch_size": 32
}
EOF
put_file "vision-transformer-mini" "training/training_args.json" "${WORKDIR}/training_args.json" "Add training arguments"

# ==========================================================================
# multilingual-text-dataset: larger dataset fixture
# ==========================================================================
ensure_repo "multilingual-text-dataset" "Dataset fixture with data splits and metadata"
set_topics "multilingual-text-dataset" "dataset" "text" "multilingual"

cat > "${WORKDIR}/multi_dataset_readme.md" <<'EOF'
---
license: cc-by-4.0
tags:
  - openface
  - text
  - multilingual
---

# multilingual-text-dataset

Dataset fixture for validating dataset file trees and metadata rendering.
EOF
put_file "multilingual-text-dataset" "README.md" "${WORKDIR}/multi_dataset_readme.md" "Add dataset card"

cat > "${WORKDIR}/dataset_infos.json" <<'EOF'
{
  "default": {
    "description": "Tiny multilingual text classification fixture",
    "features": {
      "id": "string",
      "text": "string",
      "language": "string",
      "label": "string"
    }
  }
}
EOF
put_file "multilingual-text-dataset" "dataset_infos.json" "${WORKDIR}/dataset_infos.json" "Add dataset infos"

cat > "${WORKDIR}/train.csv" <<'EOF'
id,text,language,label
1,hello world,en,greeting
2,bonjour le monde,fr,greeting
3,hola mundo,es,greeting
EOF
put_file "multilingual-text-dataset" "data/train.csv" "${WORKDIR}/train.csv" "Add train split"

cat > "${WORKDIR}/validation.csv" <<'EOF'
id,text,language,label
4,good night,en,farewell
5,bonne nuit,fr,farewell
EOF
put_file "multilingual-text-dataset" "data/validation.csv" "${WORKDIR}/validation.csv" "Add validation split"

cat > "${WORKDIR}/test.csv" <<'EOF'
id,text,language,label
6,buenas noches,es,farewell
EOF
put_file "multilingual-text-dataset" "data/test.csv" "${WORKDIR}/test.csv" "Add test split"

# ==========================================================================
# Directory-density fixtures: enough public repositories to make /models and
# /datasets read like the Hugging Face index instead of a tiny demo list.
# ==========================================================================
create_model_fixture() {
  local name="$1" title="$2" desc="$3" pipeline="$4" tag1="$5" tag2="${6:-}"
  ensure_repo "$name" "$desc"
  if [ -n "$tag2" ]; then
    set_topics "$name" "model" "$tag1" "$tag2"
  else
    set_topics "$name" "model" "$tag1"
  fi

  cat > "${WORKDIR}/${name}_README.md" <<EOF
---
license: apache-2.0
pipeline_tag: ${pipeline}
tags:
  - openface
  - ${tag1}
EOF
  if [ -n "$tag2" ]; then
    cat >> "${WORKDIR}/${name}_README.md" <<EOF
  - ${tag2}
EOF
  fi
  cat >> "${WORKDIR}/${name}_README.md" <<EOF
---

# ${title}

${desc}

This fixture is intentionally small, but it includes enough metadata for
OpenFace model index and file-tree UI comparisons.
EOF
  put_file "$name" "README.md" "${WORKDIR}/${name}_README.md" "Add model card"

  cat > "${WORKDIR}/${name}_config.json" <<EOF
{
  "model_type": "${pipeline}",
  "hidden_size": 768,
  "num_hidden_layers": 12,
  "openface_fixture": true
}
EOF
  put_file "$name" "config.json" "${WORKDIR}/${name}_config.json" "Add model config"

  cat > "${WORKDIR}/${name}_generation_config.json" <<EOF
{
  "temperature": 0.7,
  "top_p": 0.9,
  "max_new_tokens": 256
}
EOF
  put_file "$name" "generation_config.json" "${WORKDIR}/${name}_generation_config.json" "Add generation config"
}

create_dataset_fixture() {
  local name="$1" title="$2" desc="$3" modality="$4" tag2="${5:-}"
  ensure_repo "$name" "$desc"
  if [ -n "$tag2" ]; then
    set_topics "$name" "dataset" "$modality" "$tag2"
  else
    set_topics "$name" "dataset" "$modality"
  fi

  cat > "${WORKDIR}/${name}_README.md" <<EOF
---
license: cc-by-4.0
tags:
  - openface
  - ${modality}
EOF
  if [ -n "$tag2" ]; then
    cat >> "${WORKDIR}/${name}_README.md" <<EOF
  - ${tag2}
EOF
  fi
  cat >> "${WORKDIR}/${name}_README.md" <<EOF
---

# ${title}

${desc}

Small dataset fixture for OpenFace directory, card, and file-tree comparison.
EOF
  put_file "$name" "README.md" "${WORKDIR}/${name}_README.md" "Add dataset card"

  cat > "${WORKDIR}/${name}_infos.json" <<EOF
{
  "default": {
    "description": "${desc}",
    "features": {
      "id": "string",
      "text": "string",
      "label": "string"
    }
  }
}
EOF
  put_file "$name" "dataset_infos.json" "${WORKDIR}/${name}_infos.json" "Add dataset infos"

  cat > "${WORKDIR}/${name}_train.csv" <<EOF
id,text,label
1,"OpenFace fixture row one",alpha
2,"OpenFace fixture row two",beta
3,"OpenFace fixture row three",gamma
EOF
  put_file "$name" "data/train.csv" "${WORKDIR}/${name}_train.csv" "Add train split"
}

create_model_fixture "qwen-agent-mini" "Qwen Agent Mini" "Compact agentic language model fixture with tool-use metadata" "text-generation" "text-generation" "agent"
create_model_fixture "ocr-layout-tiny" "OCR Layout Tiny" "Document OCR model fixture for image-to-text repository lists" "image-to-text" "ocr" "document"
create_model_fixture "speech-synth-lite" "Speech Synth Lite" "Small text-to-speech fixture with generation settings" "text-to-speech" "audio" "speech"
create_model_fixture "embedding-reranker-base" "Embedding Reranker Base" "Retrieval reranking fixture with compact config files" "feature-extraction" "embedding" "reranker"
create_model_fixture "diffusion-sketch-control" "Diffusion Sketch Control" "Image generation fixture with control metadata" "text-to-image" "diffusion" "image-generation"
create_model_fixture "tabular-risk-scorer" "Tabular Risk Scorer" "Tabular classification model fixture for enterprise-style cards" "tabular-classification" "tabular" "classification"
create_model_fixture "code-assistant-small" "Code Assistant Small" "Code generation fixture with minimal tokenizer metadata" "text-generation" "code" "assistant"
create_model_fixture "japanese-summarizer-mini" "Japanese Summarizer Mini" "Summarization fixture for multilingual model browsing" "summarization" "multilingual" "summarization"
create_model_fixture "vision-captioner-lite" "Vision Captioner Lite" "Image captioning fixture with processor configuration" "image-to-text" "vision" "captioning"
create_model_fixture "audio-event-detector" "Audio Event Detector" "Audio classification fixture with simple preprocessing metadata" "audio-classification" "audio" "classification"
create_model_fixture "robot-policy-tiny" "Robot Policy Tiny" "Policy model fixture for robotics and embodied AI browsing" "reinforcement-learning" "robotics" "policy"
create_model_fixture "medical-ner-base" "Medical NER Base" "Token classification fixture for biomedical entities" "token-classification" "medical" "ner"

create_dataset_fixture "web-agent-traces" "Web Agent Traces" "Synthetic browser-agent trajectories with actions and observations" "traces" "agent"
create_dataset_fixture "document-ocr-benchmark" "Document OCR Benchmark" "Tiny OCR benchmark fixture with page-level labels" "document" "ocr"
create_dataset_fixture "voice-command-intents" "Voice Command Intents" "Short utterance intent dataset fixture for audio apps" "audio" "speech"
create_dataset_fixture "product-review-ja-en" "Product Review JA EN" "Bilingual product review classification fixture" "text" "multilingual"
create_dataset_fixture "robot-demo-rollouts" "Robot Demo Rollouts" "Small robotics rollout dataset fixture" "video" "robotics"
create_dataset_fixture "financial-news-signals" "Financial News Signals" "Financial headline signal classification fixture" "text" "finance"
create_dataset_fixture "image-edit-prompts" "Image Edit Prompts" "Instruction dataset fixture for image editing tasks" "image" "editing"
create_dataset_fixture "table-question-answering" "Table Question Answering" "Tabular QA fixture with small CSV splits" "tabular" "qa"

# ------------------------------------------------------------------------
# OpenFace Pages fixture.  This demonstrates the same convention as GitHub
# Pages: files from a public repo's `gh-pages` branch are served at
# /pages/{owner}/{repo}/.  Keeping it in the seed makes a fresh Compose
# deployment verifiable without any manual Forgejo setup.
# ------------------------------------------------------------------------
ensure_repo "pages-starter" "A public static site published with OpenFace Pages"
set_topics "pages-starter" "pages" "static-site" "html" "openface-pages"

cat > "${WORKDIR}/pages_starter_readme.md" <<'EOF'
# OpenFace Pages starter

This public repository demonstrates **OpenFace Pages**.

Open the published site at `/pages/openface/pages-starter/`. OpenFace serves
the `gh-pages` branch when it exists; otherwise it uses `docs/` on `main`.
EOF
put_file "pages-starter" "README.md" "${WORKDIR}/pages_starter_readme.md" "Add OpenFace Pages starter README"

cat > "${WORKDIR}/pages_starter_index.html" <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenFace Pages starter</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f6f2; color: #152238; }
      main { box-sizing: border-box; width: min(680px, calc(100% - 48px)); padding: 48px; border: 1px solid #dfe4ea; border-radius: 20px; background: #fff; box-shadow: 0 22px 70px #15223812; }
      .eyebrow { color: #52657c; font: 700 12px/1.2 ui-monospace, monospace; letter-spacing: .12em; }
      h1 { margin: 14px 0; font-size: clamp(2rem, 7vw, 4.4rem); line-height: .95; letter-spacing: -.06em; }
      p { color: #52657c; font-size: 1.1rem; line-height: 1.7; }
      code { padding: .2em .4em; border-radius: 6px; background: #eef2f6; color: #254b79; }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">OPENFACE PAGES · GH-PAGES BRANCH</div>
      <h1>Publish the small things.</h1>
      <p>This static site is served from a public Forgejo repository through OpenFace Pages. Push an <code>index.html</code> to <code>gh-pages</code>, then share its URL.</p>
    </main>
  </body>
</html>
EOF
put_file "pages-starter" "index.html" "${WORKDIR}/pages_starter_index.html" "Add OpenFace Pages starter site"
ensure_pages_branch "pages-starter"

# Linked asset example: gh-pages serves HTML, CSS, and browser JavaScript from
# the same public repository path.
ensure_repo "pages-portfolio" "Static HTML, CSS and JavaScript published with OpenFace Pages"
set_topics "pages-portfolio" "pages" "static-site" "javascript" "openface-pages"
put_file "pages-portfolio" "index.html" "/templates/pages-portfolio/index.html" "Add static portfolio page"
put_file "pages-portfolio" "styles.css" "/templates/pages-portfolio/styles.css" "Add portfolio stylesheet"
put_file "pages-portfolio" "app.js" "/templates/pages-portfolio/app.js" "Add portfolio browser interaction"
ensure_pages_branch "pages-portfolio"

# Fallback example: no gh-pages branch is created. OpenFace Pages serves the
# docs/ directory in main, including relative links and assets.
ensure_repo "pages-docs-fallback" "Documentation served from docs on the default branch"
set_topics "pages-docs-fallback" "pages" "docs" "static-site" "openface-pages"
put_file "pages-docs-fallback" "docs/index.html" "/templates/pages-docs-fallback/docs/index.html" "Add docs fallback home"
put_file "pages-docs-fallback" "docs/guide.html" "/templates/pages-docs-fallback/docs/guide.html" "Add docs fallback guide"
put_file "pages-docs-fallback" "docs/styles.css" "/templates/pages-docs-fallback/docs/styles.css" "Add docs fallback stylesheet"

# A complete VitePress + Forgejo Actions example.  The workflow pushes the
# generated `docs/.vitepress/dist` directory to gh-pages, which OpenFace Pages
# immediately serves at /pages/openface/vitepress-pages-starter/.
ensure_repo "vitepress-pages-starter" "VitePress documentation published by Forgejo Actions"
set_topics "vitepress-pages-starter" "pages" "vitepress" "docs" "openface-pages"
put_file "vitepress-pages-starter" "package.json" "/templates/vitepress-pages-starter/package.json" "Add VitePress package manifest"
put_file "vitepress-pages-starter" "docs/index.md" "/templates/vitepress-pages-starter/docs/index.md" "Add VitePress home page"
put_file "vitepress-pages-starter" "docs/.vitepress/config.mts" "/templates/vitepress-pages-starter/docs/.vitepress/config.mts" "Configure VitePress public base"
put_file "vitepress-pages-starter" ".forgejo/workflows/publish-pages.yml" "/templates/vitepress-pages-starter/.forgejo/workflows/publish-pages.yml" "Automate VitePress Pages publishing"

# Real Skill and MCP samples selected from Sunwood-ai-labs on GitHub.
import_sunwood_catalog

# Vetted, versioned prompts from MysticLibrary plus public goal-command
# patterns.  Each source URL is pinned in catalog/prompts.json.
import_prompt_catalog

rm -rf "${WORKDIR}"

log "Seed complete."
exit 0
