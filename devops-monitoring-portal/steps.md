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

**Why this is necessary:** The pipeline needs a running cluster target for every stage after Docker build — something to deploy, probe, scrape, and display results on. Without all four components, later pipeline stages (`Smoke Test`, `Verify Monitoring`, `post always` ConfigMap publish) either fail or have nothing meaningful to verify.

**Pipeline impact:** Jenkins `Deploy to Local Kubernetes` applies these manifests. `Verify Monitoring` expects Prometheus to scrape `/metrics` and Grafana to be healthy. `post always` writes build data into the ConfigMap the app reads — the dashboard only reflects real pipeline output after at least one Jenkins run.

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

**Why this is necessary:** Every pipeline stage depends on a specific tool — `docker` for build/scan, `kubectl` for deploy/verify, `trivy` for security stages, `node`/`npm` for tests and snapshot scripts. A missing tool causes an immediate stage failure; a missing cluster blocks deploy and all verification stages.

**Pipeline impact:** The **Preflight** stage runs `scripts/preflight.sh` and fails the build before any scans or tests if Docker, Kubernetes, Trivy, or Node is unavailable. Matching these prerequisites locally (Step 3) catches the same issues before you trigger Jenkins.

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

SonarQube must be running before the pipeline **SonarQube Analysis** stage.

```bash
docker run -d --name sonarqube \
  -p 9000:9000 \
  sonarqube:community
```

