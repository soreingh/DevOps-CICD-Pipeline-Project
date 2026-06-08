#!/usr/bin/env bash
# Load a locally built image into every Docker Desktop Kubernetes (kind) node.
# Host 'docker ps' may not list node containers, but 'docker exec <node-name>' works.
set -euo pipefail

APP_NAME="${1:?APP_NAME required}"
IMAGE_TAG="${2:?IMAGE_TAG required}"

IMAGE="${APP_NAME}:${IMAGE_TAG}"

if ! docker image inspect "${IMAGE}" >/dev/null 2>&1; then
  echo "ERROR: Local image ${IMAGE} not found. Run docker build first." >&2
  exit 1
fi

NODES="$(kubectl get nodes -o jsonpath='{.items[*].metadata.name}')"
LOADED_COUNT=0
FAILED_NODES=""

for NODE in ${NODES}; do
  if ! docker exec "${NODE}" true 2>/dev/null; then
    FAILED_NODES="${FAILED_NODES}${NODE},"
    continue
  fi

  HAS_IMAGE="$(docker exec "${NODE}" ctr -n k8s.io images ls -q "name==docker.io/library/${IMAGE}" 2>/dev/null || true)"
  if [ -n "${HAS_IMAGE}" ]; then
    echo "Image ${IMAGE} already present on node ${NODE}; skipping import."
    LOADED_COUNT=$((LOADED_COUNT + 1))
    continue
  fi

  echo "Importing ${IMAGE} into node ${NODE} via ctr..."
  docker save "${IMAGE}" | docker exec -i "${NODE}" ctr -n k8s.io images import -
  LOADED_COUNT=$((LOADED_COUNT + 1))
done

if [ "${LOADED_COUNT}" -eq 0 ]; then
  echo "ERROR: Could not load ${IMAGE} into any Kubernetes node." >&2
  echo "Ensure Docker Desktop Kubernetes is running and node containers are reachable via docker exec." >&2
  exit 1
fi

echo "Image ${IMAGE} available on ${LOADED_COUNT} node(s)."
