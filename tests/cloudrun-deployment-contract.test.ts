import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(path,'utf8');

test('production deployment is repository-owned and gated by green main CI',()=>{
  const deploy=read('.github/workflows/deploy-cloud-run.yml');
  const ci=read('.github/workflows/ci.yml');

  assert.match(deploy,/workflow_run:/);
  assert.match(deploy,/workflow_run\.event == 'push'/);
  assert.match(deploy,/workflow_run\.conclusion == 'success'/);
  assert.match(deploy,/workflow_run\.head_branch == 'main'/);
  assert.match(deploy,/id-token:\s*write/);
  assert.match(deploy,/google-github-actions\/auth@v3/);
  assert.match(deploy,/google-github-actions\/setup-gcloud@v3/);
  assert.match(deploy,/gcloud builds submit/);
  assert.match(deploy,/--config=cloudbuild\.yaml/);
  assert.match(deploy,/COMMIT_SHA=\$VERIFIED_SHA/);
  assert.match(deploy,/GCP_WORKLOAD_IDENTITY_PROVIDER/);
  assert.match(deploy,/GCP_DEPLOY_SERVICE_ACCOUNT/);
  assert.match(deploy,/metadata\.labels\.mizan-git-sha/);
  assert.match(deploy,/\/api\/health/);

  // A green TypeScript/Vite build is not enough: CI must build the exact Docker contract Cloud Run uses.
  assert.match(ci,/docker build --tag "mizan-ci:\$\{GITHUB_SHA\}" \./);
});

test('cloudbuild deploys a traceable single-writer production revision',()=>{
  const cloudbuild=read('cloudbuild.yaml');

  assert.match(cloudbuild,/cloud-run-source-deploy\/mizan:\$COMMIT_SHA/);
  assert.match(cloudbuild,/'run'\s*,?\n\s*- 'deploy'/);
  assert.match(cloudbuild,/- 'mizan'/);
  assert.match(cloudbuild,/- '--region'\s*\n\s*- 'me-central1'/);
  assert.match(cloudbuild,/- '--max-instances'\s*\n\s*- '1'/);
  assert.match(cloudbuild,/- '--update-labels'\s*\n\s*- 'mizan-git-sha=\$COMMIT_SHA'/);
  assert.match(cloudbuild,/firebase-tools@15\.30\.0 deploy --only firestore:rules/);
  assert.match(cloudbuild,/R2_ACCESS_KEY_ID=R2_ACCESS_KEY_ID:latest/);
  assert.match(cloudbuild,/R2_SECRET_ACCESS_KEY=R2_SECRET_ACCESS_KEY:latest/);
});

test('bootstrap uses keyless GitHub OIDC and discovers Cloud Build identity',()=>{
  const bootstrap=read('scripts/setup-github-cloudrun-wif.sh');

  assert.match(bootstrap,/token\.actions\.githubusercontent\.com/);
  assert.match(bootstrap,/workload-identity-pools providers/);
  assert.match(bootstrap,/assertion\.repository/);
  assert.match(bootstrap,/assertion\.ref=='refs\/heads\/main'/);
  assert.match(bootstrap,/gcloud builds get-default-service-account/);
  assert.match(bootstrap,/roles\/firebaserules\.admin/);
  assert.match(bootstrap,/roles\/run\.admin/);
  assert.match(bootstrap,/roles\/artifactregistry\.writer/);
  assert.match(bootstrap,/roles\/iam\.serviceAccountUser/);
  assert.doesNotMatch(bootstrap,/gcloud iam service-accounts keys create/);
  assert.doesNotMatch(bootstrap,/credentials_json/);
});

test('deployment documentation no longer claims production is not deployed',()=>{
  const doc=read('DEPLOYMENT.md');
  assert.doesNotMatch(doc,/current package is not deployed/i);
  assert.match(doc,/setup-github-cloudrun-wif\.sh/);
  assert.match(doc,/deploy-cloud-run\.yml/);
});
