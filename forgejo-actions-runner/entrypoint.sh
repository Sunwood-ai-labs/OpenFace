#!/bin/sh
set -eu

DATA_DIR=/data
TOKEN_FILE=/shared/actions-runner-token
CONFIG_FILE="${DATA_DIR}/config.yml"

mkdir -p "${DATA_DIR}"

cat > "${CONFIG_FILE}" <<'EOF'
runner:
  capacity: 1
  labels:
    - node20:docker://node:20-bookworm
container:
  # `host` here is the Docker-in-Docker daemon's own network namespace, not
  # the OpenFace host. It lets job containers resolve `forgejo` while keeping
  # the host Docker socket unavailable to workflow code.
  network: host
  docker_host: "-"
EOF

if [ ! -f "${DATA_DIR}/.runner" ]; then
  echo "[forgejo-actions-runner] Waiting for runner registration token..."
  while [ ! -s "${TOKEN_FILE}" ]; do
    sleep 2
  done

  forgejo-runner register \
    --no-interactive \
    --instance "${FORGEJO_INSTANCE_URL}" \
    --token "$(cat "${TOKEN_FILE}")" \
    --name "${FORGEJO_RUNNER_NAME}" \
    --labels "node20:docker://node:20-bookworm"
fi

exec forgejo-runner daemon --config "${CONFIG_FILE}"
