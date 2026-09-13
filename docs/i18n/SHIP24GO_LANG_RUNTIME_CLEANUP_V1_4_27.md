# Ship24Go — Guía de traducción por módulo V1.4.27

## Idiomas activos

- `es` — Español global
- `en` — Inglés
- `it` — Italiano
- `fr` — Francés
- `de` — Alemán
- `zh` — Chino

## Regla obligatoria

Cada texto visible en una pantalla debe tener traducción en los seis idiomas. No se deben escribir textos finales directamente en la interfaz.

## Módulos mínimos por pantalla

### Panel cliente `/panel`
Usar llaves/módulo para:
- encabezados del dashboard
- tarjetas de saldo/envíos/estado
- gráficos
- estados vacíos
- acciones principales

### Cotización `/panel/quote`
Usar llaves/módulo para:
- origen/destino
- filtros de tarifa
- puntos autorizados
- remitente/destinatario
- mercancía y aduana
- resumen de servicio
- wallet
- botones de pago/creación

### Envíos `/panel/shipments`
Usar llaves/módulo para:
- tabla
- estados de etiqueta
- acciones de etiqueta
- cancelación
- términos
- editar/finalizar/preparar

### Integraciones `/panel/stores`
Usar llaves/módulo para:
- tiendas conectadas
- pedidos ecommerce
- direcciones por revisar
- sincronización
- botones de conectar/desconectar

### Facturación y saldo `/panel/settings`
Usar llaves/módulo para:
- idioma
- moneda
- apariencia
- wallet
- métodos de respaldo
- datos de facturación
- configuración de empresa

### Soporte `/panel/tickets`
Usar llaves/módulo para:
- crear ticket
- estados vacíos
- conversación
- respuestas
- cancelaciones

### Copiloto `/panel/copilot`
Usar nombre comercial sin información técnica:
- `Copiloto AI`
- `AI Copilot`
- `Copilota IA`
- `Copilote IA`
- `KI-Assistent`
- `AI 助手`

## Prohibido en UI

No mostrar textos técnicos como SQL, endpoint, tabla, schema, debug, token, stack trace, migration o errores internos. Eso debe ir en logs o diagnóstico.

## Diagnóstico recomendado

```bash
cd /www/wwwroot/ship24go.com
node scripts/diagnostico-lang-runtime-v1.4.27.cjs
```
