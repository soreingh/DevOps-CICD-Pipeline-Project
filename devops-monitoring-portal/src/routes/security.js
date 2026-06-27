const express = require('express');
const { getSecuritySummary } = require('../services/pipelineStatus');

const router = express.Router();

function badgeClass(status) {
  if (status === 'Passed') return 'badge-success';
  if (status === 'Failed') return 'badge-failed';
  return 'badge-warning';
}

router.get('/', (req, res) => {
  const summary = getSecuritySummary();

  res.render('security', {
    title: 'Security Dashboard',
    scans: summary.scans,
    scanBadges: {
      trivyFilesystem: badgeClass(summary.scans.trivyFilesystem),
      trivyImage: badgeClass(summary.scans.trivyImage),
      sonarQubeQualityGate: badgeClass(summary.scans.sonarQubeQualityGate),
    },
    vulnerabilities: summary.vulnerabilities,
    lastScan: summary.lastScan,
  });
});

module.exports = router;
