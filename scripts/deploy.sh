#!/usr/bin/env bash
set -euo pipefail

# ─── Pantry App Deploy Script ────────────────────────────────────────
# Usage:
#   First deploy:  ./scripts/deploy.sh          (deploys infra + frontend)
#   Frontend only: ./scripts/deploy.sh --frontend-only
#
# After the first deploy, CDK outputs are cached in scripts/.env.deploy
# so you don't need to look them up again.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.deploy"
FRONTEND_ONLY=false

if [[ "${1:-}" == "--frontend-only" ]]; then
  FRONTEND_ONLY=true
fi

# ─── Step 1: Deploy infrastructure (skip with --frontend-only) ───────
if [[ "$FRONTEND_ONLY" == false ]]; then
  echo "🚀 Deploying CDK stack..."
  cd "$ROOT_DIR/infrastructure"
  npx cdk deploy --require-approval broadening --outputs-file "$SCRIPT_DIR/cdk-outputs.json"
  echo "✅ Infrastructure deployed"
fi

# ─── Step 2: Extract CDK outputs ─────────────────────────────────────
OUTPUTS_FILE="$SCRIPT_DIR/cdk-outputs.json"

if [[ ! -f "$OUTPUTS_FILE" ]]; then
  echo "❌ No cdk-outputs.json found. Run without --frontend-only first."
  exit 1
fi

# Parse outputs (works with the CDK outputs JSON format)
STACK_NAME=$(cat "$OUTPUTS_FILE" | python3 -c "import sys,json; print(list(json.load(sys.stdin).keys())[0])")
API_URL=$(cat "$OUTPUTS_FILE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[list(d.keys())[0]]['ApiUrl'])")
USER_POOL_ID=$(cat "$OUTPUTS_FILE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[list(d.keys())[0]]['UserPoolId'])")
USER_POOL_CLIENT_ID=$(cat "$OUTPUTS_FILE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[list(d.keys())[0]]['UserPoolClientId'])")
WEBSITE_BUCKET=$(cat "$OUTPUTS_FILE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[list(d.keys())[0]]['WebsiteBucketName'])")
DISTRIBUTION_ID=$(cat "$OUTPUTS_FILE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[list(d.keys())[0]]['DistributionId'])")
CLOUDFRONT_URL=$(cat "$OUTPUTS_FILE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[list(d.keys())[0]]['CloudFrontUrl'])")

echo "📦 Using outputs from stack: $STACK_NAME"

# ─── Step 3: Build frontend ──────────────────────────────────────────
echo "🔨 Building frontend..."
cd "$ROOT_DIR/frontend"
VITE_USER_POOL_ID="$USER_POOL_ID" \
VITE_USER_POOL_CLIENT_ID="$USER_POOL_CLIENT_ID" \
VITE_API_URL="$API_URL" \
npm run build
echo "✅ Frontend built"

# ─── Step 4: Upload to S3 ────────────────────────────────────────────
echo "📤 Uploading to S3..."

# Upload hashed assets with long-lived cache (1 year) — filenames change on content change
aws s3 sync "$ROOT_DIR/frontend/build" "s3://$WEBSITE_BUCKET" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html" \
  --exclude "sw.js" \
  --exclude "manifest.json"

# Upload index.html with no-cache — browser must always revalidate
aws s3 cp "$ROOT_DIR/frontend/build/index.html" "s3://$WEBSITE_BUCKET/index.html" \
  --cache-control "no-cache, no-store, must-revalidate"

# Upload sw.js with no-cache — browser checks for updates on every navigation
aws s3 cp "$ROOT_DIR/frontend/build/sw.js" "s3://$WEBSITE_BUCKET/sw.js" \
  --cache-control "no-cache, no-store, must-revalidate"

# Upload manifest.json with short cache
aws s3 cp "$ROOT_DIR/frontend/build/manifest.json" "s3://$WEBSITE_BUCKET/manifest.json" \
  --cache-control "public, max-age=3600"

echo "✅ Uploaded to S3"

# ─── Step 5: Invalidate CloudFront cache ─────────────────────────────
echo "🔄 Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" > /dev/null 2>&1
echo "✅ Cache invalidated"

# ─── Done ─────────────────────────────────────────────────────────────
echo ""
echo "🎉 Deploy complete!"
echo "   $CLOUDFRONT_URL"
