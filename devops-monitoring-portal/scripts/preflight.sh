#!/usr/bin/env bash
# Fail fast with clear errors when local DevSecOps tools are unavailable.
set -euo pipefail

K8S_NODE="${K8S_NODE:-desktop-control-plane}"
export DEBUG_LOG="${DEBUG_LOG:-/Users/luiszara/Documents/DevOps-CICD-Pipeline-Project/.cursor/debug-dfd10b.log}"
export DEBUG_RUN_ID="${DEBUG_RUN_ID:-preflight}"

fail() {
  echo "PREFLIGHT ERROR: $1" >&2
  exit 1
}

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
      location: 'preflight.sh',
      message: process.argv[2],
      data: JSON.parse(process.argv[3]),
      timestamp: Date.now(),
      runId: process.env.DEBUG_RUN_ID || 'preflight',
    };
    try {
      fs.mkdirSync(require('path').dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
    } catch (e) { /* Jenkins may lack write access to DEBUG_LOG */ }
  " "$hypothesis_id" "$message" "$json_data" 2>/dev/null || true
  echo "[PREFLIGHT_DEBUG][$hypothesis_id] $message" >&2
}
#endregion

command -v docker >/dev/null 2>&1 || fail "docker not found. Install Docker Desktop and ensure Jenkins can run docker."
command -v kubectl >/dev/null 2>&1 || fail "kubectl not found. Install kubectl and point it at Docker Desktop Kubernetes."
command -v trivy >/dev/null 2>&1 || fail "trivy not found. Install with: brew install trivy"
command -v node >/dev/null 2>&1 || fail "node not found. Configure the node20 Jenkins tool."

#region agent log
WHOAMI="$(whoami)"
DOCKER_BIN="$(command -v docker)"
DOCKER_CONTEXT="$(docker context show 2>/dev/null || echo 'unknown')"
DOCKER_HOST_VAL="${DOCKER_HOST:-unset}"
KUBECTL_CONTEXT="$(kubectl config current-context 2>/dev/null || echo 'unknown')"
debug_log "H1" "preflight identity and context" "{\"whoami\":\"${WHOAMI}\",\"dockerBin\":\"${DOCKER_BIN}\",\"dockerContext\":\"${DOCKER_CONTEXT}\",\"dockerHost\":\"${DOCKER_HOST_VAL}\",\"kubectlContext\":\"${KUBECTL_CONTEXT}\",\"k8sNode\":\"${K8S_NODE}\"}"
#endregion

docker info >/dev/null 2>&1 || fail "docker daemon not running. Start Docker Desktop."

kubectl cluster-info >/dev/null 2>&1 || fail "kubectl cannot reach a cluster. Enable Kubernetes in Docker Desktop."

#region agent log
DOCKER_PS_RAW="$(docker ps --format '{{.Names}}' 2>&1 || true)"
DOCKER_PS_EXIT=$?
DOCKER_PS_ALL="$(docker ps -a --format '{{.Names}}' 2>&1 | tr '\n' ',' || true)"
CONTROL_PLANE_MATCHES="$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -i control-plane | tr '\n' ',' || true)"
GREP_EXACT_MATCH="false"
if echo "${DOCKER_PS_RAW}" | grep -qx "${K8S_NODE}"; then
  GREP_EXACT_MATCH="true"
fi
GREP_LOOSE_MATCH="false"
if echo "${DOCKER_PS_RAW}" | grep -q "${K8S_NODE}"; then
  GREP_LOOSE_MATCH="true"
fi
debug_log "H2" "docker ps name inspection" "{\"dockerPsExit\":${DOCKER_PS_EXIT},\"runningNames\":\"${DOCKER_PS_RAW//$'\n'/|}\",\"allNames\":\"${DOCKER_PS_ALL}\",\"controlPlaneMatches\":\"${CONTROL_PLANE_MATCHES}\",\"grepExactMatch\":${GREP_EXACT_MATCH},\"grepLooseMatch\":${GREP_LOOSE_MATCH},\"expectedName\":\"${K8S_NODE}\"}"
debug_log "H3" "docker socket probe" "{\"dockerInfoOk\":true,\"dockerPsLineCount\":$(echo "${DOCKER_PS_RAW}" | grep -c . || echo 0)}"
#endregion

DOCKER_CONTAINER_PRESENT="false"
if echo "${DOCKER_PS_RAW}" | grep -qx "${K8S_NODE}"; then
  DOCKER_CONTAINER_PRESENT="true"
fi

K8S_NODE_READY="$(kubectl get node "${K8S_NODE}" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo 'Missing')"
ANY_K8S_READY="$(kubectl get nodes --no-headers 2>/dev/null | grep -c ' Ready' || echo 0)"

#region agent log
debug_log "H4" "k8s readiness vs docker container" "{\"dockerContainerPresent\":${DOCKER_CONTAINER_PRESENT},\"k8sNodeReady\":\"${K8S_NODE_READY}\",\"anyK8sReadyCount\":${ANY_K8S_READY},\"note\":\"desktop-control-plane may be a kubectl node name, not a docker ps container name\"}"
#endregion

if [ "${K8S_NODE_READY}" = "True" ]; then
  #region agent log
  debug_log "H5" "preflight passed via kubectl node Ready" "{\"k8sNode\":\"${K8S_NODE}\",\"dockerContainerPresent\":${DOCKER_CONTAINER_PRESENT}}"
  #endregion
  echo "Preflight OK: docker, kubectl, trivy, node available; Kubernetes node ${K8S_NODE} is Ready."
  if [ "${DOCKER_CONTAINER_PRESENT}" = "true" ]; then
    echo "Host Docker container ${K8S_NODE} is also running (ctr image import supported)."
  else
    echo "No host Docker container named ${K8S_NODE} — using Docker Desktop shared image store (expected on current Docker Desktop)."
  fi
  exit 0
fi

if [ "${DOCKER_CONTAINER_PRESENT}" = "true" ]; then
  #region agent log
  debug_log "H5" "preflight passed via docker container only" "{\"dockerContainer\":\"${K8S_NODE}\"}"
  #endregion
  echo "Preflight OK: docker, kubectl, trivy, node, and Docker container ${K8S_NODE} are available."
  exit 0
fi

#region agent log
debug_log "H4" "preflight failed k8s check" "{\"reason\":\"no Ready kubectl node and no docker container\",\"k8sNodeReady\":\"${K8S_NODE_READY}\",\"runningNames\":\"${DOCKER_PS_RAW//$'\n'/|}\"}"
#endregion
fail "Kubernetes node '${K8S_NODE}' is not Ready (kubectl) and no Docker container with that name is running. Enable Kubernetes in Docker Desktop and wait for the node to become Ready."
