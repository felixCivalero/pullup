#!/usr/bin/env bash
set -euo pipefail

SSH_KEY="$HOME/.ssh/vpn"
HOST="root@206.189.99.150"
TARGET="/var/www/pullup/frontend/dist"

cd frontend
npm ci
npm run build
cd ..

rsync -avz --delete -e "ssh -i ${SSH_KEY}" frontend/dist/ "${HOST}:${TARGET}/"

echo "✅ Frontend deployed to ${HOST}:${TARGET}"

