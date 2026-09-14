#!/usr/bin/env bash
set -euo pipefail

# One-time production bootstrap for GitHub -> Cloud Build -> Cloud Run.
# Run from Google Cloud Shell as a project owner (or an identity allowed to manage IAM).
# No service-account JSON key is created or stored.

PROJECT_ID="${PROJECT_ID:-mizan-f2ce3}"
REGION="${REGION:-me-central1}"
SERVICE_NAME="${SERVICE_NAME:-mizan}"
REPOSITORY="${GITHUB_REPOSITORY:-ProfAlfailakawi/Mizan}"
REPOSITORY_ID="${GITHUB_REPOSITORY_ID:-1353999541}"
REPOSITORY_OWNER_ID="${GITHUB_REPOSITORY_OWNER_ID:-276768958}"
POOL_ID="${POOL_ID:-mizan-github}"
PROVIDER_ID="${PROVIDER_ID:-github-actions}"
DEPLOY_SA_NAME="${DEPLOY_SA_NAME:-mizan-github-deployer}"
BUILD_SA_NAME="${BUILD_SA_NAME:-mizan-cloud-build}"
ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-cloud-run-source-deploy}"
SOURCE_BUCKET="${SOURCE_BUCKET:-${PROJECT_ID}-github-deploy-source}"

need(){ command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }; }
need gcloud

echo "Configuring production deployment for ${REPOSITORY} (${REPOSITORY_ID}) -> ${PROJECT_ID}/${REGION}/${SERVICE_NAME}"
gcloud config set project "$PROJECT_ID" --quiet

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
if [[ ! "$PROJECT_NUMBER" =~ ^[0-9]+$ ]]; then
  echo "Could not resolve Google Cloud project number for $PROJECT_ID" >&2
  exit 1
fi
if [[ ! "$REPOSITORY_ID" =~ ^[0-9]+$ || ! "$REPOSITORY_OWNER_ID" =~ ^[0-9]+$ ]]; then
  echo 'GitHub repository/owner IDs must be immutable numeric IDs.' >&2
  exit 1
fi
DEPLOY_SA_EMAIL="${DEPLOY_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_SA_EMAIL="${BUILD_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo 'Enabling required Google Cloud APIs...'
gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  firebaserules.googleapis.com \
  firestore.googleapis.com \
  firebase.googleapis.com \
  storage.googleapis.com \
  serviceusage.googleapis.com \
  --project="$PROJECT_ID" --quiet

echo 'Ensuring Artifact Registry repository exists...'
if ! gcloud artifacts repositories describe "$ARTIFACT_REPOSITORY" --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$ARTIFACT_REPOSITORY" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --repository-format=docker \
    --description='MIZAN production Cloud Run images' \
    --quiet
fi
ARTIFACT_FORMAT="$(gcloud artifacts repositories describe "$ARTIFACT_REPOSITORY" --project="$PROJECT_ID" --location="$REGION" --format='value(format)')"
if [[ "$ARTIFACT_FORMAT" != 'DOCKER' ]]; then
  echo "Artifact Registry repository ${ARTIFACT_REPOSITORY} exists but is not a Docker repository." >&2
  exit 1
fi

echo 'Ensuring private source-staging bucket exists...'
if ! gcloud storage buckets describe "gs://${SOURCE_BUCKET}" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${SOURCE_BUCKET}" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --uniform-bucket-level-access \
    --public-access-prevention \
    --quiet
else
  gcloud storage buckets update "gs://${SOURCE_BUCKET}" \
    --uniform-bucket-level-access \
    --public-access-prevention \
    --quiet >/dev/null
fi

echo 'Ensuring GitHub deployment service account exists...'
if ! gcloud iam service-accounts describe "$DEPLOY_SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$DEPLOY_SA_NAME" \
    --project="$PROJECT_ID" \
    --display-name='MIZAN GitHub production deployer' \
    --description='OIDC-only identity that submits verified main commits to Cloud Build' \
    --quiet
fi

echo 'Ensuring dedicated Cloud Build service account exists...'
if ! gcloud iam service-accounts describe "$BUILD_SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$BUILD_SA_NAME" \
    --project="$PROJECT_ID" \
    --display-name='MIZAN production Cloud Build' \
    --description='Least-privilege build identity for MIZAN production deployment' \
    --quiet
fi

echo 'Ensuring Workload Identity Pool exists...'
if ! gcloud iam workload-identity-pools describe "$POOL_ID" --project="$PROJECT_ID" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --display-name='MIZAN GitHub' \
    --description='GitHub Actions identities for MIZAN production deployment' \
    --quiet
fi

# GitHub names are mutable. Bind Google authority to immutable numeric IDs so a repository
# rename/transfer cannot accidentally hand deployment authority to a reused repository name.
ATTRIBUTE_MAPPING='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref'
ATTRIBUTE_CONDITION="assertion.repository_id=='${REPOSITORY_ID}' && assertion.repository_owner_id=='${REPOSITORY_OWNER_ID}' && assertion.ref=='refs/heads/main'"

echo 'Ensuring GitHub OIDC provider exists and is restricted to this repository ID on main...'
if gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --issuer-uri='https://token.actions.githubusercontent.com' \
    --attribute-mapping="$ATTRIBUTE_MAPPING" \
    --attribute-condition="$ATTRIBUTE_CONDITION" \
    --quiet
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --display-name='MIZAN GitHub Actions' \
    --issuer-uri='https://token.actions.githubusercontent.com' \
    --attribute-mapping="$ATTRIBUTE_MAPPING" \
    --attribute-condition="$ATTRIBUTE_CONDITION" \
    --quiet
fi

POOL_NAME="$(gcloud iam workload-identity-pools describe "$POOL_ID" --project="$PROJECT_ID" --location=global --format='value(name)')"
PROVIDER_NAME="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" --format='value(name)')"
WIF_MEMBER="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository_id/${REPOSITORY_ID}"

