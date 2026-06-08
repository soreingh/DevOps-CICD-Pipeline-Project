#!/usr/bin/env bash
# Load a locally built image into every Docker Desktop Kubernetes (kind) node.
# Host 'docker ps' may not list node containers, but 'docker exec <node-name>' works.
set -euo pipefail

APP_NAME="${1:?APP_NAME required}"
IMAGE_TAG="${2:?IMAGE_TAG required}"
export DEBUG_LOG="${DEBUG_LOG:-/Users/luiszara/Documents/DevOps-CICD-Pipeline-Project/.cursor/debug-dfd10b.log}"
export DEBUG_RUN_ID="${DEBUG_RUN_ID:-load-image}"

IMAGE="${APP_NAME}:${IMAGE_TAG}"

#region agent log
debug_log() {
  local hypothesis_id="$1"
  local message="$2"
  local json_data="$3"
  node -e "
    const fs = require('fs');
    const logPath = process.env.DEBUG_LOG;
    const entry = {
      sessionId: 'dfd10b',
      hypothesisId: process.argv[1],
      location: 'load-image-k8s.sh',
      message: process.argv[2],
      data: JSON.parse(process.argv[3]),
      timestamp: Date.now(),
      runId: process.env.DEBUG_RUN_ID || 'load-image',
    };
    try {
      fs.mkdirSync(require('path').dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
    } catch (e) { /* ignore */ }
  " "$hypothesis_id" "$message" "$json_data" 2>/dev/null || true
  echo "[LOAD_IMAGE_DEBUG][$hypothesis_id] $message" >&2
}
#endregion

if ! docker image inspect "${IMAGE}" >/dev/null 2>&1; then
  echo "ERROR: Local image ${IMAGE} not found. Run docker build first." >&2
  exit 1
fi

NODES="$(kubectl get nodes -o jsonpath='{.items[*].metadata.name}')"
LOADED_COUNT=0
FAILED_NODES=""

#region agent log
debug_log "H1" "starting multi-node image load" "{\"image\":\"${IMAGE}\",\"nodes\":\"${NODES}\"}"
#endregion

for NODE in ${NODES}; do
  if ! docker exec "${NODE}" true 2>/dev/null; then
    FAILED_NODES="${FAILED_NODES}${NODE},"
    #region agent log
    debug_log "H2" "docker exec unavailable for node" "{\"node\":\"${NODE}\"}"
    #endregion
    continue
  fi

  HAS_IMAGE="$(docker exec "${NODE}" ctr -n k8s.io images ls -q "name==docker.io/library/${IMAGE}" 2>/dev/null || true)"
  if [ -n "${HAS_IMAGE}" ]; then
    echo "Image ${IMAGE} already present on node ${NODE}; skipping import."
    LOADED_COUNT=$((LOADED_COUNT + 1))
    #region agent log
    debug_log "H3" "image already on node" "{\"node\":\"${NODE}\",\"image\":\"${IMAGE}\"}"
    #endregion
    continue
  fi

  echo "Importing ${IMAGE} into node ${NODE} via ctr..."
  docker save "${IMAGE}" | docker exec -i "${NODE}" ctr -n k8s.io images import -
  LOADED_COUNT=$((LOADED_COUNT + 1))
  #region agent log
  debug_log "H4" "image imported to node" "{\"node\":\"${NODE}\",\"image\":\"${IMAGE}\"}"
  #endregion
done

#region agent log
debug_log "H5" "load complete" "{\"loadedCount\":${LOADED_COUNT},\"failedNodes\":\"${FAILED_NODES}\",\"totalNodes\":$(echo ${NODES} | wc -w | tr -d ' ')}"
#endregion

if [ "${LOADED_COUNT}" -eq 0 ]; then
  echo "ERROR: Could not load ${IMAGE} into any Kubernetes node." >&2
  echo "Ensure Docker Desktop Kubernetes is running and node containers are reachable via docker exec." >&2
  exit 1
fi

echo "Image ${IMAGE} available on ${LOADED_COUNT} node(s)."
