#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${WEB_DIR:-$ROOT_DIR/apps/desktop/web}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org}"

if [[ ! -f "$WEB_DIR/package.json" || ! -f "$WEB_DIR/package-lock.json" ]]; then
  echo "FAIL: 前端依赖安装需要 package.json 和 package-lock.json：$WEB_DIR"
  exit 1
fi

echo "frontend_web_dir=$WEB_DIR"
echo "npm_registry=$NPM_REGISTRY"

npm ci --prefix "$WEB_DIR" \
  --no-audit \
  --no-fund \
  --registry="$NPM_REGISTRY" \
  --replace-registry-host=always \
  --fetch-retries=5 \
  --fetch-retry-mintimeout=20000 \
  --fetch-retry-maxtimeout=120000
