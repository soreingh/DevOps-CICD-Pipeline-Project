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

if ! docker ps --format '{{.Names}}' | grep -qx "${K8S_NODE}"; then
  fail "Kubernetes node container '${K8S_NODE}' not running. Is Docker Desktop Kubernetes enabled?"
fi

echo "Preflight OK: docker, kubectl, trivy, node, and ${K8S_NODE} are available."
