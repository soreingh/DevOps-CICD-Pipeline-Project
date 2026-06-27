# DevOps-CICD-Pipeline-Project

A local **DevSecOps CI/CD lab** for simulating and testing pipeline tooling end to end — not a product-focused application build.

**Primary goal:** Exercise and validate **CI/CD tools** (Jenkins, Trivy, SonarQube, Docker, Kubernetes, Prometheus, Grafana) on a realistic but lightweight workflow. The included Node.js monitoring app is a **deliberately small deploy target** so each pipeline stage has something to build, scan, deploy, and observe. **The application is not the focus of this project; the pipeline and tooling integration are.**

**Stack:** Jenkins · Docker · Trivy · SonarQube · Kubernetes · Prometheus · Grafana

**Test environments:** Simulated and validated on **macOS** (Docker Desktop Kubernetes, Homebrew tooling) and **Ubuntu** (Docker Engine, local or kind/minikube-style Kubernetes, apt-installed CLI tools).

---

## What this repository does

When you trigger a Jenkins build, the pipeline:

1. **Validates the environment** — confirms Docker, Kubernetes, Trivy, and Node are available before any work starts.
2. **Scans source code for vulnerabilities** — Trivy filesystem scan runs *before* `npm ci` so findings reflect your application source, not a fresh `node_modules` tree.
3. **Tests and analyzes quality** — Jest/Supertest unit tests gate the build; SonarQube scans `src/` and polls the quality gate (marks the build UNSTABLE on failure, but still completes in demo mode).
4. **Builds and scans the container** — Docker produces a production image tagged with `${BUILD_NUMBER}` and `latest`; Trivy scans the image for HIGH/CRITICAL CVEs.
5. **Deploys to local Kubernetes** — the image is imported into the cluster node (required because `imagePullPolicy: Never`), then manifests deploy the app (2 replicas), Prometheus, and Grafana.
6. **Verifies the deployment** — in-cluster smoke tests hit `/health`; Prometheus must return `app_uptime_seconds`; Grafana must report healthy; localhost LoadBalancer URLs are checked as a secondary step.
7. **Publishes pipeline data back to the app** — even on failure, the `post always` block writes `pipeline-status.json` (stage results, Trivy counts, build history, pod counts) into a Kubernetes ConfigMap so the web UI reflects the last run.

The result is a portfolio-friendly loop: **code → scan → test → build → deploy → observe → dashboard shows what Jenkins just did.** The dashboard exists to **surface pipeline output** (scan results, deploy status, metrics) — not to demonstrate application complexity.

---

## Pipeline flow

```text
GitHub push / Build Now
        │
        ▼
┌───────────────────┐
│  Clean + Checkout │  Fresh workspace, shallow clone from SCM
└─────────┬─────────┘
          ▼
┌───────────────────┐
│     Preflight     │  docker · kubectl · trivy · node · K8s node Ready
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  Trivy FS Scan    │  HIGH/CRITICAL on source (report-only, exit 0)
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  npm ci + tests   │  Reproducible install · Jest/Supertest route tests
└─────────┬─────────┘
          ▼
┌───────────────────┐
│    SonarQube      │  Static analysis + quality gate poll (UNSTABLE if ERROR)
└─────────┬─────────┘
          ▼
┌───────────────────┐
│   Docker Build    │  devops-monitoring-portal:${BUILD_NUMBER} + :latest
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  Trivy Image Scan │  HIGH/CRITICAL on built image (report-only)
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  Load into K8s    │  docker save → ctr import on cluster node(s)
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  kubectl apply    │  App + Prometheus + Grafana · rolling set image
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  Verify + Smoke   │  Pod readiness · /health in-cluster · metrics query
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  post always      │  pipeline-status ConfigMap · archive Trivy artifacts
└───────────────────┘
```

---

## Pipeline stages (what each one does)

