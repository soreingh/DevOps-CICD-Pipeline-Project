# DevOps-CICD-Pipeline-Project

Local DevSecOps CI/CD Pipeline with Jenkins, Docker, Trivy, SonarQube, Kubernetes, Prometheus, and Grafana.

## Repository layout

- **`devops-monitoring-portal/`** — Node.js monitoring demo app (Express, Docker, Kubernetes manifests)
- **Pipeline definition:** [`devops-monitoring-portal/Jenkinsfile`](devops-monitoring-portal/Jenkinsfile)

## Jenkins setup

Create a **Pipeline** job with **Pipeline script from SCM** and set **Script Path** to:

```text
devops-monitoring-portal/Jenkinsfile
```

Full prerequisites, stage list, and troubleshooting notes are in [`devops-monitoring-portal/README.md`](devops-monitoring-portal/README.md#jenkins-pipeline).

After a successful pipeline run, access the app at [http://localhost:30080](http://localhost:30080).
