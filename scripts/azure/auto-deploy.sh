#!/usr/bin/env bash
# Deploy automático no Azure: roda a cada 2 min (farefoto-deploy.timer).
# Se o GitHub (master) tem commit novo: build numa cópia; só troca o site se o build passar.
# Log: /home/fare/deploy.log   Forçar: FORCE=1 ~/auto-deploy.sh
set -euo pipefail
exec 9>/tmp/farefoto-deploy.lock
flock -n 9 || exit 0  # já tem um deploy rodando

REPO=/home/fare/repo
APP=/srv/fare/app
log() { echo "$(date '+%F %T') $*" >> /home/fare/deploy.log; }

cd "$REPO"
git fetch -q origin master
NEW=$(git rev-parse origin/master)
OLD=$(cat /home/fare/deployed-commit 2>/dev/null || echo none)
[ "$NEW" = "$OLD" ] && [ -z "${FORCE:-}" ] && exit 0

log "deploy $OLD -> $NEW ($(git log -1 --format=%s origin/master))"
LOCK_BEFORE=$(git rev-parse HEAD:package-lock.json 2>/dev/null || echo none)
git reset -q --hard origin/master
if [ "$(git rev-parse HEAD:package-lock.json)" != "$LOCK_BEFORE" ] || [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund --loglevel=error >> /home/fare/deploy.log 2>&1
fi
if ! FARE_FULL_SITE=1 NEXT_TELEMETRY_DISABLED=1 npx next build >> /home/fare/deploy.log 2>&1; then
  log "BUILD FALHOU: site continua na versão $OLD"
  exit 1
fi
sudo rsync -a --delete --exclude data --exclude .env.local .next/standalone/ "$APP/"
sudo rsync -a --delete .next/static/ "$APP/.next/static/"
sudo rsync -a --delete public/ "$APP/public/"
sudo ln -sfn /srv/fare/data "$APP/data"
sudo ln -sfn /srv/fare/.env.local "$APP/.env.local"
sudo chown -R farefoto:farefoto "$APP"
sudo systemctl restart farefoto
sleep 8
CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)
echo "$NEW" > /home/fare/deployed-commit
log "ok: site no ar ($CODE), build $(cat .next/BUILD_ID)"