| Phase | Stage | What happens |
|-------|--------|----------------|
| **Prepare** | Clean Workspace | Removes leftover `node_modules`, scan reports, and artifacts from prior builds. |
| | Checkout | Shallow Git clone (`depth: 1`) from SCM into `$WORKSPACE`; `retry(2)` re-attempts once on failure, 20-min timeout per attempt. |
| | Preflight | Runs `scripts/preflight.sh` — fails fast if Docker daemon, Kubernetes cluster, Trivy, or Node is missing. |
| **Security (source)** | Trivy File System Scan | Scans application source for HIGH/CRITICAL issues; writes `trivyfs.json` + human-readable `trivyfs.txt`. Runs before dependency install. `--exit-code 0` = report only, does not fail the build. |
| **Build & test** | Install Dependencies | `npm ci` from `package-lock.json` inside `devops-monitoring-portal/`. |
| | Unit Test | `npm test` — Jest + Supertest validate `/`, `/health`, `/metrics`, `/security`, `/deployments`, and `/api/pipeline-status`. |
| **Quality** | SonarQube Analysis | Sends `src/` and test coverage to local SonarQube (`sonar-server`). |
| | SonarQube Quality Gate | Polls SonarQube API for up to 120s via `wait-sonar-quality-gate.sh`. OK/WARN → Passed; ERROR → build marked **UNSTABLE** (via `catchError`); timeout → continues without marking UNSTABLE. Pipeline never aborts here. |
| **Security (image)** | Docker Build | Builds production image from `Dockerfile` (Alpine, non-root, `NODE_ENV=production`). |
| | Trivy Image Scan | Scans `${APP_NAME}:${BUILD_NUMBER}`; writes `trivyimage.json` + `trivyimage.txt`. |
| **Deploy** | Load Image into Kubernetes Node | Imports the built image into every cluster node's containerd — host `docker build` alone is not visible to the kubelet when `imagePullPolicy: Never`. |
| | Deploy to Local Kubernetes | `kubectl apply` app + monitoring manifests; `kubectl set image` rolling update to `${BUILD_NUMBER}`; waits for app, Prometheus, and Grafana rollouts. |
| **Verify** | Verify Deployment | Prints pods/deployments/services; records ready pod count to `k8s-pods.env` for the dashboard snapshot. |
| | Smoke Test | `scripts/smoke-k8s.sh` — waits for pods, then checks `/health` returns `"status":"healthy"` inside the cluster. |
| | Verify Monitoring | Prometheus must answer `app_uptime_seconds`; Grafana `/api/health` must report database OK. |
| | Verify Local Access | `scripts/verify-local-access.sh` — checks localhost LoadBalancer URLs. App LB only warns if slow; Prometheus/Grafana fall back to an in-cluster check and fail only if that also fails. |
| **Post-build** | post always | Fetches Jenkins stage results + build history; summarizes Trivy JSON; generates `pipeline-status.json`; applies `pipeline-status` ConfigMap; restarts app pods; archives Trivy reports and snapshot as Jenkins artifacts. |

---

## How data flows after a build

```text
Jenkins build
    │
    ├─► Trivy JSON  ──────────────► pipeline-status.json ──► ConfigMap ──► App pods (/data)
    ├─► wfapi stages ─────────────►   (security counts, build history, K8s pod counts)
    ├─► Jenkins build API ────────►
    │
    ├─► Docker image :${BUILD_NUMBER} ──► Kubernetes Deployment (2 replicas)
    │
    └─► /metrics endpoint ◄── scrape ── Prometheus ◄── query ── Grafana dashboard
```

The **web dashboard** reads the ConfigMap snapshot (pipeline stages, Trivy results, deployment history). **Prometheus/Grafana cards** on the dashboard are probed live on each page load.

---

## Repository layout

| Path | Purpose |
|------|---------|
| [`devops-monitoring-portal/`](devops-monitoring-portal/) | Minimal deployable app + Dockerfile + K8s manifests (supports the pipeline; not the main subject) |
| [`devops-monitoring-portal/Jenkinsfile`](devops-monitoring-portal/Jenkinsfile) | Declarative pipeline definition (Script Path for Jenkins job) |
| [`devops-monitoring-portal/steps.md`](devops-monitoring-portal/steps.md) | **Deployment steps** — prerequisites, Jenkins job setup, manual K8s deploy, verification, URLs |

