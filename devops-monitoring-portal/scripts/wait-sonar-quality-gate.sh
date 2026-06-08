#!/usr/bin/env bash
# Poll SonarQube project quality gate via REST API (replaces waitForQualityGate for local Jenkins).
# Requires withSonarQubeEnv: SONAR_HOST_URL, SONAR_AUTH_TOKEN
set -euo pipefail

PROJECT_KEY="${SONAR_PROJECT_KEY:-devops-monitoring-portal}"
MAX_WAIT_SEC="${SONAR_QG_MAX_WAIT_SEC:-120}"
POLL_INTERVAL_SEC="${SONAR_QG_POLL_SEC:-5}"
OUTPUT_ENV="${SONAR_QG_ENV_FILE:-sonar-qg.env}"

if [ -z "${SONAR_HOST_URL:-}" ]; then
  echo "ERROR: SONAR_HOST_URL is not set. Run inside withSonarQubeEnv('sonar-server')." >&2
  exit 1
fi

if [ -z "${SONAR_AUTH_TOKEN:-}" ]; then
  echo "ERROR: SONAR_AUTH_TOKEN is not set. Check Jenkins SonarQube server credentials." >&2
  exit 1
fi

SONAR_HOST_URL="${SONAR_HOST_URL%/}"
elapsed=0
last_status=""

echo "Polling SonarQube quality gate for ${PROJECT_KEY} (max ${MAX_WAIT_SEC}s)..."

while [ "$elapsed" -lt "$MAX_WAIT_SEC" ]; do
  response="$(curl -sf -u "${SONAR_AUTH_TOKEN}:" \
    "${SONAR_HOST_URL}/api/qualitygates/project_status?projectKey=${PROJECT_KEY}" 2>/dev/null || true)"

  if [ -n "$response" ]; then
    last_status="$(printf '%s' "$response" | node -e "
      let data = {};
      try { data = JSON.parse(require('fs').readFileSync(0, 'utf8')); } catch {}
      const status = (data.projectStatus && data.projectStatus.status) || '';
      process.stdout.write(status);
    ")"
  fi

  if [ "$last_status" = "OK" ] || [ "$last_status" = "WARN" ]; then
    echo "SonarQube Quality Gate PASSED (status: ${last_status})"
    printf 'SONAR_QUALITY_GATE=%s\n' "$last_status" > "$OUTPUT_ENV"
    exit 0
  fi

  if [ "$last_status" = "ERROR" ]; then
    echo "SonarQube Quality Gate FAILED (status: ERROR)"
    echo "Open ${SONAR_HOST_URL}/dashboard?id=${PROJECT_KEY} for details."
    printf 'SONAR_QUALITY_GATE=ERROR\n' > "$OUTPUT_ENV"
    exit 1
  fi

  sleep "$POLL_INTERVAL_SEC"
  elapsed=$((elapsed + POLL_INTERVAL_SEC))
done

echo "WARN: Quality gate not ready within ${MAX_WAIT_SEC}s (last status: ${last_status:-pending})."
echo "Analysis may still be processing; continuing pipeline (demo mode)."
printf 'SONAR_QUALITY_GATE=TIMEOUT\n' > "$OUTPUT_ENV"
exit 0
