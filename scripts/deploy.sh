#!/usr/bin/env bash
# scripts/deploy.sh — atomic deploy to the EC2 box.
#
# What it does:
#   1. ssh to EC2, git pull origin master
#   2. backend: install + pm2 restart (env lives in /home/ubuntu/pullup/backend/.env)
#   3. frontend: install + build into a staging dir + smoke test + atomic swap
#   4. keep the previous dist as `dist-prev` for one-command rollback
#
# Why it exists:
#   2026-05-22 a developer-laptop `rsync --delete` overwrote the live dist
#   with a bundle that pointed every API call at http://localhost:3001.
#   This script removes the laptop from the build path and makes the swap
#   atomic so a broken bundle never reaches users.
#
# Usage:
#   scripts/deploy.sh             # deploys current origin/master
#   scripts/deploy.sh --rollback  # swaps dist-prev back into place
#
# Requirements:
#   - SSH alias `pullup-ec2` configured (we already use it elsewhere)
#   - origin/master is what you want to ship (commit + push first)

set -euo pipefail

HOST="pullup-ec2"
REMOTE_ROOT="/home/ubuntu/pullup"
FRONTEND_DIR="$REMOTE_ROOT/frontend"
BACKEND_DIR="$REMOTE_ROOT/backend"

case "${1:-}" in
  --rollback)
    echo "==> Rolling back frontend to previous dist"
    ssh "$HOST" bash <<EOF
set -euo pipefail
cd "$FRONTEND_DIR"
if [[ ! -d dist-prev ]]; then
  echo "ERROR: no dist-prev to roll back to."
  exit 1
fi
rm -rf dist-failed
mv dist dist-failed
mv dist-prev dist
echo "Rolled back. Old (failed) dist preserved as dist-failed."
EOF
    exit 0
    ;;
  "")
    ;;
  *)
    echo "Usage: $0 [--rollback]" >&2
    exit 2
    ;;
esac

echo "==> Pulling latest master on EC2"
ssh "$HOST" bash <<EOF
set -euo pipefail
cd "$REMOTE_ROOT"
# Refuse to deploy if the EC2 working tree has uncommitted backend/frontend src changes.
# (Stale node_modules state is allowed — the audit noted EC2 had \`npm prune\` noise.)
if ! git diff --quiet -- backend/src frontend/src 2>/dev/null; then
  echo "ERROR: EC2 working tree has uncommitted changes under backend/src or frontend/src."
  echo "Resolve manually before re-running deploy.sh."
  exit 1
fi
git fetch origin master
git checkout master
git reset --hard origin/master
echo "EC2 now at: \$(git log --oneline -1)"
EOF

echo
echo "==> Backend: install + reload"
ssh "$HOST" bash <<EOF
set -euo pipefail
cd "$BACKEND_DIR"
if [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund --silent || npm install --no-audit --no-fund --silent
else
  npm install --no-audit --no-fund --silent
fi
pm2 reload pullup-api --update-env
sleep 2
pm2 list | grep pullup-api || true
# Quick health check
if ! curl -fsS -o /dev/null http://127.0.0.1:3001/mcp/health; then
  echo "ERROR: backend health check failed after reload."
  exit 1
fi
echo "Backend OK."
EOF

echo
echo "==> Frontend: install + build into dist-staging + smoke test + atomic swap"
ssh "$HOST" bash <<EOF
set -euo pipefail
cd "$FRONTEND_DIR"

# Install (vite is a devDep, so we need the full install — not --omit=dev).
if [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund --silent || npm install --no-audit --no-fund --silent
else
  npm install --no-audit --no-fund --silent
fi

# Build into a fresh dir so the live dist stays untouched until the swap.
rm -rf dist-staging
npm run build -- --outDir dist-staging 2>&1 | tail -8

# Smoke test: a production bundle must NOT contain localhost references.
# This catches the exact 2026-05-22 incident (and any future variant) at
# deploy time, before the swap.
if grep -qE "(localhost:[0-9]+|127\.0\.0\.1:[0-9]+)" dist-staging/assets/*.js 2>/dev/null; then
  echo "SMOKE TEST FAILED: localhost reference found in bundle:"
  grep -nE "(localhost:[0-9]+|127\.0\.0\.1:[0-9]+)" dist-staging/assets/*.js | head -5
  rm -rf dist-staging
  exit 1
fi

# Bundle must reference api.pullup.se — proves env was actually used.
if ! grep -q "api\.pullup\.se" dist-staging/assets/*.js 2>/dev/null; then
  echo "SMOKE TEST FAILED: api.pullup.se not found in bundle — env wasn't applied?"
  rm -rf dist-staging
  exit 1
fi

# Atomic swap. mv on the same filesystem is a rename — instantaneous.
rm -rf dist-prev
if [[ -d dist ]]; then
  mv dist dist-prev
fi
mv dist-staging dist

echo "Frontend swapped. Previous bundle preserved as dist-prev."
echo "Active bundle:"
ls -1 dist/assets/index-*.js
EOF

echo
echo "==> Post-deploy smoke (over nginx)"
ssh "$HOST" "curl -fsS -k -H 'Host: api.pullup.se' https://127.0.0.1/mcp/health > /dev/null && echo 'api.pullup.se nginx → backend OK' || echo 'WARN: nginx → backend smoke failed'"
ssh "$HOST" "curl -fsS -k -H 'Host: pullup.se' https://127.0.0.1/ -o /dev/null -w 'pullup.se nginx → %{http_code}\n'"

echo
echo "Done. To roll back if something looks wrong: scripts/deploy.sh --rollback"
