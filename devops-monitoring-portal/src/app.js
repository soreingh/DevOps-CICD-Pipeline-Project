/**
 * Express application factory.
 * Exported separately from server.js so Jest/Supertest can test routes
 * without starting an HTTP listener on port 3000.
 */
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');

const app = express();

// Restrictive CSP for server-rendered pages; inline styles only for metrics bar widths in EJS.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'script-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'font-src': ["'self'"],
        'object-src': ["'none'"],
        'frame-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
      },
    },
  }),
);

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

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
  res.status(500).send('Internal Server Error');
});

module.exports = app;
