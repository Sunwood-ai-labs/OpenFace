#!/bin/sh
set -eu

cert=/certs/cert.pem
key=/certs/key.pem
hosts=${OPENFACE_TLS_HOSTS:-localhost}

sed "s/__OPENFACE_HTTPS_PORT__/${OPENFACE_HTTPS_PORT:-8443}/g" \
  /etc/nginx/templates/nginx.conf.template > /etc/nginx/nginx.conf

if [ -f "$cert" ] && [ -f "$key" ]; then
  echo "OpenFace TLS: using certificates mounted in /certs"
  exit 0
fi

mkdir -p /certs
echo "OpenFace TLS: generating a local self-signed certificate for $hosts"
openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 365 \
  -keyout "$key" -out "$cert" -subj "/CN=${hosts%%,*}" \
  -addext "subjectAltName=DNS:localhost,DNS:host.docker.internal,IP:127.0.0.1"
