# Deployment Steps

Hands-on guide to deploy the **app**, **Prometheus**, **Grafana**, and **pipeline-status ConfigMap** on a local stack (**macOS** or **Ubuntu**).

**Pipeline context** (what each stage does, data flow, design choices): [repository root README](../README.md)

Use **Option A (Jenkins)** for the full DevSecOps demo; use **Option B (manual)** to deploy Kubernetes only without running the pipeline.

---

## What gets deployed

| Component | Manifests | Purpose |
|-----------|-----------|---------|
| DevOps Monitoring Portal (2 replicas) | `kubernetes/deployment.yml`, `kubernetes/service.yml` | Web UI, `/health`, `/metrics`, pipeline snapshot UI |
| Pipeline status ConfigMap | `kubernetes/pipeline-status-configmap.yml` | Seed data; Jenkins overwrites after each build |
| Prometheus | `kubernetes/monitoring/prometheus-*.yml` | Scrapes app metrics every 15s |
| Grafana | `kubernetes/monitoring/grafana-*.yml` | Dashboard **DevOps Monitoring Portal** |

---

## Prerequisites

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

## Step 1 — Start SonarQube (required for the Jenkins pipeline)

SonarQube must be running before the pipeline **SonarQube Analysis** stage. Example with Docker:

```bash
docker run -d --name sonarqube \
  -p 9000:9000 \
  sonarqube:community
```

Wait until the UI loads at [http://localhost:9000](http://localhost:9000) (default login `admin` / `admin`, then set a new password). Generate an API token under **My Account → Security → Generate Tokens**.

---

## Step 2 — Configure Jenkins (one-time)

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

## Step 3 — Clone the repository

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

## Step 4 — Deploy (choose one option)

### Option A — Full deployment via Jenkins (recommended)

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

### Option B — Manual Kubernetes deployment (no Jenkins)

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

## Step 5 — Verify deployment

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

## Step 6 — Access URLs

| Service | URL | Notes |
|---------|-----|-------|
| App dashboard | [http://localhost:30080](http://localhost:30080) | `/`, `/security`, `/deployments` |
| Health API | [http://localhost:30080/health](http://localhost:30080/health) | JSON for probes and smoke tests |
| Metrics API | [http://localhost:30080/metrics](http://localhost:30080/metrics) | Prometheus scrape endpoint |
| Prometheus | [http://localhost:9091](http://localhost:9091) | Port 9090 kept free for local installs |
| Grafana | [http://localhost:3030](http://localhost:3030) | `admin` / `admin` |
| SonarQube | [http://localhost:9000](http://localhost:9000) | Code quality from pipeline scans |
| Jenkins | [http://localhost:8080](http://localhost:8080) | Pipeline orchestration |

Docker Desktop publishes LoadBalancer services on `localhost` automatically — **port-forward is not required** when `EXTERNAL-IP` shows `localhost`. On Ubuntu/kind, use `kubectl port-forward` if LoadBalancer is not available. If a URL is slow to respond right after deploy, wait ~30s or re-run `verify-local-access.sh`.

---

## Step 7 — Redeploy after code changes

**Via Jenkins:** Push to GitHub → **Build Now**. The pipeline rebuilds the image, loads `${BUILD_NUMBER}` into the cluster, runs `kubectl set image` for a rolling update, and refreshes the ConfigMap.

**Manually:**

```bash
docker build -t devops-monitoring-portal:latest .
./scripts/load-image-k8s.sh devops-monitoring-portal latest
kubectl rollout restart deployment/devops-monitoring-portal
kubectl rollout status deployment/devops-monitoring-portal --timeout=5m
```

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `ErrImageNeverPull` | Image not on the node — run `load-image-k8s.sh` after `docker build` |
| Pods `CrashLoopBackOff` | `kubectl logs -l app=devops-monitoring-portal` and `kubectl describe pod <name>` |
| Script Path error | Jenkins job must use `devops-monitoring-portal/Jenkinsfile` |
| SonarQube stage fails | SonarQube container running; server name `sonar-server`; token valid |
| Preflight fails | Docker running; Kubernetes enabled; `trivy --version` works |
| LoadBalancer URL unreachable | In-cluster smoke may still pass — wait for Docker Desktop LB or use `verify-local-access.sh` |
| Empty dashboard data | Run Jenkins once so `post always` publishes `pipeline-status` ConfigMap |
