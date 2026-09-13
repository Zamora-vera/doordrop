# Ship24Go V1.4.32 — AI Copilot OpenAI + Asistencia Humana

## Alcance

Esta versión conecta `/panel/copilot` con backend real de OpenAI y mantiene el layout real del panel de Ship24Go.

## Cambios principales

- Nuevo endpoint de usuario: `POST /api/copilot/message`.
- Compatibilidad con endpoint anterior: `POST /api/ai/chat`.
- Configuración Super Admin desde `/admin/settings`.
- Soporte de clave OpenAI desde `.env` o desde configuración protegida del Super Admin.
- Contexto seguro por usuario:
  - Perfil autorizado.
  - Envíos del cliente.
  - Eventos de tracking guardados.
  - Tickets del cliente.
  - Tiendas/integraciones del cliente.
  - Planes activos.
  - Couriers activos y estado de conexión.
- Para Super Admin, el contexto usa métricas y registros recientes, sin mostrar secretos.
- Si la AI no puede responder con seguridad, crea un ticket de asistencia humana.
- El ticket se crea con idioma del usuario y resumen de conversación.
- Se eliminan textos visibles como “SQL LIVE” en el Copilot.
- Nuevos textos i18n para español, inglés, italiano, francés, alemán y chino.

## Seguridad y UX

La UI no muestra claves, errores internos, detalles de base de datos, payloads, rutas privadas ni configuración técnica.

Los mensajes al usuario son comerciales y seguros, por ejemplo:

- “Estamos revisando tu solicitud.”
- “Un agente continuará la asistencia desde un ticket de soporte.”
- “No encontramos información suficiente para responder con seguridad.”

## Variables recomendadas

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
AI_COPILOT_ENABLED=true
AI_COPILOT_AUTO_TICKET=true
AI_COPILOT_MAX_CONTEXT_RECORDS=20
```

## Tablas nuevas

- `ai_conversations`
- `ai_messages`
- `ai_handoffs`

Estas tablas se crean automáticamente al usar Copilot y también están en la migración `V19__ai_copilot_openai_v1432.sql`.

## Validación

- `npm run build`: OK.
- `npm run lint`: OK.
- Advertencia conocida de Vite: bundle mayor de 500 kB. No bloquea producción.
