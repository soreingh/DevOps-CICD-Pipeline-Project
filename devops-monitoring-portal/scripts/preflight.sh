#!/usr/bin/env bash
# Fail fast with clear errors when local DevSecOps tools are unavailable.
set -euo pipefail

K8S_NODE="${K8S_NODE:-desktop-control-plane}"

fail() {
  echo "PREFLIGHT ERROR: $1" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "docker not found. Install Docker Desktop and ensure Jenkins can run docker."
command -v kubectl >/dev/null 2>&1 || fail "kubectl not found. Install kubectl and point it at Docker Desktop Kubernetes."
command -v trivy >/dev/null 2>&1 || fail "trivy not found. Install with: brew install trivy"
command -v node >/dev/null 2>&1 || fail "node not found. Configure the node20 Jenkins tool."

docker info >/dev/null 2>&1 || fail "docker daemon not running. Start Docker Desktop."

kubectl cluster-info >/dev/null 2>&1 || fail "kubectl cannot reach a cluster. Enable Kubernetes in Docker Desktop."

DOCKER_PS_RAW="$(docker ps --format '{{.Names}}' 2>/dev/null || true)"
DOCKER_CONTAINER_PRESENT="false"
if echo "${DOCKER_PS_RAW}" | grep -qx "${K8S_NODE}"; then
  DOCKER_CONTAINER_PRESENT="true"
fi

K8S_NODE_READY="$(kubectl get node "${K8S_NODE}" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo 'Missing')"

if [ "${K8S_NODE_READY}" = "True" ]; then
  echo "Preflight OK: docker, kubectl, trivy, node available; Kubernetes node ${K8S_NODE} is Ready."
  if [ "${DOCKER_CONTAINER_PRESENT}" = "true" ]; then
    echo "Host Docker container ${K8S_NODE} is also running (ctr image import supported)."
  else
    echo "No host Docker container named ${K8S_NODE} — using Docker Desktop shared image store (expected on current Docker Desktop)."
  fi
  exit 0
fi

if [ "${DOCKER_CONTAINER_PRESENT}" = "true" ]; then
  echo "Preflight OK: docker, kubectl, trivy, node, and Docker container ${K8S_NODE} are available."
  exit 0
fi

fail "Kubernetes node '${K8S_NODE}' is not Ready (kubectl) and no Docker container with that name is running. Enable Kubernetes in Docker Desktop and wait for the node to become Ready."
