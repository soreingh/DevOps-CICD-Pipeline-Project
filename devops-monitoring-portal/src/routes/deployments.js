const express = require('express');
const { getBuildHistory } = require('../services/pipelineStatus');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('deployments', {
    title: 'Deployment History',
    builds: getBuildHistory(),
  });
});

module.exports = router;
