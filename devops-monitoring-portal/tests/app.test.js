/**
 * Integration tests using Supertest against the exported Express app.
 * We import app.js (not server.js) so tests never bind to port 3000.
 */
const path = require('path');

process.env.PIPELINE_STATUS_PATH = path.join(
  __dirname,
  'fixtures/pipeline-status.json',
);

const request = require('supertest');
const app = require('../src/app');
const { resetForTests } = require('../src/metrics/store');

describe('DevOps Monitoring Portal', () => {
  beforeEach(() => {
    resetForTests();
  });

  test('GET / returns HTTP 200', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
  });

  test('GET / renders dashboard with build number from pipeline snapshot', async () => {
    const response = await request(app).get('/');
    expect(response.text).toContain('build #42');
    expect(response.text).toContain('v1.0.0 (build #42)');
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

  test('GET /metrics increments app_requests_total after HTTP hits', async () => {
    await request(app).get('/health');
    await request(app).get('/health');

    const response = await request(app).get('/metrics');
    const match = response.text.match(/app_requests_total (\d+)/);
    expect(match).not.toBeNull();
    expect(parseInt(match[1], 10)).toBeGreaterThanOrEqual(2);
  });

  test('GET /metrics exposes kubernetes pods from pipeline snapshot', async () => {
    const response = await request(app).get('/metrics');
    expect(response.text).toContain('app_kubernetes_pods_ready 2');
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

  test('GET /security shows vulnerability counts from pipeline snapshot', async () => {
    const response = await request(app).get('/security');
    expect(response.text).toContain('High Vulnerabilities');
    expect(response.text).toMatch(/>\s*2\s*</);
  });

  test('GET /deployments returns HTTP 200', async () => {
    const response = await request(app).get('/deployments');
    expect(response.status).toBe(200);
  });

  test('GET /deployments lists builds from pipeline snapshot', async () => {
    const response = await request(app).get('/deployments');
    expect(response.text).toContain('Build #42');
    expect(response.text).toContain('Build #41');
    expect(response.text).toContain('Deploy to Local Kubernetes');
  });

  test('GET /api/pipeline-status returns JSON snapshot', async () => {
    const response = await request(app).get('/api/pipeline-status');
    expect(response.status).toBe(200);
    expect(response.body.buildNumber).toBe(42);
    expect(response.body.dataAvailable).toBe(true);
    expect(response.body.security.vulnerabilities.high).toBe(2);
  });
});
