# DevOps Monitoring Portal

A lightweight Node.js monitoring demo application for local macOS DevSecOps CI/CD pipeline testing. Use it with Jenkins, Docker, Trivy, SonarQube, Kubernetes (Docker Desktop), Prometheus, and Grafana.

## Project Overview

The DevOps Monitoring Portal provides a web dashboard and API endpoints fed by real Jenkins pipeline data. Each build publishes a `pipeline-status.json` snapshot (stages, Trivy counts, K8s pod status, build history) that the app reads from a Kubernetes ConfigMap. Prometheus and Grafana health is checked live on each page load.

## Features

- **Dashboard** (`GET /`) — Status cards from the latest Jenkins pipeline snapshot + live Prometheus/Grafana probes
- **Health API** (`GET /health`) — JSON health check for probes and smoke tests
- **Metrics API** (`GET /metrics`) — Prometheus exposition format with live request counts and pipeline K8s metrics
- **Security page** (`GET /security`) — Trivy/SonarQube stage results and vulnerability counts from the last build
- **Deployments page** (`GET /deployments`) — Recent Jenkins build history from the pipeline snapshot
- **Pipeline API** (`GET /api/pipeline-status`) — Raw JSON snapshot for debugging
- **Jest + Supertest** — Automated route tests for CI pipelines
- **Docker** — Production-ready `node:20-alpine` image
- **Kubernetes** — Deployment (2 replicas) and LoadBalancer services (localhost on Docker Desktop)

## Tech Stack

- Node.js
- Express.js
- EJS templates
- Jest
- Supertest
- Docker
- Kubernetes YAML manifests

## Folder Structure

```
devops-monitoring-portal/
├── src/
│   ├── app.js              # Express app (exported for tests)
│   ├── server.js           # HTTP server entry point
│   ├── metrics/
│   │   ├── store.js        # Live counters for Prometheus export
│   │   └── middleware.js   # Increments app_requests_total per HTTP hit
│   └── routes/
│       ├── dashboard.js
│       ├── health.js
│       ├── metrics.js
│       ├── security.js
│       └── deployments.js
├── views/
│   ├── index.ejs
│   ├── security.ejs
│   └── deployments.ejs
├── public/
│   └── style.css
├── tests/
│   └── app.test.js
├── kubernetes/
│   ├── deployment.yml
│   ├── service.yml
│   └── monitoring/
│       ├── prometheus-configmap.yml
│       ├── prometheus-deployment.yml
│       ├── grafana-datasource-configmap.yml
│       ├── grafana-dashboard-configmap.yml
│       └── grafana-deployment.yml
├── Dockerfile
├── Jenkinsfile          # CI/CD pipeline (see Jenkins section below)
├── .dockerignore
├── .gitignore
├── package.json
└── README.md
```

## Local Setup

