/**
 * In-memory metrics store for Prometheus exposition.
 * Counters increment at runtime; pipeline snapshot supplies K8s/deploy counts.
 */

const {
  loadPipelineStatus,
  getSecurityScanMetric,
} = require('../services/pipelineStatus');

let requestsTotal = 0;

function incrementRequests() {
  requestsTotal += 1;
}

function getSnapshot() {
  const data = loadPipelineStatus();
  const k8s = data.kubernetes;

  return {
    requestsTotal,
    deploymentsTotal: data.buildNumber || 1,
    podsReady: k8s.podsReady,
    podsTotal: k8s.podsTotal,
    securityScan: getSecurityScanMetric(data),
  };
}

/** Reset counters — used by tests only. */
function resetForTests() {
  requestsTotal = 0;
}

module.exports = {
  incrementRequests,
  getSnapshot,
  resetForTests,
};
