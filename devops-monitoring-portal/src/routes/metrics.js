const express = require('express');

const router = express.Router();

/** Browsers send Accept: text/html; Prometheus scrapers do not. */
function wantsHtmlPage(req) {
  return (req.get('Accept') || '').includes('text/html');
}

/**
 * Build Prometheus exposition format (plain text).
 * Shared by the scrape endpoint and the HTML metrics viewer.
 */
function buildMetricsText() {
  const uptimeSeconds = Math.floor(process.uptime());

  return [
    '# HELP app_info Application metadata',
    '# TYPE app_info gauge',
    'app_info{service="devops-monitoring-portal",version="1.0.0"} 1',
    '# HELP app_health_status Application health (1 = healthy)',
    '# TYPE app_health_status gauge',
    'app_health_status 1',
    '# HELP app_requests_total Simulated request counter for demos',
    '# TYPE app_requests_total counter',
    'app_requests_total 100',
    '# HELP app_deployments_total Simulated deployment counter',
    '# TYPE app_deployments_total counter',
    'app_deployments_total 5',
    '# HELP app_security_scan_status Security scan passed (1 = passed)',
    '# TYPE app_security_scan_status gauge',
    'app_security_scan_status 1',
    '# HELP app_kubernetes_pods_ready Ready pods in local cluster demo',
    '# TYPE app_kubernetes_pods_ready gauge',
    'app_kubernetes_pods_ready 2',
    '# HELP app_uptime_seconds Process uptime in seconds',
    '# TYPE app_uptime_seconds gauge',
    `app_uptime_seconds ${uptimeSeconds}`,
  ].join('\n');
}

/**
 * Prometheus metrics at GET /metrics.
 * Scrapers receive text/plain; browsers receive a styled HTML page.
 */
router.get('/', (req, res) => {
  const metricsText = buildMetricsText();

  if (wantsHtmlPage(req)) {
    return res.render('metrics', {
      title: 'Metrics',
      metricsText,
    });
  }

  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(metricsText + '\n');
});

module.exports = router;