1. Navigate to the project directory:

   ```bash
   cd devops-monitoring-portal
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the application:

   ```bash
   npm start
   ```

4. Open in your browser:

   [http://localhost:3000](http://localhost:3000)

Optional: run with auto-reload during development:

```bash
npm run dev
```

The server listens on port **3000** by default. Override with the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## Test Instructions

Run the full test suite:

```bash
npm test
```

Watch mode for local development:

```bash
npm run test:watch
```

Tests cover the dashboard, health, metrics, security, and deployments routes without starting a live server on port 3000.

## Docker Build and Run

Build the image:

```bash
docker build -t devops-monitoring-portal:latest .
```

Run the container:

```bash
docker run --rm -p 3000:3000 devops-monitoring-portal:latest
```

Verify health:

```bash
curl http://localhost:3000/health
```

## Kubernetes Deployment

Ensure Docker Desktop Kubernetes is enabled and the image exists locally:

```bash
docker build -t devops-monitoring-portal:latest .
```

Apply app and monitoring manifests:

```bash
kubectl apply -f kubernetes/
kubectl apply -f kubernetes/monitoring/
```

Check pods and services:

```bash
kubectl get pods
kubectl get svc
```

**Access on Docker Desktop (after Jenkins deploy or `kubectl apply`):** Services use `type: LoadBalancer`. Docker Desktop publishes them on `localhost` automatically — no `kubectl port-forward` required.

```bash
kubectl get svc
# EXTERNAL-IP column should show localhost for app, prometheus, and grafana services
```

| Service | URL | Notes |
|---------|-----|-------|
| App | http://localhost:30080 | Dashboard, `/health`, `/metrics` |
| Prometheus | http://localhost:9091 | Cluster Prometheus (9090 left free for local installs) |
| Grafana | http://localhost:3030 | Login `admin` / `admin`; dashboard **DevOps Monitoring Portal** |

The app deployment uses `imagePullPolicy: Never` so Kubernetes uses your locally built image. Prometheus and Grafana images pull from Docker Hub on first deploy.

## Health Endpoint

`GET /health` returns JSON for automation and probes:

```json
{
  "status": "healthy",
  "service": "devops-monitoring-portal",
  "version": "1.0.0",
  "environment": "local",
  "timestamp": "2026-06-03T12:00:00.000Z"
}
```

Kubernetes readiness and liveness probes in `kubernetes/deployment.yml` call this endpoint. Jenkins post-deploy smoke tests can assert `status === "healthy"`.

## Metrics Endpoint

`GET /metrics` returns Prometheus text format (`Content-Type: text/plain`). Live counters increment at runtime:

```
app_info{service="devops-monitoring-portal",version="1.0.0"} 1
app_health_status 1
app_requests_total 12
app_deployments_total 1
app_security_scan_status 1
app_kubernetes_pods_ready 2
app_uptime_seconds 42
```

- **`app_requests_total`** — incremented on each HTTP request (except `/metrics` scrapes)
- **`app_uptime_seconds`** — derived from `process.uptime()`
- **`app_deployments_total`** — Jenkins build number from pipeline snapshot
- **`app_kubernetes_pods_ready`** — ready pod count captured during Verify Deployment

Prometheus in `kubernetes/monitoring/` scrapes `devops-monitoring-portal-service:30080/metrics` every 15 seconds.

## Pipeline status data (Jenkins → app)

After every Jenkins run (success or failure), the `post { always }` block:

1. Fetches stage results from `${BUILD_URL}wfapi/describe`
2. Fetches recent builds from the Jenkins API
3. Summarizes Trivy JSON reports (`trivyfs.json`, `trivyimage.json`)
4. Writes `data/pipeline-status.json` via `scripts/generate-pipeline-status.js`
5. Publishes it to the `pipeline-status` ConfigMap (mounted at `/data` in app pods)

The UI reflects the **last completed build**. Prometheus/Grafana cards on the dashboard are **live** (HTTP probes inside the cluster).

First run may show seed/empty data until `post` publishes the ConfigMap. No Jenkins API token is stored in the app.

## Prometheus and Grafana

### Prerequisites

| Requirement | Notes |
|-------------|-------|
| Docker Desktop Kubernetes | Same cluster as the app |
| Network access | First deploy pulls `prom/prometheus` and `grafana/grafana` from Docker Hub |
| ~512MB spare RAM | Two additional pods (Prometheus + Grafana) |

No new Jenkins plugins or global tools are required — the pipeline applies monitoring manifests with `kubectl`.

### Data flow

1. App exports metrics at `/metrics`
2. Prometheus scrapes (ingests) metrics from `devops-monitoring-portal-service:30080`
3. Grafana queries Prometheus and renders the provisioned **DevOps Monitoring Portal** dashboard

### Verify after deploy

```bash
kubectl get pods
kubectl get svc

curl http://localhost:30080/health
# Prometheus → http://localhost:9091/targets (devops-monitoring-portal should be UP)
# Grafana → http://localhost:3030 → Dashboards → DevOps Monitoring Portal
```

The Jenkins **Verify Local Access** stage runs these checks automatically after each pipeline run.

### Trivy report encoding

Trivy table output uses UTF-8 box-drawing characters. If archived reports show garbled text like `â"‚`, open the file as **UTF-8** in your editor, or use `--format json` for artifacts.

