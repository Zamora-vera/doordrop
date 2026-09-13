#!/usr/bin/env bash
set -e
cd /www/wwwroot/ship24go.com

echo "Verificando configuración de cliente..."
grep -n "api/user/settings\|preferred_payment_method\|let requestedCurrency" server.ts | head -20
grep -n "Moneda de la cuenta\|Configuración de facturación\|Método preferido para envíos" src/pages/CustomerPanel.tsx | head -20
npm run build
