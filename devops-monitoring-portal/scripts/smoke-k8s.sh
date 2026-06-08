#!/usr/bin/env bash
# In-cluster smoke tests — primary verification for local Kubernetes deployments.
set -euo pipefail

APP_LABEL="${APP_LABEL:-app=devops-monitoring-portal}"
APP_DEPLOY="${APP_DEPLOY:-devops-monitoring-portal}"
APP_PORT="${APP_PORT:-3000}"

echo "Waiting for app pods to be ready..."
kubectl wait --for=condition=ready pod -l "${APP_LABEL}" --timeout=120s

echo "Waiting for app deployment to be available..."
kubectl wait --for=condition=available "deployment/${APP_DEPLOY}" --timeout=120s

echo "Checking /health in-cluster..."
kubectl exec "deploy/${APP_DEPLOY}" -- wget -qO- "http://localhost:${APP_PORT}/health" \
  | grep -q '"status":"healthy"' \
  || { echo "ERROR: App /health did not return healthy status"; exit 1; }

echo "Smoke test passed: /health returned healthy"
