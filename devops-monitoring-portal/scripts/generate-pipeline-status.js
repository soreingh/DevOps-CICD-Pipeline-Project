#!/usr/bin/env node
/**
 * Build pipeline-status.json from Jenkins wfapi, build history, Trivy, and K8s counts.
 *
 * Env:
 *   BUILD_NUMBER, BUILD_URL, JOB_NAME, BUILD_RESULT, BUILD_DURATION_MS
 *   WFAPI_JSON_PATH, BUILDS_JSON_PATH, TRIVY_SUMMARY_JSON
 *   K8S_PODS_READY, K8S_PODS_TOTAL, APP_VERSION, IMAGE_TAG, SONAR_QUALITY_GATE
 *   OUTPUT_PATH (default: data/pipeline-status.json)
 */
const fs = require('fs');
const path = require('path');

function readJson(filePath, fallback = {}) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function sonarQubeLabel(stages) {
  const gate = (process.env.SONAR_QUALITY_GATE || '').toUpperCase();
  if (gate === 'OK' || gate === 'WARN') return 'Passed';
  if (gate === 'ERROR') return 'Failed';
  if (gate) return gate;
  return stageScanLabel(stages, 'SonarQube Analysis');
}

function stageScanLabel(stages, stageName) {
  const stage = stages.find((s) => s.name === stageName);
  if (!stage) return 'Unknown';
  const status = (stage.status || '').toUpperCase();
  if (status === 'SUCCESS') return 'Passed';
  if (status === 'FAILED') return 'Failed';
  if (status === 'NOT_EXECUTED' || status === 'SKIPPED' || status === 'ABORTED') return 'Skipped';
  return 'Unknown';
}

function mapBuildResult(result) {
  const r = (result || '').toUpperCase();
  if (r === 'SUCCESS') return 'Successful';
  if (r === 'FAILURE') return 'Failed';
  if (r === 'UNSTABLE') return 'Unstable';
  if (r === 'ABORTED') return 'Aborted';
  return result || 'Unknown';
}

function describeBuild(build, stages) {
  if (build.number === parseInt(process.env.BUILD_NUMBER || '0', 10)) {
    const failed = stages.find((s) => (s.status || '').toUpperCase() === 'FAILED');
    if (failed) return failed.name;
    const deploy = stages.find((s) => s.name === 'Deploy to Local Kubernetes');
    if (deploy && (deploy.status || '').toUpperCase() === 'SUCCESS') {
      return 'Deploy to Local Kubernetes';
    }
    return `Build #${build.number}`;
  }
  return `Build #${build.number}`;
}

const wfapi = readJson(process.env.WFAPI_JSON_PATH, { stages: [] });
const buildsApi = readJson(process.env.BUILDS_JSON_PATH, { builds: [] });
const trivySummary = readJson(process.env.TRIVY_SUMMARY_JSON, {
  critical: 0,
  high: 0,
  medium: 0,
});

const stages = (wfapi.stages || [])
  .filter((s) => s.name && !s.name.startsWith('Declarative:'))
  .map((s) => ({
    name: s.name,
    status: (s.status || 'UNKNOWN').toUpperCase(),
  }));

const podsReady = parseInt(process.env.K8S_PODS_READY || '0', 10) || 0;
const podsTotal = parseInt(process.env.K8S_PODS_TOTAL || '0', 10) || 0;
const deployStatus = stageScanLabel(stages, 'Deploy to Local Kubernetes');
const k8sStatus =
  podsReady > 0 && podsReady === podsTotal && deployStatus === 'Passed'
    ? 'Healthy'
    : podsReady > 0
      ? 'Degraded'
      : 'Unknown';

const buildHistory = (buildsApi.builds || []).slice(0, 10).map((b) => ({
  number: b.number,
  status: mapBuildResult(b.result),
  description: describeBuild(b, stages),
  timestamp: b.timestamp ? new Date(b.timestamp).toISOString() : null,
}));

const output = {
  buildNumber: parseInt(process.env.BUILD_NUMBER || '0', 10),
  buildUrl: process.env.BUILD_URL || '',
  jobName: process.env.JOB_NAME || '',
  result: (process.env.BUILD_RESULT || 'UNKNOWN').toUpperCase(),
  timestamp: new Date().toISOString(),
  durationMs: parseInt(process.env.BUILD_DURATION_MS || '0', 10) || 0,
  version: process.env.APP_VERSION || '1.0.0',
  imageTag: process.env.IMAGE_TAG || 'latest',
  stages,
  security: {
    trivyFilesystem: stageScanLabel(stages, 'Trivy File System Scan'),
    trivyImage: stageScanLabel(stages, 'Trivy Image Scan'),
    sonarQube: sonarQubeLabel(stages),
    vulnerabilities: {
      critical: trivySummary.critical || 0,
      high: trivySummary.high || 0,
      medium: trivySummary.medium || 0,
    },
  },
  kubernetes: {
    podsReady,
    podsTotal,
    status: k8sStatus,
  },
  buildHistory,
};

const outputPath =
  process.env.OUTPUT_PATH ||
  path.join(__dirname, '..', 'data', 'pipeline-status.json');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`Wrote ${outputPath}\n`);
