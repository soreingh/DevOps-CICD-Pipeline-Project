/**
 * Express application factory.
 * Exported separately from server.js so Jest/Supertest can test routes
 * without starting an HTTP listener on port 3000.
 */
const path = require('node:path');
const express = require('express');

const app = express();

// EJS renders HTML dashboards; views live outside src/
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Static assets (CSS) served from /public
app.use(express.static(path.join(__dirname, '../public')));

// Live request counter for Prometheus (app_requests_total)
app.use(require('./metrics/middleware'));

// Each route module owns one concern (health probes, metrics scrape, UI pages)
app.use('/', require('./routes/dashboard'));
app.use('/health', require('./routes/health'));
app.use('/metrics', require('./routes/metrics'));
app.use('/security', require('./routes/security'));
app.use('/deployments', require('./routes/deployments'));
app.use('/api', require('./routes/api'));

module.exports = app;
