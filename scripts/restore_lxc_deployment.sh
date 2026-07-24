#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/openface}"
BACKUP_DIR="${BACKUP_DIR:-/opt/openface-deploy}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:?Set PUBLIC_BASE_URL, for example https://192.168.1.50:8443}"

cd "$APP_DIR"

install -m 600 "$BACKUP_DIR/openface.env" .env
if grep -q '^PUBLIC_BASE_URL=' .env; then
  sed -i "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=$PUBLIC_BASE_URL|" .env
else
  printf '\nPUBLIC_BASE_URL=%s\n' "$PUBLIC_BASE_URL" >> .env
fi
if grep -q '^ZAI_AGENT_CONFIG=' .env; then
  sed -i 's|^ZAI_AGENT_CONFIG=.*|ZAI_AGENT_CONFIG=./maintenance-agent/zai.example.env|' .env
else
  printf '\nZAI_AGENT_CONFIG=./maintenance-agent/zai.example.env\n' >> .env
fi
install -m 600 "$BACKUP_DIR/zai.env" maintenance-agent/zai.example.env

rm -rf gateway/certs
mkdir -p gateway/certs
python3 -m zipfile -e "$BACKUP_DIR/gateway-certs.zip" gateway/certs

declare -A volume_archives=(
  [openface_forgejo-data]=openface_forgejo-data.tgz
  [openface_shared-token]=openface_shared-token.tgz
  [openface_agent-metrics-data]=openface_agent-metrics-data.tgz
  [openface_maintenance-agent-data]=openface_maintenance-agent-data.tgz
  [openface_forgejo-runner-data]=openface_forgejo-runner-data.tgz
)

for volume in "${!volume_archives[@]}"; do
  docker volume create "$volume" >/dev/null
  docker run --rm \
    -v "$volume:/data" \
    -v "$BACKUP_DIR:/backup:ro" \
    alpine sh -c "tar xzf /backup/${volume_archives[$volume]} -C /data"
done

docker compose up -d postgres
for _ in $(seq 1 60); do
  if docker inspect --format='{{.State.Health.Status}}' openface-postgres 2>/dev/null | grep -q '^healthy$'; then
    break
  fi
  sleep 2
done
test "$(docker inspect --format='{{.State.Health.Status}}' openface-postgres)" = "healthy"

for database in forgejo openface_metrics openface_maintenance; do
  docker cp "$BACKUP_DIR/$database.dump" "openface-postgres:/tmp/$database.dump"
  docker exec openface-postgres pg_restore \
    -U "${POSTGRES_USER:-openface}" \
    -d "$database" \
    --clean \
    --if-exists \
    --no-owner \
    "/tmp/$database.dump"
done

docker compose up -d --build
docker compose ps
