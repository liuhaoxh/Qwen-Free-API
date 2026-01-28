#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-qwen-free-api:local}"
CONTAINER_NAME="${CONTAINER_NAME:-qwen-free-api-local}"
HOST_PORT="${HOST_PORT:-8000}"
CONTAINER_PORT="${CONTAINER_PORT:-8000}"

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    docker stop "${CONTAINER_NAME}"
  fi
  docker rm "${CONTAINER_NAME}"
fi

docker run -d \
  --name "${CONTAINER_NAME}" \
  -p "${HOST_PORT}:${CONTAINER_PORT}" \
  "${IMAGE_NAME}"

echo "Started ${CONTAINER_NAME} on port ${HOST_PORT}"
