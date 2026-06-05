# DevOps Monitoring Portal

A lightweight Node.js monitoring demo application for local macOS DevSecOps CI/CD pipeline testing. Use it with Jenkins, Docker, Trivy, SonarQube, Kubernetes (Docker Desktop), Prometheus, and Grafana.

## Project Overview

The DevOps Monitoring Portal provides a simple web dashboard and API endpoints that simulate a production monitoring stack. It is designed for pipeline demonstrations: unit tests in Jenkins, container scans with Trivy, quality gates in SonarQube, Docker image builds, Kubernetes deployments, and Prometheus metric scraping.

## Features

- **Dashboard** (`GET /`) — DevOps-style status cards for app, Jenkins, Docker, Kubernetes, Prometheus, and Grafana
- **Health API** (`GET /health`) — JSON health check for probes and smoke tests
- **Metrics API** (`GET /metrics`) — Prometheus exposition format with dynamic uptime
- **Security page** (`GET /security`) — Mock Trivy and SonarQube scan summary
- **Deployments page** (`GET /deployments`) — Mock Jenkins build history
- **Jest + Supertest** — Automated route tests for CI pipelines
- **Docker** — Production-ready `node:20-alpine` image
- **Kubernetes** — Deployment (2 replicas) and NodePort service

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
│   └── service.yml
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

Apply manifests:

```bash
kubectl apply -f kubernetes/
```

Check pods and service:

```bash
kubectl get pods
kubectl get svc devops-monitoring-portal-service
```

Access the app via NodePort:

[http://localhost:30080](http://localhost:30080)

The deployment uses `imagePullPolicy: Never` so Kubernetes uses your locally built image.

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

`GET /metrics` returns Prometheus text format (`Content-Type: text/plain`). Example metrics:

```
app_info{service="devops-monitoring-portal",version="1.0.0"} 1
app_health_status 1
app_requests_total 100
app_deployments_total 5
app_security_scan_status 1
app_kubernetes_pods_ready 2
app_uptime_seconds 42
```

`app_uptime_seconds` is computed from `process.uptime()` and increases while the process runs. Configure Prometheus to scrape `http://<host>:3000/metrics`.

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

### Pipeline stages

| Stage | What it does |
|-------|----------------|
| Clean Workspace | Remove files from previous builds |
| Checkout | Clone latest code from GitHub |
| Install Dependencies | `npm ci` |
| Unit Test | `npm test` (Jest/Supertest) |
| SonarQube Analysis | Code quality scan → local SonarQube |
| Trivy File System Scan | Vulnerability scan → `trivyfs.txt` |
| Docker Build | `docker build -t devops-monitoring-portal:latest .` |
| Trivy Image Scan | Image scan → `trivyimage.txt` |
| Deploy to Local Kubernetes | `kubectl apply -f kubernetes/` |
| Verify Deployment | `kubectl get pods/deployments/svc` |
| Smoke Test | `curl http://localhost:30080/health` |

After a successful build, open [http://localhost:30080](http://localhost:30080). Trivy reports are archived as Jenkins build artifacts.

## Jenkins DevSecOps Pipeline Fit

| Pipeline stage | How this app supports it |
|----------------|---------------------------|
| **Checkout** | Clone repo containing `devops-monitoring-portal/` |
| **Unit tests** | `npm test` — Jest validates all HTTP routes |
| **SonarQube** | Scan `src/` for code quality; security page reflects quality gate narrative |
| **Trivy FS scan** | Scan project directory; security page shows filesystem scan status |
| **Docker build** | `docker build` using included Dockerfile |
| **Trivy image scan** | Scan `devops-monitoring-portal:latest` after build |
| **Deploy to K8s** | `kubectl apply -f kubernetes/` — 2 replicas with `/health` probes |
| **Smoke test** | `curl /health` expects `"status":"healthy"` |
| **Observability** | Prometheus scrapes `/metrics`; Grafana dashboards can chart exported metrics |

This application is intentionally small and self-contained so each pipeline stage completes quickly on a local Mac Jenkins agent.

## License

MIT
