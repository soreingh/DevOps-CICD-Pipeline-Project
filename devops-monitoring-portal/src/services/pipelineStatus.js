const fs = require('fs');
const path = require('path');

const STATUS_PATH =
  process.env.PIPELINE_STATUS_PATH ||
  path.join('/data', 'pipeline-status.json');

const FALLBACK = {
  buildNumber: 0,
  buildUrl: '',
  jobName: '',
  result: 'UNKNOWN',
  timestamp: '',
  durationMs: 0,
  version: '1.0.0',
  imageTag: 'latest',
  stages: [],
  security: {
    trivyFilesystem: 'Unknown',
    trivyImage: 'Unknown',
    sonarQube: 'Unknown',
    vulnerabilities: { critical: 0, high: 0, medium: 0 },
  },
  kubernetes: {
    podsReady: 0,
    podsTotal: 0,
    status: 'Unknown',
  },
  buildHistory: [],
};

function loadPipelineStatus() {
  try {
    if (!fs.existsSync(STATUS_PATH)) {
      return { ...FALLBACK, _missing: true };
    }
    const raw = fs.readFileSync(STATUS_PATH, 'utf8');
    const data = JSON.parse(raw);
    return { ...FALLBACK, ...data, _missing: false };
  } catch {
    return { ...FALLBACK, _missing: true };
  }
}

function mapDeployResult(status) {
  if (status === 'SUCCESS') return 'Successful';
  if (status === 'FAILURE') return 'Failed';
  if (status === 'UNSTABLE') return 'Unstable';
  if (status === 'ABORTED') return 'Aborted';
  return status || 'Unknown';
}

function securityAggregate(status) {
  const { security } = loadPipelineStatus();
  const values = [security.trivyFilesystem, security.trivyImage, security.sonarQube];
  if (values.some((v) => v === 'Failed')) return 'Failed';
  if (values.every((v) => v === 'Passed')) return 'Passed';
  if (values.some((v) => v === 'Skipped')) return 'Skipped';
  return 'Unknown';
}

function getDashboardCards() {
  const data = loadPipelineStatus();
  const deployStage = data.stages.find((s) => s.name === 'Deploy to Local Kubernetes');
  const lastDeployment = deployStage
    ? mapDeployResult(deployStage.status)
    : data._missing
      ? 'No pipeline data yet'
      : 'Unknown';

  const appHealthy = data.kubernetes.podsReady > 0 && data.kubernetes.status === 'Healthy';

  return {
    applicationStatus: appHealthy ? 'Healthy' : data._missing ? 'Unknown' : 'Degraded',
    currentVersion: `v${data.version}${data.buildNumber ? ` (build #${data.buildNumber})` : ''}`,
    environment: 'Local Kubernetes',
    lastDeployment,
    securityScanStatus: securityAggregate(),
    jenkinsStatus: data._missing ? 'Unknown' : 'Online',
    dockerStatus: data.stages.find((s) => s.name === 'Docker Build')?.status === 'SUCCESS'
      ? 'Running'
      : data._missing
        ? 'Unknown'
        : 'Unknown',
    kubernetesStatus: data.kubernetes.status,
    buildNumber: data.buildNumber,
    lastPipelineAt: data.timestamp || 'Never',
  };
}

function getSecuritySummary() {
  const data = loadPipelineStatus();
  return {
    scans: {
      trivyFilesystem: data.security.trivyFilesystem,
      trivyImage: data.security.trivyImage,
      sonarQubeQualityGate: data.security.sonarQube,
    },
    vulnerabilities: data.security.vulnerabilities,
    lastScan: data.timestamp
      ? new Date(data.timestamp).toLocaleString()
      : 'No scan data yet',
  };
}

function getBuildHistory() {
  const data = loadPipelineStatus();
  return data.buildHistory.length > 0
    ? data.buildHistory
    : data.buildNumber
      ? [
          {
            number: data.buildNumber,
            status: mapDeployResult(data.result),
            description: data.jobName || 'Latest pipeline run',
            timestamp: data.timestamp,
          },
        ]
      : [];
}

function getKubernetesSnapshot() {
  const data = loadPipelineStatus();
  return data.kubernetes;
}

function getSecurityScanMetric() {
  const status = securityAggregate();
  return {
    value: status === 'Passed' ? 1 : 0,
    label: status,
    ok: status === 'Passed',
  };
}

module.exports = {
  loadPipelineStatus,
  getDashboardCards,
  getSecuritySummary,
  getBuildHistory,
  getKubernetesSnapshot,
  getSecurityScanMetric,
  STATUS_PATH,
};
