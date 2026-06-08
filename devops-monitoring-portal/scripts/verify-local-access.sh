#!/usr/bin/env bash
# Secondary LoadBalancer checks for Docker Desktop (localhost). In-cluster tests run earlier.
set -euo pipefail

CURL_MAX_TIME="${CURL_MAX_TIME:-2}"
WAIT_ATTEMPTS="${WAIT_ATTEMPTS:-8}"
WAIT_SLEEP="${WAIT_SLEEP:-2}"

# Docker Desktop publishes LoadBalancer ports on localhost; ingress IPs (172.18.x.x) are not
# reachable from the Jenkins agent and cause curl to hang without --max-time.
resolve_host() {
  echo "localhost"
}

wait_for_url() {
  local url="$1"
  local pattern="$2"
  local attempt=1
  while [ "$attempt" -le "$WAIT_ATTEMPTS" ]; do
    if curl -sf --max-time "${CURL_MAX_TIME}" "$url" 2>/dev/null | grep -q "$pattern"; then
      return 0
    fi
    sleep "${WAIT_SLEEP}"
    attempt=$((attempt + 1))
  done
  return 1
}

APP_HOST=$(resolve_host devops-monitoring-portal-service)
PROM_HOST=$(resolve_host prometheus-service)
GRAF_HOST=$(resolve_host grafana-service)

echo "Checking app at http://${APP_HOST}:30080/health (LoadBalancer; in-cluster already verified)..."
if wait_for_url "http://${APP_HOST}:30080/health" '"status":"healthy"'; then
  echo "App LoadBalancer reachable at http://${APP_HOST}:30080"
else
  echo "WARN: LoadBalancer not reachable from Jenkins agent within $((WAIT_ATTEMPTS * WAIT_SLEEP))s."
  echo "In-cluster smoke test already passed — browse http://localhost:30080 when the LB is ready."
fi

echo "Checking Prometheus at http://${PROM_HOST}:9091/-/ready ..."
if wait_for_url "http://${PROM_HOST}:9091/-/ready" 'Prometheus Server is Ready'; then
  echo "Prometheus reachable at http://${PROM_HOST}:9091"
else
  kubectl exec deploy/prometheus -- wget -qO- http://localhost:9090/-/ready | grep -q 'Prometheus Server is Ready' \
    || { echo "ERROR: Prometheus not ready in-cluster"; exit 1; }
  echo "Prometheus healthy in-cluster; try http://localhost:9091 in browser"
fi

echo "Checking Grafana at http://${GRAF_HOST}:3030/api/health ..."
if wait_for_url "http://${GRAF_HOST}:3030/api/health" '"database"'; then
  echo "Grafana reachable at http://${GRAF_HOST}:3030"
else
  kubectl exec deploy/grafana -- wget -qO- http://localhost:3000/api/health | grep -Eq '"database"[[:space:]]*:[[:space:]]*"ok"' \
    || { echo "ERROR: Grafana not healthy in-cluster"; exit 1; }
  echo "Grafana healthy in-cluster; try http://localhost:3030 in browser"
fi

echo "Access URLs (when LoadBalancer is ready on your Mac):"
echo "  App:        http://localhost:30080"
echo "  Prometheus: http://localhost:9091"
echo "  Grafana:    http://localhost:3030  (login admin/admin)"
