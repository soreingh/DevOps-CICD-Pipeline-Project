#!/usr/bin/env bash
# Load a locally built image into Docker Desktop Kubernetes.
# Older Docker Desktop exposes a host container named desktop-control-plane for ctr import.
# Newer versions use kind internally — the node name is desktop-control-plane in kubectl,
# but there is no host docker container with that name; images built with docker build
# are already visible to Kubernetes via the shared image store.
set -euo pipefail

APP_NAME="${1:?APP_NAME required}"
IMAGE_TAG="${2:?IMAGE_TAG required}"
K8S_NODE="${K8S_NODE:-desktop-control-plane}"

IMAGE="${APP_NAME}:${IMAGE_TAG}"

if ! docker image inspect "${IMAGE}" >/dev/null 2>&1; then
  echo "ERROR: Local image ${IMAGE} not found. Run docker build first." >&2
  exit 1
fi

if docker ps --format '{{.Names}}' | grep -qx "${K8S_NODE}"; then
  echo "Importing ${IMAGE} via docker exec ${K8S_NODE} ctr..."
  docker save "${IMAGE}" | docker exec -i "${K8S_NODE}" ctr -n k8s.io images import -
  echo "Image imported via ${K8S_NODE} container."
else
  echo "No host Docker container named '${K8S_NODE}' (normal on current Docker Desktop)."
  echo "Verifying Kubernetes node and relying on Docker Desktop shared image store..."

  if ! kubectl get node "${K8S_NODE}" >/dev/null 2>&1; then
    # Fall back: any Ready control-plane node
    if ! kubectl get nodes -l node-role.kubernetes.io/control-plane -o jsonpath='{.items[0].metadata.name}' 2>/dev/null | grep -q .; then
      if ! kubectl get nodes --no-headers 2>/dev/null | grep -q ' Ready'; then
        echo "ERROR: No Ready Kubernetes nodes found." >&2
        exit 1
      fi
    fi
  fi

  NODE_READY="$(kubectl get node "${K8S_NODE}" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo Unknown)"
  if [ "${NODE_READY}" != "True" ]; then
    echo "WARN: Node ${K8S_NODE} not Ready (status: ${NODE_READY}); continuing with image inspect only."
  else
    echo "Kubernetes node ${K8S_NODE} is Ready."
  fi

  echo "Local image ${IMAGE} is available to docker build — Docker Desktop Kubernetes can use it without ctr import."
fi
