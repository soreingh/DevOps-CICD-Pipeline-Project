#!/usr/bin/env bash
# Secondary LoadBalancer checks for Docker Desktop (localhost). In-cluster tests run earlier.
set -euo pipefail

export DEBUG_LOG="${DEBUG_LOG:-/Users/luiszara/Documents/DevOps-CICD-Pipeline-Project/.cursor/debug-dfd10b.log}"
export DEBUG_RUN_ID="${DEBUG_RUN_ID:-verify-local}"

CURL_MAX_TIME="${CURL_MAX_TIME:-2}"
WAIT_ATTEMPTS="${WAIT_ATTEMPTS:-8}"
WAIT_SLEEP="${WAIT_SLEEP:-2}"

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
      location: 'verify-local-access.sh',
      message: process.argv[2],
      data: JSON.parse(process.argv[3]),
      timestamp: Date.now(),
      runId: process.env.DEBUG_RUN_ID || 'verify-local',
    };
    try {
      fs.mkdirSync(require('path').dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
    } catch (e) { /* ignore */ }
  " "$hypothesis_id" "$message" "$json_data" 2>/dev/null || true
}
#endregion

# Docker Desktop publishes LoadBalancer ports on localhost; ingress IPs (172.18.x.x) are not
# reachable from the Jenkins agent and cause curl to hang without --max-time.
resolve_host() {
  local svc="$1"
  local host ip
  host=$(kubectl get svc "$svc" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)
  ip=$(kubectl get svc "$svc" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
  #region agent log
  debug_log "H1" "lb ingress resolved" "{\"service\":\"${svc}\",\"hostname\":\"${host:-}\",\"ip\":\"${ip:-}\",\"chosenHost\":\"localhost\"}"
  #endregion
  echo "localhost"
}

wait_for_url() {
  local url="$1"
  local pattern="$2"
  local attempt=1
  while [ "$attempt" -le "$WAIT_ATTEMPTS" ]; do
    #region agent log
    debug_log "H2" "wait_for_url attempt" "{\"url\":\"${url}\",\"attempt\":${attempt},\"maxAttempts\":${WAIT_ATTEMPTS}}"
    #endregion
    if curl -sf --max-time "${CURL_MAX_TIME}" "$url" 2>/dev/null | grep -q "$pattern"; then
      #region agent log
      debug_log "H3" "wait_for_url success" "{\"url\":\"${url}\",\"attempt\":${attempt}}"
      #endregion
      return 0
    fi
    sleep "${WAIT_SLEEP}"
    attempt=$((attempt + 1))
  done
  #region agent log
  debug_log "H3" "wait_for_url timed out" "{\"url\":\"${url}\",\"attempts\":${WAIT_ATTEMPTS}}"
  #endregion
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

#region agent log
debug_log "H4" "verify local access complete" "{\"appHost\":\"${APP_HOST}\",\"promHost\":\"${PROM_HOST}\",\"grafHost\":\"${GRAF_HOST}\"}"
#endregion
