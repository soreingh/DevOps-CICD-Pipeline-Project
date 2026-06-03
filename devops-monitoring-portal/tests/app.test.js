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

  test('GET /security returns HTTP 200', async () => {
    const response = await request(app).get('/security');
    expect(response.status).toBe(200);
  });

  test('GET /deployments returns HTTP 200', async () => {
    const response = await request(app).get('/deployments');
    expect(response.status).toBe(200);
  });
});
