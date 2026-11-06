#!/usr/bin/env bash
# One-time setup so GitHub Actions can run `npm run deploy` when main changes.
# Keyless: GitHub proves who it is with an OIDC token (Workload Identity Federation),
# and only pushes to main of youmi-ngs/darupoyo may act as the deploy account.
# Safe to run again; existing resources are kept.
set -uo pipefail

PROJECT=darupoyo-8ed91
NUMBER=324099635682
REPO=youmi-ngs/darupoyo
POOL=github
PROVIDER=darupoyo
SA_NAME=github-deployer
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
MEMBER="serviceAccount:${SA}"

step() { printf '\n== %s\n' "$1"; }
quiet() { "$@" --format=none 2>&1 | grep -v -e '^Updated IAM policy' -e '^$' || true; }

step "APIs"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com --project "$PROJECT"

step "Deploy account ${SA}"
gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT" \
    --display-name="GitHub Actions deploy (main only)"

step "Deploy permissions (same scope as a human deployer)"
for role in roles/firebase.admin roles/run.admin roles/cloudbuild.builds.editor \
  roles/artifactregistry.writer roles/serviceusage.serviceUsageConsumer roles/logging.viewer; do
  echo "$role"
  quiet gcloud projects add-iam-policy-binding "$PROJECT" --member="$MEMBER" --role="$role" --condition=None
done
# Act as the Cloud Run runtime account and the Cloud Build account.
for account in "ontama-runtime@${PROJECT}.iam.gserviceaccount.com" "${NUMBER}-compute@developer.gserviceaccount.com"; do
  echo "serviceAccountUser on $account"
  quiet gcloud iam service-accounts add-iam-policy-binding "$account" --project "$PROJECT" \
    --member="$MEMBER" --role=roles/iam.serviceAccountUser
done
# Upload build sources.
echo "storage.admin on gs://${PROJECT}_cloudbuild"
quiet gcloud storage buckets add-iam-policy-binding "gs://${PROJECT}_cloudbuild" --member="$MEMBER" --role=roles/storage.admin

step "Workload Identity pool and GitHub provider"
gcloud iam workload-identity-pools describe "$POOL" --location=global --project "$PROJECT" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --location=global --project "$PROJECT" \
    --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers describe "$PROVIDER" --workload-identity-pool="$POOL" \
  --location=global --project "$PROJECT" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --workload-identity-pool="$POOL" \
    --location=global --project "$PROJECT" --display-name="darupoyo main" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository == '${REPO}' && assertion.ref == 'refs/heads/main'"

step "Let only ${REPO} (main) use the deploy account"
quiet gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$PROJECT" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}"

step "Done"
echo "workload_identity_provider: projects/${NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
echo "service_account:            ${SA}"
