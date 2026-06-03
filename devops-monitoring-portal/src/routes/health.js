const express = require('express');

const router = express.Router();

/**
 * Health check for Kubernetes readiness/liveness probes and Jenkins smoke tests.
 * Returns JSON so automation can parse status without scraping HTML.
 */
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'devops-monitoring-portal',
    version: '1.0.0',
    environment: 'local',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
