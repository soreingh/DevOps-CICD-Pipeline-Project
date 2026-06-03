const express = require('express');

const router = express.Router();

/**
 * Mock Jenkins deployment history for CI/CD demonstration.
 */
router.get('/', (req, res) => {
  res.render('deployments', {
    title: 'Deployment History',
    builds: [
      {
        number: 105,
        status: 'Successful',
        description: 'Deployed to Local Kubernetes',
      },
      {
        number: 104,
        status: 'Successful',
        description: 'Docker image scanned by Trivy',
      },
      {
        number: 103,
        status: 'Failed',
        description: 'Unit test failure',
      },
      {
        number: 102,
        status: 'Successful',
        description: 'SonarQube quality gate passed',
      },
      {
        number: 101,
        status: 'Successful',
        description: 'Initial deployment',
      },
    ],
  });
});

module.exports = router;
