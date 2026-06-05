/**
 * Integration tests using Supertest against the exported Express app.
 * We import app.js (not server.js) so tests never bind to port 3000.
 */
const request = require('supertest');
const app = require('../src/app');

describe('DevOps Monitoring Portal', () => {
  test('GET / returns HTTP 200', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
  });

  test('GET /health returns HTTP 200', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
  });

  test('GET /health returns status "healthy"', async () => {
    const response = await request(app).get('/health');
    expect(response.body.status).toBe('healthy');
  });

  test('GET /metrics returns HTTP 200', async () => {
    const response = await request(app).get('/metrics');
    expect(response.status).toBe(200);
  });

  test('GET /metrics contains "app_health_status"', async () => {
    const response = await request(app).get('/metrics');
    expect(response.text).toContain('app_health_status');
  });

  test('GET /metrics with Accept text/html renders metrics dashboard', async () => {
    const response = await request(app)
      .get('/metrics')
      .set('Accept', 'text/html');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Metrics Dashboard');
    expect(response.text).toContain('app_requests_total');
    expect(response.text).toContain('Prometheus exposition format');
  });

  test('GET /security returns HTTP 200', async () => {
    const response = await request(app).get('/security');
    expect(response.status).toBe(200);
  });

  test('GET /deployments returns HTTP 200', async () => {
    const response = await request(app).get('/deployments');
    expect(response.status).toBe(200);
  });
});
