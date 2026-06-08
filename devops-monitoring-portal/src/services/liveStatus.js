const http = require('http');

const TIMEOUT_MS = 2000;

function probe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function getLiveObservabilityStatus() {
  const [prometheusOk, grafanaOk] = await Promise.all([
    probe('http://prometheus-service:9091/-/ready'),
    probe('http://grafana-service:3030/api/health'),
  ]);

  return {
    prometheusStatus: prometheusOk ? 'Scraping' : 'Unavailable',
    grafanaStatus: grafanaOk ? 'Available' : 'Unavailable',
  };
}

module.exports = {
  getLiveObservabilityStatus,
};
