const express = require('express');
const { loadPipelineStatus } = require('../services/pipelineStatus');

const router = express.Router();

router.get('/pipeline-status', (req, res) => {
  const data = loadPipelineStatus();
  const { _missing, ...payload } = data;
  res.json({ ...payload, dataAvailable: !_missing });
});

module.exports = router;
