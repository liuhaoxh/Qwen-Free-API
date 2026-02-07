#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-qwen-free-api:local}"
CONTAINER_NAME="${CONTAINER_NAME:-qwen-free-api-local}"
HOST_PORT="${HOST_PORT:-8000}"
CONTAINER_PORT="${CONTAINER_PORT:-8000}"
AUTO_BUILD="${AUTO_BUILD:-1}"
DOCKERFILE_PATH="${DOCKERFILE_PATH:-Dockerfile}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"
FOLLOW_LOGS="${FOLLOW_LOGS:-0}"
MEMORY_LIMIT="${MEMORY_LIMIT:-}"
MEMORY_SWAP="${MEMORY_SWAP:-}"

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    docker stop "${CONTAINER_NAME}"
  fi
  docker rm "${CONTAINER_NAME}"
fi

if ! docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
  if [ "${AUTO_BUILD}" = "0" ]; then
    echo "Image ${IMAGE_NAME} not found locally."
    echo "Build it with: docker build -t ${IMAGE_NAME} -f ${DOCKERFILE_PATH} ${BUILD_CONTEXT}"
    exit 1
  fi

  echo "Image ${IMAGE_NAME} not found locally; building..."
  docker build -t "${IMAGE_NAME}" -f "${DOCKERFILE_PATH}" "${BUILD_CONTEXT}"
fi

container_id="$(docker run -d \
  --name "${CONTAINER_NAME}" \
  --init \
  ${MEMORY_LIMIT:+--memory "${MEMORY_LIMIT}"} \
  ${MEMORY_SWAP:+--memory-swap "${MEMORY_SWAP}"} \
  -p "${HOST_PORT}:${CONTAINER_PORT}" \
  -e TZ=Asia/Shanghai \
  "${IMAGE_NAME}")"

echo "Started ${CONTAINER_NAME} on port ${HOST_PORT}"
echo "Logs: docker logs -f ${CONTAINER_NAME}"

if [ "${FOLLOW_LOGS}" = "1" ]; then
  echo "Following logs for ${CONTAINER_NAME} (Ctrl+C to stop following)..."
  docker logs -f "${CONTAINER_NAME}" || true
fi
