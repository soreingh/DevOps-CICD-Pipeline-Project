const express = require('express');

const router = express.Router();

/**
 * Main monitoring dashboard.
 * Values are static mock data for CI/CD demos (Jenkins, K8s, Prometheus, etc.).
 */
router.get('/', (req, res) => {
  res.render('index', {
    title: 'DevOps Monitoring Portal',
    cards: {
      applicationStatus: 'Healthy',
      currentVersion: 'v1.0.0',
      environment: 'Local Kubernetes',
      lastDeployment: 'Successful',
      securityScanStatus: 'Passed',
      jenkinsStatus: 'Online',
      dockerStatus: 'Running',
      kubernetesStatus: 'Healthy',
      prometheusStatus: 'Scraping',
      grafanaStatus: 'Available',
    },
  });
});

module.exports = router;
