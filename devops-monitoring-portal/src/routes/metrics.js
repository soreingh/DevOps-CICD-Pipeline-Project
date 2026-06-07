const express = require('express');
const { getSnapshot: getStoreSnapshot } = require('../metrics/store');

const router = express.Router();

/** Browsers send Accept: text/html; Prometheus scrapers do not. */
function wantsHtmlPage(req) {
  return (req.get('Accept') || '').includes('text/html');
}

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

/**
 * Structured metrics used by the HTML dashboard.
 * Values mirror the Prometheus exposition demo counters/gauges.
 */
function getMetricsSnapshot() {
  const uptimeSeconds = Math.floor(process.uptime());
  const store = getStoreSnapshot();

  return {
    service: 'devops-monitoring-portal',
    version: '1.0.0',
    uptimeSeconds,
    uptimeFormatted: formatUptime(uptimeSeconds),
    health: { value: 1, label: 'Healthy', ok: true },
    securityScan: { value: 1, label: 'Passed', ok: true },
    requestsTotal: store.requestsTotal,
    deploymentsTotal: store.deploymentsTotal,
    podsReady: store.podsReady,
    podsTotal: store.podsTotal,
  };
}

/**
 * Build Prometheus exposition format (plain text).
 * Shared by the scrape endpoint and the HTML metrics viewer.
 */
function buildMetricsText(snapshot = getMetricsSnapshot()) {
  return [
    '# HELP app_info Application metadata',
    '# TYPE app_info gauge',
    `app_info{service="${snapshot.service}",version="${snapshot.version}"} 1`,
    '# HELP app_health_status Application health (1 = healthy)',
    '# TYPE app_health_status gauge',
    `app_health_status ${snapshot.health.value}`,
    '# HELP app_requests_total Total HTTP requests handled by this process',
    '# TYPE app_requests_total counter',
    `app_requests_total ${snapshot.requestsTotal}`,
    '# HELP app_deployments_total Deployment count for this running instance',
    '# TYPE app_deployments_total counter',
    `app_deployments_total ${snapshot.deploymentsTotal}`,
    '# HELP app_security_scan_status Security scan passed (1 = passed)',
    '# TYPE app_security_scan_status gauge',
    `app_security_scan_status ${snapshot.securityScan.value}`,
    '# HELP app_kubernetes_pods_ready Ready pods in local cluster demo',
    '# TYPE app_kubernetes_pods_ready gauge',
    `app_kubernetes_pods_ready ${snapshot.podsReady}`,
    '# HELP app_uptime_seconds Process uptime in seconds',
    '# TYPE app_uptime_seconds gauge',
    `app_uptime_seconds ${snapshot.uptimeSeconds}`,
  ].join('\n');
}

/**
 * Prometheus metrics at GET /metrics.
 * Scrapers receive text/plain; browsers receive a styled HTML page.
 */
router.get('/', (req, res) => {
  const snapshot = getMetricsSnapshot();
  const metricsText = buildMetricsText(snapshot);

  if (wantsHtmlPage(req)) {
    return res.render('metrics', {
      title: 'Metrics',
      snapshot,
      metricsText,
    });
  }

  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(metricsText + '\n');
});

module.exports = router;
module.exports.getMetricsSnapshot = getMetricsSnapshot;
module.exports.buildMetricsText = buildMetricsText;
