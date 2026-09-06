#!/usr/bin/env bash
# Copies the three GOOGLE_* values from .env.local into Vercel production.
# Run it once from the repo root: bash scripts/push-google-env.sh
# Values are read from the file and piped straight to Vercel; nothing is printed.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo ".env.local not found"; exit 1; }
for k in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REFRESH_TOKEN; do
  v=$(grep "^$k=" .env.local | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" | tr -d '\r')
  if [ -z "$v" ]; then echo "$k is empty in .env.local, skipped"; continue; fi
  npx --yes vercel env rm "$k" production --yes >/dev/null 2>&1 || true
  printf '%s' "$v" | npx --yes vercel env add "$k" production --sensitive >/dev/null 2>&1 && echo "$k: set" || echo "$k: failed"
done
echo "Now redeploy: git commit --allow-empty -m 'redeploy' && git push   (or press Redeploy in Vercel)"
