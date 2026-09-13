#!/usr/bin/env bash
set -euo pipefail

APP="/www/wwwroot/ship24go.com"
DIAG="$APP/diagnostico"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP="$APP/backups/backup_before_easypost_prod_$STAMP"
OUT="$DIAG/SHIP24GO_EASYPOST_PRODUCCION_V1_4_33_$STAMP.md"

mkdir -p "$DIAG" "$BACKUP"
cd "$APP"

echo "Pega la EasyPost Production API Key. No se mostrará en pantalla:"
read -s EASYPOST_KEY
echo ""

EASYPOST_KEY="$(printf '%s' "$EASYPOST_KEY" | tr -d '\r\n ')"

if [ -z "$EASYPOST_KEY" ]; then
  echo "No se recibió la clave."
  exit 1
fi

if [[ "$EASYPOST_KEY" != EZAK* ]]; then
  echo "La clave no parece ser de producción EasyPost. Revisa que sea Production API Key."
  exit 1
fi

cp .env "$BACKUP/.env_before_easypost_prod" 2>/dev/null || true
touch .env
chmod 600 .env 2>/dev/null || true

export EASYPOST_KEY

python3 - <<'PY'
import os
from pathlib import Path

env_path = Path(".env")
text = env_path.read_text() if env_path.exists() else ""
lines = text.splitlines()

updates = {
    "EASYPOST_ENABLED": "true",
    "EASYPOST_ENV": "production",
    "EASYPOST_MODE": "production",
    "EASYPOST_SANDBOX": "false",
    "EASYPOST_API_URL": "https://api.easypost.com/v2",
    "EASYPOST_BASE_URL": "https://api.easypost.com/v2",
    "EASYPOST_WEBHOOK_URL": "https://ship24go.com/api/webhooks/easypost",
    "EASYPOST_WEBHOOK_ENABLED": "true",
    "EASYPOST_API_KEY": os.environ["EASYPOST_KEY"],
    "EASYPOST_PRODUCTION_API_KEY": os.environ["EASYPOST_KEY"],
    "EASYPOST_PROD_API_KEY": os.environ["EASYPOST_KEY"],
}

seen = set()
new_lines = []

for line in lines:
    if "=" in line and not line.strip().startswith("#"):
        key = line.split("=", 1)[0].strip()
        if key in updates:
            new_lines.append(f"{key}={updates[key]}")
            seen.add(key)
        else:
            new_lines.append(line)
    else:
        new_lines.append(line)

if new_lines and new_lines[-1].strip():
    new_lines.append("")

for key, value in updates.items():
    if key not in seen:
        new_lines.append(f"{key}={value}")

env_path.write_text("\n".join(new_lines) + "\n")
PY

TEST_USER_JSON="$DIAG/easypost_user_check_$STAMP.json"
TEST_WEBHOOKS_JSON="$DIAG/easypost_webhooks_check_$STAMP.json"

USER_HTTP="$(curl -sS -o "$TEST_USER_JSON" -w "%{http_code}" -u "$EASYPOST_KEY:" https://api.easypost.com/v2/users || true)"
WEBHOOK_HTTP="$(curl -sS -o "$TEST_WEBHOOKS_JSON" -w "%{http_code}" -u "$EASYPOST_KEY:" https://api.easypost.com/v2/webhooks || true)"

WEBHOOK_FOUND="no"
if grep -q "https://ship24go.com/api/webhooks/easypost" "$TEST_WEBHOOKS_JSON" 2>/dev/null; then
  WEBHOOK_FOUND="yes"
fi

npm install --no-audit --no-fund
npm run build

pm2 restart ship24go 2>/dev/null || pm2 restart all 2>/dev/null || true

{
  echo "# Ship24Go V1.4.33 — EasyPost producción"
  echo ""
  echo "Fecha: $(date)"
  echo ""
  echo "## Estado"
  echo ""
  echo "- EasyPost producción activado en configuración del servidor."
  echo "- Modo EasyPost: production"
  echo "- Webhook configurado: https://ship24go.com/api/webhooks/easypost"
  echo "- Clave guardada en .env y no mostrada en este archivo."
  echo ""
  echo "## Validación EasyPost"
  echo ""
  echo "- Respuesta cuenta EasyPost: HTTP $USER_HTTP"
  echo "- Respuesta webhooks EasyPost: HTTP $WEBHOOK_HTTP"
  echo "- Webhook Ship24Go encontrado en EasyPost: $WEBHOOK_FOUND"
  echo ""
  echo "## Archivos de revisión"
  echo ""
  echo "- $TEST_USER_JSON"
  echo "- $TEST_WEBHOOKS_JSON"
  echo ""
  echo "## Variables activas"
  echo ""
  grep -E '^(EASYPOST_ENABLED|EASYPOST_ENV|EASYPOST_MODE|EASYPOST_SANDBOX|EASYPOST_API_URL|EASYPOST_BASE_URL|EASYPOST_WEBHOOK_URL|EASYPOST_WEBHOOK_ENABLED|EASYPOST_API_KEY|EASYPOST_PRODUCTION_API_KEY|EASYPOST_PROD_API_KEY)=' .env \
    | sed -E 's/(EASYPOST_API_KEY|EASYPOST_PRODUCTION_API_KEY|EASYPOST_PROD_API_KEY)=.*/\1=***OCULTA***/'
  echo ""
  echo "## Próxima prueba recomendada"
  echo ""
  echo "1. Entrar al panel."
  echo "2. Hacer una cotización real EasyPost."
  echo "3. Crear un envío controlado."
  echo "4. Confirmar que llegue evento al webhook."
  echo "5. Confirmar que tracking y etiqueta se actualicen correctamente."
} > "$OUT"

echo ""
echo "EasyPost producción activado."
echo "$OUT"
echo ""
echo "Revisión rápida:"
echo "- Cuenta EasyPost HTTP: $USER_HTTP"
echo "- Webhooks EasyPost HTTP: $WEBHOOK_HTTP"
echo "- Webhook Ship24Go encontrado: $WEBHOOK_FOUND"
