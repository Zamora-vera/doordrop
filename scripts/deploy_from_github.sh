#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/www/wwwroot/doordrop.lat"
CONTAINER="ship24go-doordrop"
BRANCH="main"
LOCK_FILE="/var/lock/doordrop-deploy.lock"
SUCCESS_MARKER="/var/lib/doordrop/deployed_sha"
BACKUP_ROOT="/root/doordrop-private-backups"

exec 9>"$LOCK_FILE"
flock -n 9 || exit 0
cd "$APP_DIR"
mkdir -p "$(dirname "$SUCCESS_MARKER")"

log() { printf '[%s] [DoorDrop-Deploy] %s\n' "$(date -u +%FT%TZ)" "$*"; }

if [[ "$(git branch --show-current)" != "$BRANCH" ]]; then
  log "Omitido: la rama activa no es $BRANCH."
  exit 1
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  log "Omitido: existen cambios rastreados sin confirmar."
  exit 1
fi

git fetch --quiet origin "$BRANCH"
CURRENT_SHA="$(git rev-parse HEAD)"
TARGET_SHA="$(git rev-parse "origin/$BRANCH")"
DEPLOYED_SHA="$(test -f "$SUCCESS_MARKER" && tr -d '\r\n' < "$SUCCESS_MARKER" || true)"

if [[ "$CURRENT_SHA" != "$TARGET_SHA" ]]; then
  if ! git merge-base --is-ancestor "$CURRENT_SHA" "$TARGET_SHA"; then
    log "Omitido: origin/$BRANCH no es avance rápido desde producción."
    exit 1
  fi
  mkdir -p "$BACKUP_ROOT"
  git bundle create "$BACKUP_ROOT/doordrop_${CURRENT_SHA:0:12}_$(date -u +%Y%m%dT%H%M%SZ).bundle" "$CURRENT_SHA" >/dev/null
  git merge --ff-only --quiet "origin/$BRANCH"
  log "Código actualizado a ${TARGET_SHA:0:12}."
elif [[ "$DEPLOYED_SHA" == "$TARGET_SHA" ]]; then
  exit 0
fi

mkdir -p "$BACKUP_ROOT/runtime"
tar -czf "$BACKUP_ROOT/runtime/doordrop_runtime_$(date -u +%Y%m%dT%H%M%SZ).tar.gz" --ignore-failed-read server.cjs index.html assets 2>/dev/null || true

if ! docker exec "$CONTAINER" npm run build; then
  log "Build fallido; no se reinició el servicio y se reintentará en la próxima ejecución."
  exit 1
fi

docker restart "$CONTAINER" >/dev/null
for attempt in 1 2 3 4 5 6; do
  if curl --fail --silent --show-error --max-time 10 https://doordrop.lat/api/version >/dev/null; then
    printf '%s\n' "$TARGET_SHA" > "$SUCCESS_MARKER"
    log "Despliegue ${TARGET_SHA:0:12} verificado en producción."
    exit 0
  fi
  sleep 5
done

log "El servicio reinició, pero la verificación pública no respondió correctamente."
exit 1