echo 'Binding immutable GitHub repository identity to the deployer service account...'
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role='roles/iam.workloadIdentityUser' \
  --member="$WIF_MEMBER" \
  --quiet >/dev/null

# GitHub may submit builds and stage source, but may not deploy Cloud Run directly.
for role in roles/cloudbuild.builds.editor roles/serviceusage.serviceUsageConsumer roles/storage.bucketViewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

gcloud storage buckets add-iam-policy-binding "gs://${SOURCE_BUCKET}" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role='roles/storage.objectAdmin' \
  --quiet >/dev/null

# Submitting a build with a user-specified identity requires iam.serviceAccounts.actAs.
gcloud iam service-accounts add-iam-policy-binding "$BUILD_SA_EMAIL" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role='roles/iam.serviceAccountUser' \
  --quiet >/dev/null

echo "Dedicated Cloud Build service account: $BUILD_SA_EMAIL"
for role in \
  roles/cloudbuild.builds.builder \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/firebaserules.admin \
  roles/logging.logWriter \
  roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${BUILD_SA_EMAIL}" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

gcloud storage buckets add-iam-policy-binding "gs://${SOURCE_BUCKET}" \
  --member="serviceAccount:${BUILD_SA_EMAIL}" \
  --role='roles/storage.objectViewer' \
  --quiet >/dev/null

# Cloud Run uses the existing service identity if the service is already deployed;
# otherwise it uses the project's default Compute Engine service account.
RUNTIME_SA="$(gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" --platform=managed --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)"
if [[ -z "$RUNTIME_SA" ]]; then
  RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi

echo "Cloud Run runtime service account: $RUNTIME_SA"
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA_EMAIL}" \
  --role='roles/iam.serviceAccountUser' \
  --quiet >/dev/null

# Deployment must fail early if the existing production secrets disappeared. The build identity
# does not receive secret payload access; only the Cloud Run runtime identity can read them.
for secret in R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
  if ! gcloud secrets describe "$secret" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "Required production secret is missing: $secret" >&2
    exit 1
  fi
  gcloud secrets add-iam-policy-binding "$secret" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role='roles/secretmanager.secretAccessor' \
    --quiet >/dev/null
done

cat <<EOF

Google Cloud side is configured.
Workload Identity Provider:
  ${PROVIDER_NAME}
GitHub deployment service account:
  ${DEPLOY_SA_EMAIL}
Cloud Build execution service account:
  ${BUILD_SA_EMAIL}

EOF

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo 'Setting GitHub repository variables...'
  gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --repo "$REPOSITORY" --body "$PROVIDER_NAME"
  gh variable set GCP_DEPLOY_SERVICE_ACCOUNT --repo "$REPOSITORY" --body "$DEPLOY_SA_EMAIL"
  echo 'GitHub repository variables set.'
else
  cat <<EOF
Set these two GitHub repository variables (Settings -> Secrets and variables -> Actions -> Variables):
  GCP_WORKLOAD_IDENTITY_PROVIDER=${PROVIDER_NAME}
  GCP_DEPLOY_SERVICE_ACCOUNT=${DEPLOY_SA_EMAIL}

Or authenticate GitHub CLI with 'gh auth login' and rerun this script; it will set them automatically.
EOF
fi

cat <<'EOF'

Important: Google IAM / Workload Identity changes can take a few minutes to propagate.
After propagation, open GitHub Actions and run "نشر ميزان إلى Cloud Run" manually once,
or push a verified commit to main. The workflow itself verifies the deployed SHA.
EOF
