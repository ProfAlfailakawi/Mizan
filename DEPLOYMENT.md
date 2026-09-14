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
4. The privileged deployment workflow checks out trusted `refs/heads/main` only, then verifies that its local HEAD exactly matches the SHA reported by the successful CI run. It never checks out a `workflow_run`-supplied SHA directly.
5. The verified local SHA is submitted to Cloud Build using the dedicated `mizan-cloud-build@mizan-f2ce3.iam.gserviceaccount.com` build identity.
6. Cloud Build builds and pushes the image, deploys Firestore rules, then deploys Cloud Run.
7. Cloud Run is labelled with `mizan-git-sha=<verified commit>` and the GitHub workflow verifies the newest created revision is the ready revision, the SHA matches, and `/api/health` returns success.

A failed CI run never deploys. A pull request never deploys. There is no manual deployment bypass around the green-main gate. A successful build that does not become the ready Cloud Run revision is reported as a deployment failure rather than a false green.

## One-time Google Cloud / GitHub bootstrap

After the deployment workflow lands on `main`, run this once from Google Cloud Shell with an identity allowed to manage IAM:

```bash
bash scripts/setup-github-cloudrun-wif.sh
```

The script is idempotent. It:

- enables the required IAM, STS, Cloud Build, Cloud Run, Artifact Registry, Firebase/Firestore, Storage and Secret Manager APIs;
- ensures the Docker Artifact Registry repository and private source-staging bucket exist;
- creates a keyless GitHub deployer service account and a separate least-privilege Cloud Build execution service account;
- creates/updates a GitHub OIDC Workload Identity provider restricted to the immutable GitHub repository/owner IDs and `refs/heads/main`;
- lets the GitHub deployer submit builds and act as the dedicated build identity, but does not let GitHub deploy Cloud Run directly;
- grants the dedicated build identity only the build/deploy roles needed for Artifact Registry, Firestore Rules, Cloud Run, logging and service usage;
- grants that build identity `iam.serviceAccountUser` only on the Cloud Run runtime service account;
- checks that the required R2 secrets exist and grants secret payload access to the Cloud Run runtime identity, not the build identity;
- configures the repository variables automatically when GitHub CLI is authenticated, or prints their exact values otherwise.

Required GitHub Actions repository variables:

```text
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
```

These are identifiers, not secrets.

Google IAM / Workload Identity changes can take a few minutes to propagate. After bootstrap, re-run the latest CI run whose original event was a push to `main`, or push a new commit to `main`; when that push CI succeeds, the deployment workflow starts automatically.

## Production invariants

`cloudbuild.yaml` deliberately keeps `--max-instances=1` while MIZAN still uses shared file-backed state. It also preserves Secret Manager references and the existing private R2 contract. Do not replace production signing/encryption secrets during normal deployments.

The canonical operational state and tenant/domain runbook remain in `docs/OPERATIONS.md`.
