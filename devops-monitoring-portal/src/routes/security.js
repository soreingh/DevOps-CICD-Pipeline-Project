const express = require('express');

const router = express.Router();

/**
 * DevSecOps security summary page (mock scan results for pipeline demos).
 */
router.get('/', (req, res) => {
  res.render('security', {
    title: 'Security Dashboard',
    scans: {
      trivyFilesystem: 'Passed',
      trivyImage: 'Passed',
      sonarQubeQualityGate: 'Passed',
    },
    vulnerabilities: {
      critical: 0,
      high: 0,
      medium: 2,
    },
    lastScan: new Date().toLocaleString(),
  });
});

module.exports = router;
