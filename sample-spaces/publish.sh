#!/usr/bin/env bash
set -euo pipefail

API="${FORGEJO_API:-http://forgejo:3000/api/v1}"
ORG="${ORG_NAME:-openface}"
ADMIN="${OPENFACE_ADMIN_USER:-openface-admin}"
TOKEN="$(tr -d '\r\n' < "${FORGEJO_TOKEN_FILE:-/shared/token}")"

for dir in /samples/sample-*; do
  [ -d "$dir" ] || continue
  name="$(basename "$dir")"
  description="$(awk 'BEGIN{in_fm=0} /^---$/{in_fm++;next} in_fm==2 && /^$/{next} in_fm>=2 && /^# /{sub(/^# /,""); print; exit}' "$dir/README.md")"
  [ -n "$description" ] || description="Dockerized ${name} sample Space"

  status="$(curl -sS -o /tmp/repo.json -w '%{http_code}' -H "Authorization: token ${TOKEN}" "${API}/repos/${ORG}/${name}")"
  if [ "$status" = "404" ]; then
    curl -fsS -H "Authorization: token ${TOKEN}" -H 'Content-Type: application/json' \
      -d "$(jq -n --arg name "$name" --arg description "$description" '{name:$name,description:$description,private:false,auto_init:false,default_branch:"main"}')" \
      "${API}/orgs/${ORG}/repos" >/dev/null
  elif [ "$status" != "200" ]; then
    echo "Repository lookup failed for ${name}: HTTP ${status}" >&2
    exit 1
  fi

  git -C "$dir" init -b main >/dev/null 2>&1 || true
  git -C "$dir" config user.name "OpenFace Samples"
  git -C "$dir" config user.email "samples@openface.local"
  git -C "$dir" add .
  if ! git -C "$dir" diff --cached --quiet; then
    git -C "$dir" commit -m "Add Dockerized ${name} sample" >/dev/null
  fi
  git -C "$dir" remote remove openface >/dev/null 2>&1 || true
  git -C "$dir" remote add openface "http://${ADMIN}:${TOKEN}@forgejo:3000/${ORG}/${name}.git"
  git -C "$dir" push --force openface main >/dev/null
  curl -fsS -X PUT -H "Authorization: token ${TOKEN}" -H 'Content-Type: application/json' \
    -d '{"topics":["space","cpu","docker","sample"]}' \
    "${API}/repos/${ORG}/${name}/topics" >/dev/null
  echo "Published ${ORG}/${name}"
done
