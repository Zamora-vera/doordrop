# Ship24Go V1.4.24 — Idiomas, moneda, PWA y modo oscuro

## Objetivo

Esta versión agrega una capa global para operar Ship24Go en varios países sin romper el flujo actual de proveedores, cotizaciones, etiquetas ni Ecart API.

## Idiomas incluidos

- Español general
- Español República Dominicana
- Español España
- Español Colombia
- Español Ecuador
- English
- Italiano
- Français
- Deutsch
- 中文
- Kreyòl

## Monedas incluidas

- EUR
- USD
- DOP
- GBP
- COP
- MXN
- ARS
- CLP
- BRL
- PEN
- CNY
- HTG
- CAD

## Lógica comercial

1. Si el cliente eligió una moneda manualmente, se respeta.
2. Si no eligió moneda, se toma una recomendada por país.
3. Si el país no está disponible, se usa EUR como base visual.
4. Las cotizaciones existentes no cambian de flujo.
5. Los datos privados no se cachean en PWA.

## Modo oscuro

El modo oscuro usa variables CSS globales y mejora contraste en:

- panel cliente
- tiendas ecommerce
- formularios
- tarjetas
- inputs
- selectores
- PWA móvil

## UI profesional

Los mensajes visibles siguen siendo comerciales:

- No hay registros todavía.
- No hay datos para mostrar.
- No fue posible conectar la tienda. Intenta nuevamente.
- Revisa la dirección antes de crear el envío.

Los detalles internos se guardan en diagnóstico.
