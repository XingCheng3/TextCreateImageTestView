#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-/www/wwwroot/Web/TextCreateImage}"

cd "$REPO_DIR"

echo "[deploy-bt] Building frontend..."
npm run build

echo "[deploy-bt] Syncing dist -> $TARGET_DIR"
install -d "$TARGET_DIR"

# Keep panel-managed files while replacing frontend assets.
rsync -av --delete \
  --chown=www:www \
  --exclude='.htaccess' \
  --exclude='.user.ini' \
  --exclude='404.html' \
  dist/ "$TARGET_DIR/"

# Optional SPA fallback file for some panel presets.
if [ ! -f "$TARGET_DIR/404.html" ]; then
  cp "$REPO_DIR/dist/index.html" "$TARGET_DIR/404.html"
  chown www:www "$TARGET_DIR/404.html" || true
fi

echo "[deploy-bt] Done."
