const http = require('node:http');

const TIMEOUT_MS = 2000;
const CACHE_TTL_MS = 30_000;

let cachedResult = null;
let cachedAt = 0;

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

async function fetchLiveObservabilityStatus() {
  const [prometheusOk, grafanaOk] = await Promise.all([
    probe('http://prometheus-service:9091/-/ready'),
    probe('http://grafana-service:3030/api/health'),
  ]);

  return {
    prometheusStatus: prometheusOk ? 'Scraping' : 'Unavailable',
    grafanaStatus: grafanaOk ? 'Available' : 'Unavailable',
  };
}

async function getLiveObservabilityStatus() {
  const now = Date.now();
  if (cachedResult && now - cachedAt < CACHE_TTL_MS) {
    return cachedResult;
  }

  cachedResult = await fetchLiveObservabilityStatus();
  cachedAt = now;
  return cachedResult;
}

module.exports = {
  getLiveObservabilityStatus,
};
