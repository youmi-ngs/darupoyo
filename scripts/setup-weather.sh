#!/usr/bin/env bash
# One-time setup for the house weather (#125): Google Maps Platform Weather API.
# Asks for the API key you created, keeps it in Secret Manager (never in GitHub),
# and lets the Backend's runtime account read it. Safe to run again (adds a new version).
set -euo pipefail

PROJECT=darupoyo-8ed91
SECRET=google-weather-api-key
RUNTIME="ontama-runtime@${PROJECT}.iam.gserviceaccount.com"

echo "== APIs"
gcloud services enable weather.googleapis.com secretmanager.googleapis.com --project "$PROJECT"

echo "== API key"
read -rsp "Weather API のキーを貼り付けて Enter（画面には表示されません）: " KEY; echo
KEY="$(printf %s "$KEY" | tr -d '[:space:]')"
# A Google API key is 39 characters starting with AIza; anything else is not stored.
if [[ ! "$KEY" =~ ^AIza[0-9A-Za-z_-]{35}$ ]]; then
  echo "キーの形が違います（AIza で始まる39文字のはず。いまは ${#KEY} 文字）。キーだけをコピーし直してね" >&2; unset KEY; exit 1
fi
if gcloud secrets describe "$SECRET" --project "$PROJECT" >/dev/null 2>&1; then
  printf %s "$KEY" | gcloud secrets versions add "$SECRET" --project "$PROJECT" --data-file=- >/dev/null
else
  printf %s "$KEY" | gcloud secrets create "$SECRET" --project "$PROJECT" --replication-policy=automatic --data-file=- >/dev/null
fi
unset KEY

echo "== Backend may read the key"
gcloud secrets add-iam-policy-binding "$SECRET" --project "$PROJECT" \
  --member="serviceAccount:${RUNTIME}" --role=roles/secretmanager.secretAccessor --format=none

echo "== Check the key works"
VALUE="$(gcloud secrets versions access latest --secret "$SECRET" --project "$PROJECT")"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "https://weather.googleapis.com/v1/currentConditions:lookup?key=${VALUE}&location.latitude=35.68&location.longitude=139.76")"
unset VALUE
echo "Weather API の応答: HTTP ${CODE}（200 なら OK）"
echo "Done: secret ${SECRET} is ready. deploy/config.json の weatherSecret に \"${SECRET}\" を入れると本番で使われます。"
