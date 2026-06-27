# DevOps Monitoring Portal

A **minimal Node.js demo app** used as a deploy target for the [DevOps-CICD-Pipeline-Project](../README.md). It exists so the Jenkins pipeline has something to test, containerize, scan, deploy, and monitor — **the CI/CD tooling is the focus of this repository, not the application itself.**

**Test environments:** Developed and simulated on **macOS** and **Ubuntu**. macOS uses Docker Desktop Kubernetes and Homebrew; Ubuntu uses Docker Engine with a local Kubernetes cluster and standard Linux package installs (`apt`).

## Project Overview

The portal provides a simple web dashboard and API endpoints that **display pipeline output** from Jenkins (stage results, Trivy counts, build history) via a Kubernetes ConfigMap, plus live Prometheus/Grafana health probes. It is intentionally small and self-contained so you can spend time learning the pipeline tools rather than application logic.

**→ See [Full Deployment Guide](#full-deployment-guide) for step-by-step setup (Jenkins, SonarQube, Docker, Kubernetes, and verification).**

**→ Pipeline overview and stage-by-stage context:** [repository root README](../README.md)

## Features

- **Dashboard** (`GET /`) — Status cards from the latest Jenkins pipeline snapshot + live Prometheus/Grafana probes
- **Health API** (`GET /health`) — JSON health check for probes and smoke tests
- **Metrics API** (`GET /metrics`) — Prometheus exposition format with live request counts and pipeline K8s metrics
- **Security page** (`GET /security`) — Trivy/SonarQube stage results and vulnerability counts from the last build
- **Deployments page** (`GET /deployments`) — Recent Jenkins build history from the pipeline snapshot
- **Pipeline API** (`GET /api/pipeline-status`) — Raw JSON snapshot for debugging
- **Jest + Supertest** — Automated route tests for CI pipelines
- **Docker** — Production-ready `node:20-alpine` image
- **Kubernetes** — Deployment (2 replicas) and LoadBalancer services (localhost on Docker Desktop; port-forward on Ubuntu/kind if needed)

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
├── scripts/                # Pipeline helpers (preflight, smoke tests, image load, etc.)
├── Dockerfile
├── Jenkinsfile          # CI/CD pipeline (see Jenkins section below)
├── .dockerignore
├── .gitignore
├── package.json
└── README.md
```

## Full Deployment Guide

This document contains the **hands-on deployment steps** (install tools, configure Jenkins, run the pipeline or deploy manually, verify, and troubleshoot). For a **pipeline overview** — what each stage does, data flow, and design choices — see the [repository root README](../README.md).

End-to-end steps to deploy the **app**, **Prometheus**, **Grafana**, and the **pipeline-status ConfigMap** on a local stack (**macOS** or **Ubuntu**). Use **Option A (Jenkins)** for the full DevSecOps demo; use **Option B (manual)** to deploy Kubernetes only without running the pipeline.

### What gets deployed

| Component | Manifests | Purpose |
|-----------|-----------|---------|
| DevOps Monitoring Portal (2 replicas) | `kubernetes/deployment.yml`, `kubernetes/service.yml` | Web UI, `/health`, `/metrics`, pipeline snapshot UI |
| Pipeline status ConfigMap | `kubernetes/pipeline-status-configmap.yml` | Seed data; Jenkins overwrites after each build |
| Prometheus | `kubernetes/monitoring/prometheus-*.yml` | Scrapes app metrics every 15s |
| Grafana | `kubernetes/monitoring/grafana-*.yml` | Dashboard **DevOps Monitoring Portal** |

### Prerequisites

| Requirement | macOS | Ubuntu |
|-------------|-------|--------|
| OS | macOS (tested) | Ubuntu 22.04+ (tested) |
| Container runtime | Docker Desktop (Kubernetes enabled) | Docker Engine (`docker.io` package) |
| Kubernetes | Docker Desktop built-in cluster | kind, minikube, or Docker Desktop on Linux |
| Jenkins agent | Local Mac Jenkins user | Local Linux Jenkins user or agent |
| CLI tools | `brew install node@20 kubectl trivy` | `apt install nodejs npm kubectl`; [install Trivy](https://aquasecurity.github.io/trivy/) from Aqua Security repo |
| RAM | ~2 GB free for app + monitoring pods | ~2 GB free for app + monitoring pods |
| Git | Repo pushed; Jenkins job points at it | Same |

Install CLI tools:

**macOS (Homebrew):**

```bash
brew install node@20 kubectl trivy
# Jenkins uses the node20 global tool; local dev can use: brew link node@20
```

**Ubuntu (apt + Trivy repo):**

```bash
sudo apt update
sudo apt install -y nodejs npm kubectl docker.io
# Install Trivy — see https://aquasecurity.github.io/trivy/latest/getting-started/installation/
```

Confirm Kubernetes is reachable:

```bash
docker info
kubectl config current-context
kubectl get nodes                 # node should be Ready
```

---

### Step 1 — Start SonarQube (required for the Jenkins pipeline)

SonarQube must be running before the pipeline **SonarQube Analysis** stage. Example with Docker:

```bash
docker run -d --name sonarqube \
  -p 9000:9000 \
  sonarqube:community
```

Wait until the UI loads at [http://localhost:9000](http://localhost:9000) (default login `admin` / `admin`, then set a new password). Generate an API token under **My Account → Security → Generate Tokens**.

---

### Step 2 — Configure Jenkins (one-time)

1. **Install plugins:** Pipeline, Git, NodeJS, SonarQube Scanner, Workspace Cleanup.

2. **Global tools** (Manage Jenkins → Tools):
   - NodeJS → name **`node20`**
   - SonarScanner → name **`sonar-scanner`**

3. **SonarQube server** (Manage Jenkins → System):
   - Name: **`sonar-server`**
   - Server URL: `http://localhost:9000`
   - Server authentication token: paste the SonarQube token from Step 1

4. **Create a Pipeline job:**

   | Setting | Value |
   |---------|--------|
   | Job type | Pipeline |
   | Definition | Pipeline script from SCM |
   | SCM | Your GitHub repository |
   | Branch | `main` (or your default) |
   | **Script Path** | **`devops-monitoring-portal/Jenkinsfile`** |

   If Script Path is left as the default `Jenkinsfile`, the job fails immediately.

5. **Agent permissions:** The Jenkins user must run `docker`, `kubectl`, and `trivy`. On **macOS**, ensure Docker Desktop is shared with the Jenkins process and Homebrew bins are on `PATH` (the Jenkinsfile prepends `/opt/homebrew/bin` and `/usr/local/bin`). On **Ubuntu**, add the Jenkins user to the `docker` group and ensure `kubectl` context points at your local cluster.

---

### Step 3 — Clone the repository

```bash
git clone <your-github-repo-url>
cd DevOps-CICD-Pipeline-Project/devops-monitoring-portal
```

Run preflight locally (same checks the pipeline runs):

```bash
chmod +x scripts/preflight.sh
./scripts/preflight.sh
```

---

### Step 4 — Deploy (choose one option)

#### Option A — Full deployment via Jenkins (recommended)

1. Open the Jenkins job and click **Build Now**.
2. The pipeline runs these stages in order:
   - Clean workspace → Checkout → **Preflight** (docker, kubectl, trivy, node)
   - **Trivy filesystem scan** → `npm ci` → **Unit tests** → **SonarQube** → **Quality gate**
   - **Docker build** (`devops-monitoring-portal:${BUILD_NUMBER}` + `:latest`)
   - **Trivy image scan** → **Load image into K8s node** → **kubectl apply** (app + monitoring)
   - **Verify deployment** → **Smoke test** (`/health` in-cluster) → **Verify monitoring** → **Verify local access**
3. In **post always** (even on failure): Jenkins writes `pipeline-status.json`, publishes the ConfigMap, restarts app pods, and archives Trivy reports.

When the build succeeds, the Jenkins console prints:

```text
App:        http://localhost:30080
Prometheus: http://localhost:9091
Grafana:    http://localhost:3030  (login admin/admin)
```

#### Option B — Manual Kubernetes deployment (no Jenkins)

From `devops-monitoring-portal/`:

```bash
# 1. Run tests (optional but recommended)
npm ci
npm test

# 2. Build the production image
docker build -t devops-monitoring-portal:latest .

# 3. Load the image into the Kubernetes node (required for imagePullPolicy: Never)
chmod +x scripts/load-image-k8s.sh
./scripts/load-image-k8s.sh devops-monitoring-portal latest

# 4. Apply all manifests
kubectl apply -f kubernetes/
kubectl apply -f kubernetes/monitoring/

# 5. Wait for rollouts
kubectl rollout status deployment/devops-monitoring-portal --timeout=5m
kubectl rollout status deployment/prometheus --timeout=5m
kubectl rollout status deployment/grafana --timeout=5m
```

The seed ConfigMap in `kubernetes/pipeline-status-configmap.yml` is applied automatically. Dashboard data stays minimal until you run the Jenkins pipeline once (which publishes a real snapshot).

---

### Step 5 — Verify deployment

**Cluster state:**

```bash
kubectl get pods
kubectl get deployments
kubectl get svc
```

Expect **2/2 Running** app pods, plus one Prometheus and one Grafana pod. Services should show `EXTERNAL-IP` as `localhost` on Docker Desktop LoadBalancers.

**App health:**

```bash
curl -s http://localhost:30080/health | jq .
curl -s http://localhost:30080/metrics | head -20
curl -s http://localhost:30080/api/pipeline-status | jq .
```

**In-cluster smoke test (same as Jenkins):**

```bash
chmod +x scripts/smoke-k8s.sh
./scripts/smoke-k8s.sh
```

**Prometheus:**

- Open [http://localhost:9091/targets](http://localhost:9091/targets) — job `devops-monitoring-portal` should be **UP**.
- Query: `app_uptime_seconds`

**Grafana:**

- Open [http://localhost:3030](http://localhost:3030) — login `admin` / `admin`
- **Dashboards → DevOps Monitoring Portal**

**Local access script (optional, same as Jenkins Verify Local Access stage):**

```bash
chmod +x scripts/verify-local-access.sh
./scripts/verify-local-access.sh
```

---

### Step 6 — Access URLs

| Service | URL | Notes |
|---------|-----|-------|
| App dashboard | [http://localhost:30080](http://localhost:30080) | `/`, `/security`, `/deployments` |
| Health API | [http://localhost:30080/health](http://localhost:30080/health) | JSON for probes and smoke tests |
| Metrics API | [http://localhost:30080/metrics](http://localhost:30080/metrics) | Prometheus scrape endpoint |
| Prometheus | [http://localhost:9091](http://localhost:9091) | Port 9090 kept free for local installs |
| Grafana | [http://localhost:3030](http://localhost:3030) | `admin` / `admin` |
| SonarQube | [http://localhost:9000](http://localhost:9000) | Code quality from pipeline scans |
| Jenkins | [http://localhost:8080](http://localhost:8080) | Pipeline orchestration |

Docker Desktop publishes LoadBalancer services on `localhost` automatically — **port-forward is not required** when `EXTERNAL-IP` shows `localhost`. If a URL is slow to respond right after deploy, wait ~30s or re-run `verify-local-access.sh`.

---

### Step 7 — Redeploy after code changes

**Via Jenkins:** Push to GitHub → **Build Now**. The pipeline rebuilds the image, loads `${BUILD_NUMBER}` into the cluster, runs `kubectl set image` for a rolling update, and refreshes the ConfigMap.

**Manually:**

```bash
docker build -t devops-monitoring-portal:latest .
./scripts/load-image-k8s.sh devops-monitoring-portal latest
kubectl rollout restart deployment/devops-monitoring-portal
kubectl rollout status deployment/devops-monitoring-portal --timeout=5m
```

---

### Deployment troubleshooting

| Symptom | Check |
|---------|--------|
| `ErrImageNeverPull` | Image not on the node — run `load-image-k8s.sh` after `docker build` |
| Pods `CrashLoopBackOff` | `kubectl logs -l app=devops-monitoring-portal` and `kubectl describe pod <name>` |
| Script Path error | Jenkins job must use `devops-monitoring-portal/Jenkinsfile` |
| SonarQube stage fails | SonarQube container running; server name `sonar-server`; token valid |
| Preflight fails | Docker Desktop running; Kubernetes enabled; `trivy --version` works |
| LoadBalancer URL unreachable | In-cluster smoke may still pass — wait for Docker Desktop LB or use `verify-local-access.sh` |
| Empty dashboard data | Run Jenkins once so `post always` publishes `pipeline-status` ConfigMap |

---

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

The Dockerfile uses `node:20-alpine`, `npm ci --omit=dev`, layer caching (`package*.json` before source), a non-root `app` user, and `CMD ["node", "src/server.js"]` for proper SIGTERM handling. `.dockerignore` excludes `kubernetes/`, `tests/`, `scripts/`, and scan artifacts to keep the build context small.

Build the image:

```bash
docker build -t devops-monitoring-portal:latest .
```

Run the container:

```bash
docker run --rm -p 3000:3000 -e NODE_ENV=production devops-monitoring-portal:latest
```

Verify health:

```bash
curl http://localhost:3000/health
```

## Kubernetes Deployment

> **Full walkthrough:** [Full Deployment Guide](#full-deployment-guide) (Steps 4–6) covers build, image load, `kubectl apply`, and verification.

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

### Trivy scans (report-only for local demo)

Trivy runs with `--exit-code 0` so HIGH/CRITICAL findings are **archived but do not fail the build**. This keeps the portfolio pipeline runnable on macOS and Ubuntu without chasing every base-image CVE. In production you would use `--exit-code 1`, Trivy policies, or a vulnerability management workflow instead.

Filesystem scans run **before** `npm ci` and skip `node_modules`, `coverage`, `.git`, `kubernetes`, `scripts`, and `data` so scans stay fast and focused on application source. Each scan writes JSON once; `scripts/format-trivy-report.js` generates the human-readable `.txt` artifact.

## Jenkins Pipeline

> **Full walkthrough:** [Full Deployment Guide](#full-deployment-guide) (Steps 1–4) covers SonarQube, Jenkins job setup, and triggering the pipeline.

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
5. **macOS / Ubuntu agent:** Jenkins user can run `docker`, `kubectl`, and `trivy` (Homebrew on macOS; `apt` + Trivy repo on Ubuntu)
6. **Kubernetes cluster:** Docker Desktop with Kubernetes enabled on macOS (`docker-desktop` context); kind, minikube, or Docker Desktop on Ubuntu
7. **Monitoring images:** Docker Hub reachable for `prom/prometheus` and `grafana/grafana` on first deploy

### Pipeline options

- **`disableConcurrentBuilds()`** — prevents overlapping deploys to the same local cluster
- **`buildDiscarder`** — keeps the last 20 builds (10 with artifacts)
- **`timeout(45 minutes)`** — avoids hung rollouts blocking the agent indefinitely

### Image tagging

Docker images are tagged with **`${BUILD_NUMBER}`** (traceable) and **`latest`** (convenience). The deployment is updated with `kubectl set image` each build. `imagePullPolicy: Never` keeps the local Docker Desktop workflow working without a registry.

**Production alternative:** push to ECR/GCR/ACR, use immutable digests or semver tags, and set `imagePullPolicy: IfNotPresent` or `Always`.

### Pipeline stages

| Stage | What it does |
|-------|----------------|
| Clean Workspace | Remove files from previous builds |
| Checkout | Clone latest code from GitHub |
| Preflight | Verify `docker`, `kubectl`, `trivy`, `node`, and `desktop-control-plane` are available |
| Trivy File System Scan | Vulnerability scan (before `npm ci`) → `trivyfs.json` + `trivyfs.txt` |
| Install Dependencies | `npm ci` |
| Unit Test | `npm test` (Jest/Supertest) |
| SonarQube Analysis | Code quality scan → local SonarQube |
| SonarQube Quality Gate | Optional `waitForQualityGate` (marks build UNSTABLE if gate fails; does not abort) |
| Docker Build | `docker build` with tags `${BUILD_NUMBER}` and `latest` |
| Trivy Image Scan | Image scan → `trivyimage.json` + `trivyimage.txt` |
| Load Image into Kubernetes Node | Import `${BUILD_NUMBER}` image into cluster node containerd |
| Deploy to Local Kubernetes | `kubectl apply` + `kubectl set image` rolling update (no delete/recreate) |
| Verify Deployment | `kubectl get pods/deployments/svc` |
| Smoke Test | In-cluster `/health` via `scripts/smoke-k8s.sh` (`kubectl wait` + `kubectl exec`) |
| Verify Monitoring | Prometheus query + Grafana health check (in-cluster) |
| Verify Local Access | Secondary LoadBalancer checks for localhost URLs (warns if LB is slow) |
| post always | Publishes `pipeline-status.json` to ConfigMap, restarts app pods, archives Trivy artifacts |

### SonarQube Quality Gate (optional)

The **SonarQube Quality Gate** stage polls `api/qualitygates/project_status` directly (via `scripts/wait-sonar-quality-gate.sh`) instead of Jenkins `waitForQualityGate`, which can hang for minutes on local setups when webhooks are not configured. Default wait is **120 seconds**; on timeout the pipeline continues and the build is not aborted.

If the gate returns **ERROR**, the build is marked **UNSTABLE** (demo mode — pipeline still completes). Open `http://localhost:9000/dashboard?id=devops-monitoring-portal` for details.

Optional production setup:

1. In SonarQube → Project → Webhooks, add your Jenkins URL (e.g. `http://localhost:8080/sonarqube-webhook/`)
2. In Jenkins → Configure System → SonarQube servers, enable webhook integration
3. Tighten enforcement by failing the stage on ERROR (already marks UNSTABLE) or set `abortPipeline: true` if you switch back to `waitForQualityGate`

After a successful build, open the localhost URLs above. Dashboard/security/deployments pages show data from that build.

## Jenkins DevSecOps Pipeline Fit

| Pipeline stage | How this app supports it |
|----------------|---------------------------|
| **Checkout** | Clone repo containing `devops-monitoring-portal/` |
| **Unit tests** | `npm test` — Jest validates all HTTP routes |
| **SonarQube** | Scan `src/`; security page shows SonarQube stage pass/fail from snapshot |
| **Trivy FS scan** | Scan project directory; security page shows real HIGH/CRITICAL counts from Trivy JSON |
| **Docker build** | `docker build` using included Dockerfile |
| **Trivy image scan** | Scan `devops-monitoring-portal:${BUILD_NUMBER}` after build |
| **Deploy to K8s** | `kubectl apply` + `set image` rolling update — 2 app replicas with lightweight `/health` probes |
| **Smoke test** | In-cluster `/health` via `scripts/smoke-k8s.sh` (`kubectl wait` then `kubectl exec`) |
| **Verify Monitoring** | Prometheus `app_uptime_seconds` query + Grafana `/api/health` |
| **post always** | Publishes pipeline snapshot ConfigMap consumed by dashboard, security, deployments |
| **Observability** | Prometheus scrapes live `/metrics`; Grafana dashboard charts uptime, health, request rate |

This application is intentionally small and self-contained so each pipeline stage completes quickly on a local Jenkins agent (simulated on macOS and Ubuntu). **Evaluate this repo for how the CI/CD tools work together — not for application feature depth.**

## License

MIT