---

## Demo app (minimal deploy target)

The Node.js app in `devops-monitoring-portal/` surfaces pipeline output on a simple dashboard. It is not the focus of this repo — see routes below for what the pipeline deploys and verifies.

| Route | Purpose |
|-------|---------|
| `GET /` | Dashboard — Jenkins snapshot + live Prometheus/Grafana status |
| `GET /health` | JSON health check (K8s probes, smoke tests) |
| `GET /metrics` | Prometheus exposition format |
| `GET /security` | Trivy/SonarQube results from last build |
| `GET /deployments` | Jenkins build history from last build |
| `GET /api/pipeline-status` | Raw pipeline snapshot JSON |

**Local development** (without Kubernetes):

```bash
cd devops-monitoring-portal
npm install
npm start          # http://localhost:3000
npm test           # Jest + Supertest
```

## Jenkins job (quick reference)

Create a **Pipeline** job with **Pipeline script from SCM**:

```text
Script Path: devops-monitoring-portal/Jenkinsfile
```

One-time Jenkins configuration (plugins, `node20` tool, `sonar-scanner`, `sonar-server`, SonarQube token) and the full step-by-step deploy guide:

**→ [`devops-monitoring-portal/steps.md`](devops-monitoring-portal/steps.md)**

---

## After a successful build

| Service | URL |
|---------|-----|
| App | http://localhost:30080 |
| Prometheus | http://localhost:9091 |
| Grafana | http://localhost:3030 (`admin` / `admin`) |
| SonarQube | http://localhost:9000 |

Trivy reports and `pipeline-status.json` are available under the Jenkins build **Artifacts** tab.

---

## Design choices (demo vs production)

| Topic | This repo (local demo) | Production alternative |
|-------|------------------------|-------------------------|
| Trivy | `--exit-code 0` — findings archived, build continues | `--exit-code 1` or policy-based gating |
| SonarQube gate | UNSTABLE on ERROR, pipeline completes | Fail stage or `abortPipeline: true` |
| Image tags | `${BUILD_NUMBER}` + `latest`, `imagePullPolicy: Never` | Registry push, immutable digests, `IfNotPresent` / `Always` |
| Secrets | SonarQube token in Jenkins credentials only | External secret manager, no tokens in job config |
| Deploy | Rolling update to local Kubernetes (Docker Desktop on macOS, Docker/kind on Ubuntu) | GitOps (Argo CD / Flux), staged environments |

---

## AI-assisted development

This project was built with **[Cursor](https://cursor.com)** as the AI pair-programmer to maximize productivity while keeping full engineering ownership of the result. AI was used as a force multiplier — accelerating boilerplate, reviewing configuration, and stress-testing the pipeline — not as a replacement for understanding the tooling.

**Strategic prompting workflow:**

- **Plan mode** — scoped large changes (deployment guide, pipeline documentation, doc restructuring) before writing anything, weighing trade-offs up front instead of coding blindly.
- **Agent mode** — executed well-defined implementation tasks (Dockerfile hardening, Kubernetes manifests, Jest/Supertest tests, README/steps authoring).
- **Debug / QA passes** — ran production-readiness reviews of routes, error handling, Docker security, K8s probes, and the Jenkinsfile to catch bugs and risky defaults.
- **Ask mode** — explored and explained existing code without making changes, keeping investigation separate from edits.
- **Accuracy verification** — cross-checked the README and `steps.md` against the actual `Jenkinsfile` and scripts so the docs always reflect real pipeline behavior.

The result is a faster build loop with deliberate human review at each step — the same way AI is used effectively on real engineering teams.

---

## License

MIT — see [`devops-monitoring-portal/steps.md`](devops-monitoring-portal/steps.md).
