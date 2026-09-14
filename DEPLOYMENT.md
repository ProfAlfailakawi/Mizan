# MIZAN Production Deployment

## Production target

The production target is Google Cloud project `mizan-f2ce3`, Cloud Run service `mizan`, region `me-central1`.
`Dockerfile` is the production image contract and `cloudbuild.yaml` is the production build/deploy contract.

## Deployment ownership

Production deployment is owned by this repository. It does **not** depend on an out-of-band Cloud Run / Cloud Build repository trigger.

The path is:

1. `.github/workflows/ci.yml` verifies a push to `main`, including building the actual Docker image used by Cloud Run.
2. `.github/workflows/deploy-cloud-run.yml` starts only after that `main` push finishes successfully.
3. GitHub authenticates to Google Cloud with OIDC Workload Identity Federation; no long-lived service-account JSON key is stored in GitHub.
4. The workflow checks out the exact SHA that passed CI and runs `gcloud builds submit --config=cloudbuild.yaml` with that SHA as `COMMIT_SHA`.
5. Cloud Build builds and pushes the image, deploys Firestore rules, then deploys Cloud Run.
6. Cloud Run is labelled with `mizan-git-sha=<verified commit>` and the GitHub workflow verifies the ready revision and `/api/health` before declaring deployment successful.

A failed CI run never deploys. A pull request never deploys. A successful build that does not become the ready Cloud Run revision is reported as a deployment failure rather than a false green.

## One-time Google Cloud / GitHub bootstrap

After the deployment workflow lands on `main`, run this once from Google Cloud Shell with an identity allowed to manage IAM:

```bash
bash scripts/setup-github-cloudrun-wif.sh
```

The script is idempotent. It:

- enables the required APIs;
- ensures the Docker Artifact Registry repository and private source-staging bucket exist;
- creates the keyless GitHub deployer service account;
- creates/updates a GitHub OIDC Workload Identity provider restricted to `ProfAlfailakawi/Mizan` on `refs/heads/main`;
- discovers the **actual** Cloud Build default service account instead of assuming its name;
- grants the Cloud Build identity the Cloud Run, Artifact Registry, Firestore Rules, logging and Secret Manager permissions required by `cloudbuild.yaml`;
- grants `iam.serviceAccountUser` only on the Cloud Run runtime service account;
- checks that the required R2 secrets exist and grants the runtime identity access to them;
- configures the repository variables automatically when GitHub CLI is authenticated, or prints their exact values otherwise.

Required GitHub Actions repository variables:

```text
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
```

These are identifiers, not secrets.

Google IAM / Workload Identity changes can take a few minutes to propagate. After bootstrap, use GitHub Actions -> `نشر ميزان إلى Cloud Run` -> Run workflow once, or push a new verified commit to `main`.

## Production invariants

`cloudbuild.yaml` deliberately keeps `--max-instances=1` while MIZAN still uses shared file-backed state. It also preserves Secret Manager references and the existing private R2 contract. Do not replace production signing/encryption secrets during normal deployments.

The canonical operational state and tenant/domain runbook remain in `docs/OPERATIONS.md`.
