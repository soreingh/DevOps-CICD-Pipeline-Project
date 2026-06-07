/**
 * In-memory metrics store for Prometheus exposition.
 * Counters increment at runtime; Prometheus scrapes the exported values.
 */

let requestsTotal = 0;

const deploymentsTotal = parseInt(process.env.DEPLOYMENT_COUNT || '1', 10) || 1;

function incrementRequests() {
  requestsTotal += 1;
}

function getSnapshot() {
  return {
    requestsTotal,
    deploymentsTotal,
    podsReady: 2,
    podsTotal: 2,
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