Wait until the UI loads at [http://localhost:9000](http://localhost:9000) (default login `admin` / `admin`, then set a new password). Generate an API token under **My Account → Security → Generate Tokens**.

**Why this is necessary:** The Jenkinsfile calls `withSonarQubeEnv('sonar-server')` and runs `sonar-scanner` against `http://localhost:9000`. There is no embedded SonarQube in the pipeline — it must already be running and reachable from the Jenkins agent.

**Pipeline impact:**
- **SonarQube Analysis** — uploads code quality metrics; fails if the server is down or the token is invalid.
- **SonarQube Quality Gate** — `wait-sonar-quality-gate.sh` polls `api/qualitygates/project_status` for up to 120s. OK/WARN → **Passed**; ERROR → script exits non-zero and `catchError` marks the build **UNSTABLE**; timeout → pipeline continues without marking UNSTABLE. The result is written to `pipeline-status.json` and shown on the app **Security** page. The pipeline never aborts at this stage (demo mode), so deploy still runs.

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

**Why this is necessary:** The Jenkinsfile references fixed names (`node20`, `sonar-scanner`, `sonar-server`) and expects the agent to orchestrate Docker, Kubernetes, and CLI tools. Wrong Script Path or missing plugins means Jenkins never loads the pipeline definition or cannot run its stages.

**Pipeline impact:**
- **`tools { nodejs 'node20' }`** — used by `npm ci`, `npm test`, and Node scripts in `post always`.
- **`sonar-scanner` + `sonar-server`** — required for analysis and quality gate stages.
- **Script Path** — tells Jenkins where `Jenkinsfile` lives inside the repo; wrong path = instant failure on first run.
- **Agent permissions** — without `docker`/`kubectl`/`trivy`, stages from Preflight through Deploy and Verify all fail.

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

**Why this is necessary:** Jenkins **Checkout** pulls from SCM, but validating the repo and toolchain locally first saves a full pipeline run when something basic is misconfigured (Docker not running, wrong kubectl context, Trivy missing).

**Pipeline impact:** Preflight mirrors the pipeline’s **Preflight** stage. If this script passes locally, the same stage in Jenkins is likely to succeed. If it fails here, fix the issue before **Build Now** — otherwise the build stops at Preflight and no scan, test, or deploy stages run.

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

**Why this is necessary:** Option A exercises the entire DevSecOps loop — the reason this repo exists. Manual deploy (Option B) skips scans, quality gates, snapshot publishing, and artifact archiving.

**Pipeline impact:** Each stage gates or feeds the next:
- **Trivy FS** → produces `trivyfs.json` used in `post always` and the Security dashboard.
- **Unit Test** → fails the build before Docker build if routes break.
- **SonarQube** → quality data written to snapshot; gate can mark build UNSTABLE.
- **Docker Build + Trivy Image** → image tag `${BUILD_NUMBER}` is what `kubectl set image` deploys.
- **Load Image into K8s Node** → without this, pods hit `ErrImageNeverPull` because `imagePullPolicy: Never`.
- **Deploy** → rolling update; failure here stops Smoke Test and Verify Monitoring.
- **post always** → runs even on failure so the dashboard still shows partial results and Trivy reports are archived.

---

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

**Why this is necessary:** Useful when you only need the app and monitoring stack running without Jenkins, SonarQube, or Trivy — e.g. to validate Kubernetes manifests or demo the UI quickly.

**Pipeline impact:** Option B does **not** run the pipeline. You skip security scans, SonarQube, Jenkins snapshot generation, and artifact archiving. The app runs with seed ConfigMap data only; **Security** and **Deployments** pages show placeholder values until Option A completes at least once.

| Manual sub-step | Why | Pipeline equivalent |
|-----------------|-----|---------------------|
| `npm ci` + `npm test` | Confirms code before containerizing | **Install Dependencies** + **Unit Test** — failure here would abort Jenkins before Docker build |
| `docker build` | Creates the image pods run | **Docker Build** — tags `${BUILD_NUMBER}` and `latest` in Jenkins |
| `load-image-k8s.sh` | Host Docker store ≠ cluster containerd | **Load Image into Kubernetes Node** — same import; skipping causes deploy failure |
| `kubectl apply` | Creates/updates Deployments, Services, ConfigMaps | **Deploy to Local Kubernetes** — Jenkins also runs `kubectl set image` for rolling updates |
| `rollout status` | Waits until pods are ready | **Verify Deployment** + **Smoke Test** — Jenkins adds automated `/health` checks |

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

**Why this is necessary:** Deploy alone does not prove the app responds correctly or that observability is wired up. Verification catches misconfigured probes, broken Service ports, failed image rollouts, and Prometheus scrape targets that are DOWN.

**Pipeline impact:**
- **Verify Deployment** — records ready pod counts to `k8s-pods.env`; values flow into `pipeline-status.json` as `app_kubernetes_pods_ready` on the dashboard and in `/metrics`.
- **Smoke Test** — runs `smoke-k8s.sh`; failure **fails the build** even if pods appear Running.
- **Verify Monitoring** — Prometheus must return `app_uptime_seconds`; Grafana must be healthy; failure **fails the build**.
- **Verify Local Access** — `verify-local-access.sh` checks localhost LoadBalancer URLs. The app check only **warns** if the LB is slow; Prometheus and Grafana fall back to an in-cluster check and **fail the build** only if that also fails. In-cluster smoke/monitoring are the primary gates.

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

**Why this is necessary:** The pipeline deploys cluster-internal services; these URLs are how you confirm the full stack is reachable from your machine and demo the project in a portfolio or interview.

**Pipeline impact:** Jenkins prints the app, Prometheus, and Grafana URLs on **success**. The app dashboard reads live pipeline snapshot data; Grafana charts metrics Prometheus scraped after **Verify Monitoring** passed. SonarQube and Jenkins UIs show quality and build history from the same run.

---

## Step 7 — Redeploy after code changes

**Via Jenkins:**

Push to GitHub → **Build Now**. The pipeline rebuilds the image, loads `${BUILD_NUMBER}` into the cluster, runs `kubectl set image` for a rolling update, and refreshes the ConfigMap.

**Manually:**

```bash
docker build -t devops-monitoring-portal:latest .
./scripts/load-image-k8s.sh devops-monitoring-portal latest
kubectl rollout restart deployment/devops-monitoring-portal
kubectl rollout status deployment/devops-monitoring-portal --timeout=5m
```

**Why this is necessary:** Kubernetes does not automatically pick up a rebuilt local image — the cluster node must have the new image and the Deployment must roll out new pods. Without redeploy, you keep running stale code even after `docker build`.

**Pipeline impact (Jenkins path):**
- **Docker Build** creates a new `${BUILD_NUMBER}` tag traceable to that Jenkins run.
- **Load Image into Kubernetes Node** imports that tag into containerd.
- **kubectl set image** triggers a rolling update without deleting the Deployment.
- **post always** refreshes `pipeline-status.json` so the dashboard reflects the latest build number, scan results, and stage outcomes.

Manual redeploy updates the app only — it does **not** refresh the ConfigMap or archive Trivy reports; run Jenkins for a full pipeline cycle.

---

## Troubleshooting

| Symptom | Check | Pipeline stage affected |
|---------|--------|-------------------------|
| `ErrImageNeverPull` | Run `load-image-k8s.sh` after `docker build` | **Load Image into Kubernetes Node**, **Deploy** |
| Pods `CrashLoopBackOff` | `kubectl logs` / `kubectl describe pod` | **Deploy**, **Smoke Test** |
| Script Path error | Job must use `devops-monitoring-portal/Jenkinsfile` | Job fails before any stage |
| SonarQube stage fails | Container running; server name `sonar-server`; token valid | **SonarQube Analysis**, **Quality Gate** |
| Preflight fails | Docker running; Kubernetes enabled; `trivy --version` works | **Preflight** — blocks all later stages |
| LoadBalancer URL unreachable | In-cluster smoke may still pass; wait or use `verify-local-access.sh` | **Verify Local Access** (warns; build may still succeed) |
| Empty dashboard data | Run Jenkins once so `post always` publishes ConfigMap | **post always** — snapshot never written |
