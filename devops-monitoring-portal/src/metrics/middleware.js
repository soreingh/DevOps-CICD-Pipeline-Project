const { incrementRequests } = require('./store');

/**
 * Count HTTP requests for app_requests_total.
 * Skips /metrics so Prometheus scrapes do not inflate the counter.
 */
function metricsMiddleware(req, res, next) {
  if (req.path !== '/metrics') {
    incrementRequests();
  }
  next();
}

module.exports = metricsMiddleware;
