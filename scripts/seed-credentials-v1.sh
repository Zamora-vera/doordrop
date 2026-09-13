#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No se encontró .env. Copia .env.example a .env y completa la conexión MySQL primero."
  exit 1
fi

read -rp "Correo Super Admin [admin@ship24go.com]: " SHIP_ADMIN_EMAIL
SHIP_ADMIN_EMAIL=${SHIP_ADMIN_EMAIL:-admin@ship24go.com}
read -rsp "Clave Super Admin: " SHIP_ADMIN_PASSWORD
echo

read -rp "Correo cliente [user@ship24go.com]: " SHIP_USER_EMAIL
SHIP_USER_EMAIL=${SHIP_USER_EMAIL:-user@ship24go.com}
read -rsp "Clave cliente: " SHIP_USER_PASSWORD
echo

read -rsp "Token ParcelABC: " SHIP_PABC_TOKEN
echo
read -rsp "Usuario Genei: " SHIP_GENEI_USER
echo
read -rsp "Clave Genei: " SHIP_GENEI_PASS
echo
read -rsp "FreeCurrencyAPI key: " SHIP_FREECURRENCY_KEY
echo
read -rsp "Ecart API Id / Client Id: " SHIP_ECART_CLIENT_ID
echo
read -rsp "Ecart Client Secret, si tienes uno: " SHIP_ECART_SECRET
echo
read -rsp "Google Maps key, opcional: " SHIP_GOOGLE_MAPS_KEY
echo

export SHIP_ADMIN_EMAIL SHIP_ADMIN_PASSWORD SHIP_USER_EMAIL SHIP_USER_PASSWORD
export SHIP_PABC_TOKEN SHIP_GENEI_USER SHIP_GENEI_PASS SHIP_FREECURRENCY_KEY
export SHIP_ECART_CLIENT_ID SHIP_ECART_SECRET SHIP_GOOGLE_MAPS_KEY

node scripts/seed-credentials-v1.js
