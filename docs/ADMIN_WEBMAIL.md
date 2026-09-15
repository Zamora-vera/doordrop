# DoorDrop — Webmail de Super Admin

## Estado de la Fase 1

La Fase 1 incorpora un módulo de Webmail real bajo `/admin/webmail`, limitado por backend a usuarios con rol `super_admin`. El módulo usa el relay SMTP corporativo existente para enviar mensajes y una conexión IMAP segura al buzón de `info@doordrop.lat` para leer y gestionar correo real.

No se implementaron en esta fase Equipo/Staff, creación de envíos, labels configurables, automatizaciones de notificaciones, CRM ni IA para tickets.

## Archivos modificados

- `server/services/webmailService.ts`: conexión IMAP, carpetas, paginación, búsqueda, lectura, flags, movimiento, borrado, borradores, adjuntos y sanitización HTML.
- `server/services/emailService.ts`: envío manual corporativo y generación MIME de borradores reutilizando el transporter SMTP existente. El remitente y `envelope.from` permanecen fijados a `info@doordrop.lat`.
- `server.ts`: endpoints protegidos `/api/admin/webmail/*`, validación de payloads, límite de adjuntos y errores comerciales sin trazas técnicas.
- `src/pages/admin/Webmail.tsx`: bandeja, lectura, respuestas, reenvío, compositor, adjuntos, búsqueda, carpetas, paginación, responsive y modo oscuro.
- `src/pages/AdminPanel.tsx`: enlace lateral, ruta y tarjeta de estado en Configuración.
- `src/lib/api.ts`: cliente de los endpoints de Webmail.
- `src/lib/i18n.tsx`: textos ES/EN/IT para el nuevo módulo.
- `.env.example`: nombres de configuración backend SMTP/IMAP sin secretos.

## Configuración utilizada

SMTP reutilizado:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
- remitente corporativo fijo: `info@doordrop.lat`

IMAP del servidor de correo:

- `IMAP_HOST=mail.doordrop.lat`
- `IMAP_PORT=993`
- `IMAP_SECURE=true`
- `IMAP_USER=info@doordrop.lat`
- `IMAP_PASS`: debe existir únicamente en el entorno backend del contenedor.

La contraseña IMAP no se deriva ni se reutiliza desde `SMTP_PASS`. Las credenciales no se devuelven por API, no se incluyen en el bundle frontend y no se escriben en logs normales.

## API interna

Todos los endpoints siguientes requieren el token de sesión y `role=super_admin`:

- `GET /api/admin/webmail/status`
- `POST /api/admin/webmail/verify`
- `GET /api/admin/webmail/folders`
- `GET /api/admin/webmail/messages?folder=inbox&page=1&pageSize=25&search=`
- `GET /api/admin/webmail/messages/:uid?mailbox=...`
- `GET /api/admin/webmail/messages/:uid/attachments/:index?mailbox=...`
- `POST /api/admin/webmail/messages/:uid/action`
- `POST /api/admin/webmail/send`
- `POST /api/admin/webmail/drafts`

El parámetro `mailbox` se valida contra la lista IMAP actual; no se acepta como ruta arbitraria del sistema.

## Seguridad y límites

- HTML recibido se sanitiza en backend antes de mostrarse o enviarse.
- Enlaces se fuerzan a abrir con `noopener noreferrer nofollow`.
- Adjuntos: máximo 8 archivos, 5 MB por archivo y 7 MB acumulados por operación.
- Descarga de adjuntos con sesión Super Admin, `no-store` y `nosniff`.
- Nombres de archivo y cabeceras se normalizan para evitar inyección.
- `sanitize-html` se mantiene en la versión corregida `2.17.7`; declara Node `>=22.12.0`, mientras que el contenedor actual usa Node 20. La instalación funciona y el build pasa en Node 20, pero se debe planificar la actualización del runtime para eliminar esa advertencia de compatibilidad sin degradar la protección XSS.
- Los errores internos se registran solo como código de operación; la interfaz recibe mensajes comerciales.
- No se crea una tabla nueva para estado local: las flags, carpetas y borradores permanecen en el buzón IMAP real, dejando la futura relación con clientes/envíos/tickets sin acoplarla a datos falsos.

## Comprobaciones realizadas

- Cuenta `info@doordrop.lat` confirmada activa en el servidor de correo.
- Servicios Postfix, Dovecot, Roundcube y Rspamd confirmados en el VPS.
- TLS IMAP en el puerto 993 confirmado; el certificado actual del endpoint es autofirmado y debe ser sustituido por un certificado válido antes de exigir validación pública del nombre.
- El SMTP existente mantiene su configuración y remitente corporativo.
- `npx vite build`: correcto en la copia de trabajo.
- `npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external`: correcto.
- `npm run lint`: sin errores nuevos del módulo Webmail; el proyecto mantiene errores TypeScript preexistentes en otros módulos que ya existían antes de esta fase.

## Pendiente para declarar E2E completo

En la auditoría del VPS no existía `IMAP_PASS`/`MAILBOX_PASS` en el entorno de DoorDrop. Por ello todavía no se puede afirmar que la autenticación IMAP, la lectura de mensajes, la respuesta, el envío visto en `Sent` y los adjuntos hayan sido probados dentro de DoorDrop. La conexión TLS y la existencia/estado de la cuenta sí fueron verificadas.

Para cerrar esa comprobación, el operador debe configurar la contraseña vigente del buzón real en el entorno backend y reiniciar el contenedor según el procedimiento de producción. Después se debe ejecutar esta matriz sin usar datos simulados:

1. Super Admin → Webmail → Recibidos → abrir un mensaje real.
2. Responder → enviar → confirmar el mensaje en Enviados.
3. Nuevo correo → destinatario real → asunto → cuerpo → adjunto → enviar.
4. Confirmar recepción del mensaje enviado y descarga del adjunto.
5. Confirmar que una sesión de cliente normal recibe `403` en `/api/admin/webmail/*`.
6. Repetir visualmente en ES/EN/IT, móvil y modo oscuro.

## Próximos pasos

1. Configurar y verificar la credencial IMAP del buzón corporativo sin publicarla.
2. Completar la matriz E2E de producción anterior.
3. Solo después comenzar la Fase 2 de Equipo/Staff.