## Jenkins Pipeline

The pipeline definition lives in [`Jenkinsfile`](Jenkinsfile) in this folder (Choice B: app subfolder).

### Jenkins job configuration

| Setting | Value |
|---------|--------|
| Job type | Pipeline |
| Definition | Pipeline script from SCM |
| SCM | Your GitHub repository |
| Branch | `main` (or your default branch) |
| **Script Path** | **`devops-monitoring-portal/Jenkinsfile`** |

If Script Path is left as the default `Jenkinsfile`, Jenkins will not find the pipeline and the job will fail immediately.

### Prerequisites (configure before first run)

1. **Plugins:** Pipeline, Git, NodeJS, SonarQube Scanner, Workspace Cleanup
2. **Global Tool → NodeJS:** name **`node20`**
3. **Global Tool → SonarScanner:** name **`sonar-scanner`**
4. **SonarQube server:** name **`sonar-server`**, URL e.g. `http://localhost:9000`, with token
5. **macOS agent:** Jenkins user can run `docker`, `kubectl`, and `trivy` (Homebrew installs)
6. **Docker Desktop:** Kubernetes enabled; context `docker-desktop`
7. **Monitoring images:** Docker Hub reachable for `prom/prometheus` and `grafana/grafana` on first deploy

### Pipeline stages

| Stage | What it does |
|-------|----------------|
| Clean Workspace | Remove files from previous builds |
| Checkout | Clone latest code from GitHub |
| Install Dependencies | `npm ci` |
| Unit Test | `npm test` (Jest/Supertest) |
| SonarQube Analysis | Code quality scan → local SonarQube |
| Trivy File System Scan | Vulnerability scan → `trivyfs.txt` + `trivyfs.json` |
| Docker Build | `docker build -t devops-monitoring-portal:latest .` |
| Trivy Image Scan | Image scan → `trivyimage.txt` + `trivyimage.json` |
| Load Image into Kubernetes Node | Import image into cluster node containerd |
| Deploy to Local Kubernetes | Apply app + monitoring manifests |
| Verify Deployment | `kubectl get pods/deployments/svc` |
| Smoke Test | In-cluster `/health` check via `kubectl exec` |
| Verify Monitoring | Prometheus query + Grafana health check |
| Verify Local Access | Confirms http://localhost:30080, :9091, :3030 respond (LoadBalancer) |
| post always | Publishes `pipeline-status.json` to ConfigMap; archives Trivy + status artifacts |

After a successful build, open the localhost URLs above. Dashboard/security/deployments pages show data from that build.

## Jenkins DevSecOps Pipeline Fit

| Pipeline stage | How this app supports it |
|----------------|---------------------------|
| **Checkout** | Clone repo containing `devops-monitoring-portal/` |
| **Unit tests** | `npm test` — Jest validates all HTTP routes |
| **SonarQube** | Scan `src/`; security page shows SonarQube stage pass/fail from snapshot |
| **Trivy FS scan** | Scan project directory; security page shows real HIGH/CRITICAL counts from Trivy JSON |
| **Docker build** | `docker build` using included Dockerfile |
| **Trivy image scan** | Scan `devops-monitoring-portal:latest` after build |
| **Deploy to K8s** | `kubectl apply` app + `kubernetes/monitoring/` — 2 app replicas with `/health` probes |
| **Smoke test** | In-cluster `/health` via `kubectl exec` |
| **Verify Monitoring** | Prometheus `app_uptime_seconds` query + Grafana `/api/health` |
| **post always** | Publishes pipeline snapshot ConfigMap consumed by dashboard, security, deployments |
| **Observability** | Prometheus scrapes live `/metrics`; Grafana dashboard charts uptime, health, request rate |

This application is intentionally small and self-contained so each pipeline stage completes quickly on a local Mac Jenkins agent.

## License

MIT
