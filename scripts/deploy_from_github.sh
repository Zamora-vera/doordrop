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
# The app container runs as UID/GID 1000 (node); keep persistent marketplace uploads writable.
install -d -o 1000 -g 1000 -m 0755 "$APP_DIR/public/uploads/marketplace"

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
  # Git's bundle parser can treat a literal commit hash as an empty revision
  # in this worktree; HEAD is the same verified production commit and keeps
  # the pre-deploy backup non-empty.
  git bundle create "$BACKUP_ROOT/doordrop_${CURRENT_SHA:0:12}_$(date -u +%Y%m%dT%H%M%SZ).bundle" HEAD >/dev/null
  git merge --ff-only --quiet "origin/$BRANCH"
  log "Código actualizado a ${TARGET_SHA:0:12}."
elif [[ "$DEPLOYED_SHA" == "$TARGET_SHA" ]]; then
  exit 0
fi

mkdir -p "$BACKUP_ROOT/runtime"
tar -czf "$BACKUP_ROOT/runtime/doordrop_runtime_$(date -u +%Y%m%dT%H%M%SZ).tar.gz" --ignore-failed-read server.cjs index.html assets 2>/dev/null || true

if ! docker exec "$CONTAINER" node -e "require('dotenv').config({path:'/app/.env'}); const mysql=require('mysql2/promise'); async function main(){const c=await mysql.createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT||3306),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE}); await c.query('ALTER TABLE marketplace_seller_profiles ADD COLUMN IF NOT EXISTS terms_version VARCHAR(32) NULL AFTER terms_accepted_at, ADD COLUMN IF NOT EXISTS terms_language VARCHAR(5) NULL AFTER terms_version'); await c.query('CREATE TABLE IF NOT EXISTS omnichannel_terms_acceptances (user_id CHAR(36) NOT NULL, terms_version VARCHAR(32) NOT NULL, terms_language VARCHAR(5) NOT NULL, accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'); await c.query('CREATE TABLE IF NOT EXISTS shipping_terms_acceptances (user_id CHAR(36) NOT NULL, terms_version VARCHAR(32) NOT NULL, terms_language VARCHAR(5) NOT NULL, accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'); await c.query('CREATE TABLE IF NOT EXISTS global_terms_acceptances (user_id CHAR(36) NOT NULL, terms_version VARCHAR(32) NOT NULL, terms_language VARCHAR(5) NOT NULL, accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'); await c.end()} main().catch(error=>{console.error(error.message); process.exit(1)})"; then
  log "Migración de términos del Marketplace fallida; no se reinició el servicio."
  exit 1
fi

if ! docker exec "$CONTAINER" sh -lc 'PUPPETEER_CACHE_DIR=/app/.cache/puppeteer npm ci --include=dev'; then
  log "Instalación de dependencias fallida; no se reinició el servicio y se reintentará en la próxima ejecución."
  exit 1
fi
if ! docker exec "$CONTAINER" sh -lc 'PUPPETEER_CACHE_DIR=/app/.cache/puppeteer node node_modules/puppeteer/install.mjs'; then
  log "Instalación del navegador de WhatsApp Web fallida; no se reinició el servicio."
  exit 1
fi

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
