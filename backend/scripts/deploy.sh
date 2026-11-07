#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PROJECT_ID:?Set PROJECT_ID}"
: "${REGION:?Set REGION (e.g. asia-northeast1)}"
: "${STORAGE_BUCKET:?Set private STORAGE_BUCKET name (without gs://)}"
: "${SERVICE_ACCOUNT:?Set dedicated runtime SERVICE_ACCOUNT email}"
: "${CORS_ORIGINS:?Set exact Frontend origins}"
PRAISE_BACKEND="${PRAISE_BACKEND:-fallback}"
if [[ "$PRAISE_BACKEND" == vertex ]]; then
  : "${GEMINI_MODEL:?Set an available Vertex Gemini model ID}"
fi
GEMINI_MODEL="${GEMINI_MODEL:-}"
# Optional: phone notifications (public web push key) and the 19:00 Cloud Scheduler caller.
FIREBASE_VAPID_KEY="${FIREBASE_VAPID_KEY:-}"
SCHEDULER_EMAIL="${SCHEDULER_EMAIL:-}"
SCHEDULER_AUDIENCE="${SCHEDULER_AUDIENCE:-}"
if [[ "$PRAISE_BACKEND" != fallback && "$PRAISE_BACKEND" != vertex ]]; then
  echo "PRAISE_BACKEND must be fallback or vertex" >&2; exit 1
fi
: "${FIREBASE_WEB_API_KEY:?Set Firebase Web API key via environment}"
: "${FIREBASE_AUTH_DOMAIN:?Set Firebase Auth domain}"
: "${FIREBASE_APP_ID:?Set Firebase Web App ID}"
: "${FIREBASE_MESSAGING_SENDER_ID:?Set Firebase Messaging Sender ID}"
command -v gcloud >/dev/null
service="${SERVICE_NAME:-darupoyo-backend}"
repository="${ARTIFACT_REPOSITORY:-darupoyo}"
tag="$(date -u +%Y%m%dT%H%M%SZ)"
image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${repository}/${service}:${tag}"
# Refuse values that would break the gcloud custom separator.
for value in "$PROJECT_ID" "$REGION" "$STORAGE_BUCKET" "$CORS_ORIGINS" "$GEMINI_MODEL" "$FIREBASE_WEB_API_KEY" "$FIREBASE_AUTH_DOMAIN" "$FIREBASE_APP_ID" "$FIREBASE_MESSAGING_SENDER_ID" "$FIREBASE_VAPID_KEY" "$SCHEDULER_EMAIL" "$SCHEDULER_AUDIENCE"; do
  if [[ "$value" == *"|"* ]]; then echo "Environment values must not contain |" >&2; exit 1; fi
done
# Query build status separately; log streaming requires unrelated bucket permissions.
build_id="$(gcloud builds submit --async --format='value(id)' --project "$PROJECT_ID" --tag "$image" .)"
if [[ -z "$build_id" ]]; then echo "Cloud Build did not return an ID" >&2; exit 1; fi
build_status=""
for ((attempt=0; attempt<240; attempt++)); do
  build_status="$(gcloud builds describe "$build_id" --project "$PROJECT_ID" --format='value(status)')"
  case "$build_status" in
    SUCCESS) break ;;
    QUEUED|PENDING|WORKING) sleep 5 ;;
    *) echo "Cloud Build $build_id finished with $build_status" >&2; exit 1 ;;
  esac
done
if [[ "$build_status" != SUCCESS ]]; then echo "Timed out waiting for Cloud Build $build_id" >&2; exit 1; fi
# Public HTTP transport is intentional. Firebase ID tokens protect every data API;
# Cloud Run IAM tokens are not Firebase ID tokens. /healthz is public.
# #125: the Google Weather API key comes from Secret Manager when deploy/config.json names it.
extra=()
if [[ -n "${WEATHER_SECRET:-}" ]]; then extra+=(--update-secrets "GOOGLE_WEATHER_API_KEY=${WEATHER_SECRET}:latest"); fi
gcloud run deploy "$service" --project "$PROJECT_ID" --region "$REGION" \
  --image "$image" --service-account "$SERVICE_ACCOUNT" --allow-unauthenticated \
  --port 8080 --memory 1Gi --cpu 1 --concurrency 4 --timeout 60 \
  --min-instances 0 --max-instances 3 \
  ${extra[@]+"${extra[@]}"} \
  --set-env-vars "^|^APP_ENV=production|AUTH_MODE=firebase|DATA_BACKEND=firestore|PRAISE_BACKEND=${PRAISE_BACKEND}|GOOGLE_CLOUD_PROJECT=${PROJECT_ID}|GOOGLE_CLOUD_LOCATION=global|STORAGE_BUCKET=${STORAGE_BUCKET}|GEMINI_MODEL=${GEMINI_MODEL}|CORS_ORIGINS=${CORS_ORIGINS}|DAY_TIMEZONE=Asia/Tokyo|SYNC_WINDOW_SECONDS=300|FIREBASE_WEB_API_KEY=${FIREBASE_WEB_API_KEY}|FIREBASE_AUTH_DOMAIN=${FIREBASE_AUTH_DOMAIN}|FIREBASE_APP_ID=${FIREBASE_APP_ID}|FIREBASE_MESSAGING_SENDER_ID=${FIREBASE_MESSAGING_SENDER_ID}|FIREBASE_VAPID_KEY=${FIREBASE_VAPID_KEY}|SCHEDULER_EMAIL=${SCHEDULER_EMAIL}|SCHEDULER_AUDIENCE=${SCHEDULER_AUDIENCE}"
