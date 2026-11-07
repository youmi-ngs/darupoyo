#!/usr/bin/env bash
# One-time setup for phone notifications (#58). Safe to run again.
# - The Backend's runtime account may send Firebase Cloud Messaging pushes.
# - Cloud Scheduler calls the Backend at 19:00 (Asia/Tokyo) with a Google-signed token.
set -uo pipefail

PROJECT=darupoyo-8ed91
NUMBER=324099635682
REGION=asia-northeast1
SERVICE=ontama-backend
RUNTIME="ontama-runtime@${PROJECT}.iam.gserviceaccount.com"
CALLER_NAME=darupoyo-scheduler
CALLER="${CALLER_NAME}@${PROJECT}.iam.gserviceaccount.com"
AUDIENCE=darupoyo-evening-nudge   # must match deploy/config.json schedulerAudience
JOB=darupoyo-evening-nudge

step() { printf '\n== %s\n' "$1"; }

step "APIs"
gcloud services enable fcm.googleapis.com cloudscheduler.googleapis.com --project "$PROJECT"

step "Backend may send pushes"
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${RUNTIME}" \
  --role=roles/firebasecloudmessaging.admin --condition=None --format=none

step "Scheduler caller account ${CALLER}"
gcloud iam service-accounts describe "$CALLER" --project "$PROJECT" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$CALLER_NAME" --project "$PROJECT" --display-name="19:00 nudge caller"
# Let Cloud Scheduler sign tokens as that account.
gcloud iam service-accounts add-iam-policy-binding "$CALLER" --project "$PROJECT" \
  --member="serviceAccount:service-${NUMBER}@gcp-sa-cloudscheduler.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountTokenCreator --format=none

step "Daily 19:00 job"
URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')/api/tasks/evening"
if gcloud scheduler jobs describe "$JOB" --location "$REGION" --project "$PROJECT" >/dev/null 2>&1; then
  verb=update
else
  verb=create
fi
gcloud scheduler jobs "$verb" http "$JOB" --location "$REGION" --project "$PROJECT" \
  --schedule="0 19 * * *" --time-zone="Asia/Tokyo" --uri="$URL" --http-method=POST \
  --oidc-service-account-email="$CALLER" --oidc-token-audience="$AUDIENCE" \
  --attempt-deadline=120s --description="だるぽよ: 19時にまだ家事をしていない人へやさしく声をかける"

step "Done"
echo "Job: $JOB → $URL (every day 19:00 Asia/Tokyo)"
