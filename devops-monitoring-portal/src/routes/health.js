const express = require('express');

const router = express.Router();

/** Build health payload used by both the JSON API and the HTML page. */
function getHealthPayload() {
  return {
    status: 'healthy',
    service: 'devops-monitoring-portal',
    version: '1.0.0',
    environment: 'local',
    timestamp: new Date().toISOString(),
  };
}

/** Browsers send Accept: text/html; probes and curl typically do not. */
function wantsHtmlPage(req) {
  return (req.get('Accept') || '').includes('text/html');
}

/**
 * Health check for Kubernetes readiness/liveness probes and Jenkins smoke tests.
 * Browsers get a styled page; automation gets JSON (no text/html in Accept).
 */
router.get('/', (req, res) => {
  const health = getHealthPayload();

  if (wantsHtmlPage(req)) {
    return res.render('health', {
      title: 'Health Check',
      health,
      healthJson: JSON.stringify(health, null, 2),
    });
  }

  res.json(health);
});

module.exports = router;
