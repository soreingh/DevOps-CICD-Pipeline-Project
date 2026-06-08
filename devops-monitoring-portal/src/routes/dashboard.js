const express = require('express');
const { getDashboardCards } = require('../services/pipelineStatus');
const { getLiveObservabilityStatus } = require('../services/liveStatus');

const router = express.Router();

router.get('/', async (req, res) => {
  const cards = getDashboardCards();
  const live = await getLiveObservabilityStatus();

  res.render('index', {
    title: 'DevOps Monitoring Portal',
    cards: {
      ...cards,
      prometheusStatus: live.prometheusStatus,
      grafanaStatus: live.grafanaStatus,
    },
  });
});

module.exports = router;
