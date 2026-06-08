/**
 * In-memory metrics store for Prometheus exposition.
 * Counters increment at runtime; pipeline snapshot supplies K8s/deploy counts.
 */

const {
  loadPipelineStatus,
  getKubernetesSnapshot,
  getSecurityScanMetric,
} = require('../services/pipelineStatus');

let requestsTotal = 0;

function incrementRequests() {
  requestsTotal += 1;
}

function getSnapshot() {
  const pipeline = loadPipelineStatus();
  const k8s = getKubernetesSnapshot();

  return {
    requestsTotal,
    deploymentsTotal: pipeline.buildNumber || 1,
    podsReady: k8s.podsReady,
    podsTotal: k8s.podsTotal,
    securityScan: getSecurityScanMetric(),
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
