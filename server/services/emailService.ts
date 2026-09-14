import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { pool } from '../db/connection';

// Asegurar carga de .env con override prioritario
dotenv.config({ override: true });

interface SendPasswordResetParams {
  toEmail: string;
  recipientName?: string;
  resetToken: string;
  expirationMinutes?: number;
}

interface SendTemplatedEmailParams {
  templateId: string;
  language?: string;
  toEmail: string;
  recipientName?: string;
  variables?: Record<string, any>;
}

export interface SendNotificationEventParams {
  eventCode: string;
  entityType: string;
  entityId: string;
  toEmail: string;
  recipientName?: string;
  language?: string;
  audience?: string;
  userId?: string | null;
  shipmentId?: string | null;
  providerCode?: string | null;
  variables?: Record<string, any>;
}

export interface SendNotificationEventResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  messageId?: string;
  templateId?: string;
  subject?: string;
}

let transporter: nodemailer.Transporter | null = null;

export function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || 'smtp.truobox.com';
  const port = Number(process.env.SMTP_PORT) || 465;
  const isSecure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error('Las credenciales SMTP (SMTP_USER / SMTP_PASS) no están configuradas.');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: isSecure,
    auth: {
      user,
      pass
    },
    tls: {
      rejectUnauthorized: true,
      servername: host
    }
  });

  return transporter;
}

/**
 * Escapa caracteres HTML para evitar inyección en correos
 */
export function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Reemplaza variables {{variableName}} en una plantilla de texto o HTML
 */
export function renderTemplateText(templateText: string, variables: Record<string, any>, isHtml: boolean = false): string {
  let result = templateText || '';
  for (const [key, val] of Object.entries(variables || {})) {
    const rawVal = val !== undefined && val !== null ? String(val) : '';
    const safeVal = isHtml ? escapeHtml(rawVal) : rawVal;
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    result = result.replace(regex, safeVal);
  }
  return result;
}

function normalizeNotificationEmail(value: any): string {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizeNotificationLanguage(value: any): string {
  const rawValue = String(value || '').trim().toLowerCase().replace('_', '-');
  const raw = rawValue.slice(0, 2);
  if (['es', 'it', 'en', 'de', 'fr'].includes(raw)) return raw;
  const countryLanguage: Record<string, string> = {
    us: 'en', gb: 'en', ca: 'en', au: 'en',
    it: 'it', de: 'de', at: 'de', ch: 'de',
    fr: 'fr', be: 'fr',
    es: 'es', mx: 'es', do: 'es', co: 'es', ar: 'es', cl: 'es', pe: 'es'
  };
  return countryLanguage[raw] || 'es';
}

async function loadTemplateTranslation(templateId: string, language: string): Promise<any> {
  const requestedLanguage = normalizeNotificationLanguage(language);
  const candidates = Array.from(new Set([requestedLanguage, 'en', 'es']));
  const placeholders = candidates.map(() => '?').join(', ');
  const [rows]: any = await pool.query(
    `SELECT subject, preheader, body_html, body_text, language
     FROM email_template_translations
     WHERE template_id = ? AND language IN (${placeholders}) AND is_active = 1
     ORDER BY FIELD(language, ${placeholders})
     LIMIT 1`,
    [templateId, ...candidates, ...candidates]
  );

  if (!rows || rows.length === 0) {
    throw new Error(`Plantilla de correo '${templateId}' no encontrada.`);
  }
  return { ...rows[0], resolvedLanguage: normalizeNotificationLanguage(rows[0].language || requestedLanguage) };
}

function templateVariables(toEmail: string, recipientName: string | undefined, variables: Record<string, any>) {
  const appUrl = (process.env.APP_URL || 'https://doordrop.lat').replace(/\/+$/, '');
  return {
    appUrl,
    loginUrl: `${appUrl}/auth/login`,
    siteName: 'DoorDrop',
    recipientName: recipientName || toEmail,
    userName: recipientName || toEmail.split('@')[0],
    userEmail: toEmail,
    ...variables
  };
}

/**
 * Prueba la conexión SMTP y opcionalmente envía un correo de diagnóstico
 */
export async function testSmtpConnection(options: {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  toEmail?: string;
  senderName?: string;
}): Promise<{ success: boolean; message: string; details?: any }> {
  const host = options.host || process.env.SMTP_HOST || 'smtp.truobox.com';
  const port = Number(options.port || process.env.SMTP_PORT) || 465;
  const isSecure = options.secure !== undefined ? options.secure : (port === 465);
  const user = options.user || process.env.SMTP_USER;
  const pass = options.pass || process.env.SMTP_PASS;

  if (!user || !pass) {
    return { success: false, message: 'Faltan credenciales de usuario o contraseña SMTP.' };
  }

  const customTransporter = nodemailer.createTransport({
    host,
    port,
    secure: isSecure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: true,
      servername: host
    }
  });

  try {
    // 1. Validar conexión y autenticación
    await customTransporter.verify();

    // 2. Si se proporcionó destinatario, enviar correo de prueba
    if (options.toEmail) {
      const fromEmail = "info@doordrop.lat";
      const fromName = options.senderName || process.env.MAIL_FROM_NAME || 'DoorDrop';

      const info = await customTransporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        sender: fromEmail,
        envelope: {
          from: fromEmail,
          to: [options.toEmail]
        },
        to: options.toEmail,
        subject: `[Prueba SMTP DoorDrop] Conexión Exitosa (${new Date().toLocaleDateString('es-ES')})`,
        text: `Hola,\n\nEste es un correo de prueba enviado desde el panel administrativo de DoorDrop.\n\nDetalles del Relay:\n- Servidor: ${host}:${port}\n- Seguridad: ${isSecure ? 'TLS Implícito' : 'STARTTLS'}\n- Remitente: ${fromEmail}\n- Destinatario: ${options.toEmail}\n\nSi has recibido este correo, tu configuración SMTP está 100% operativa.`,
        html: `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f8fafc;padding:32px;color:#1e293b;">
          <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
            <div style="background:#0f172a;padding:16px;border-radius:12px;text-align:center;margin-bottom:24px;">
              <span style="color:#ffffff;font-size:22px;font-weight:800;">Door<span style="color:#3b82f6;">Drop</span></span>
            </div>
            <div style="background:#ecfdf5;border:1px solid #a7f3d0;padding:16px;border-radius:12px;margin-bottom:24px;text-align:center;">
              <h2 style="color:#065f46;margin:0 0 8px 0;font-size:18px;">✅ Conexión SMTP Verificada</h2>
              <p style="color:#047857;margin:0;font-size:13px;">El servidor de correo <strong>${host}:${port}</strong> ha procesado y entregado este mensaje correctamente.</p>
            </div>
            <p style="font-size:14px;line-height:1.6;color:#475569;">Hola,</p>
            <p style="font-size:14px;line-height:1.6;color:#475569;">Este es un mensaje de prueba enviado directamente desde la nueva vista de administración <strong>/admin/settings/smtp</strong> de DoorDrop.</p>
            <table style="width:100%;font-size:12px;margin:20px 0;border-collapse:collapse;">
              <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0;color:#64748b;">Relay SMTP</td><td style="padding:8px 0;font-weight:bold;color:#0f172a;">${host}:${port}</td></tr>
              <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0;color:#64748b;">Seguridad</td><td style="padding:8px 0;font-weight:bold;color:#0f172a;">${isSecure ? 'TLS Implícito' : 'STARTTLS'} (Certificado Validado)</td></tr>
              <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0;color:#64748b;">Remitente</td><td style="padding:8px 0;font-weight:bold;color:#0f172a;">${fromName} &lt;${fromEmail}&gt;</td></tr>
              <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0;color:#64748b;">Destinatario</td><td style="padding:8px 0;font-weight:bold;color:#0f172a;">${options.toEmail}</td></tr>
            </table>
            <p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:24px;">© 2026 DoorDrop Logistics. Todos los derechos reservados.</p>
          </div></body></html>`
      });

      return {
        success: true,
        message: `Conexión SMTP exitosa. Correo de prueba enviado a ${options.toEmail}.`,
        details: { messageId: info.messageId, response: info.response, accepted: info.accepted }
      };
    }

    return {
      success: true,
      message: `Conexión SMTP con ${host}:${port} autenticada exitosamente.`
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Error al conectar con el servidor SMTP.',
      details: err
    };
  }
}

/**
 * Envía un correo utilizando una plantilla multilingüe de la base de datos
 */
export async function sendTemplatedEmail({
  templateId,
  language = 'es',
  toEmail,
  recipientName,
  variables = {}
}: SendTemplatedEmailParams): Promise<{ success: boolean; messageId?: string }> {
  const safeToEmail = normalizeNotificationEmail(toEmail);
  if (!safeToEmail) throw new Error('El destinatario del correo no es válido.');
  const tmpl = await loadTemplateTranslation(templateId, language || 'es');
  const allVars = templateVariables(safeToEmail, recipientName, variables);

  const subject = renderTemplateText(tmpl.subject, allVars, false);
  const htmlBody = renderTemplateText(tmpl.body_html, allVars, true);
  const textBody = renderTemplateText(tmpl.body_text, allVars, false);

  const mailer = getTransporter();
  const fromEmail = "info@doordrop.lat";
  const fromName = process.env.MAIL_FROM_NAME || 'DoorDrop';

  const info = await mailer.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    sender: fromEmail,
    envelope: {
      from: fromEmail,
      to: [safeToEmail]
    },
    to: safeToEmail,
    subject,
    text: textBody,
    html: htmlBody
  });

  return {
    success: true,
    messageId: info.messageId
  };
}

/**
 * Resuelve un evento administrable, aplica su plantilla y registra el resultado.
 * La clave entityType/entityId/audience evita duplicados fuera del módulo de envíos.
 */
export async function sendNotificationEvent(params: SendNotificationEventParams): Promise<SendNotificationEventResult> {
  const eventCode = String(params.eventCode || '').trim();
  const entityType = String(params.entityType || '').trim();
  const entityId = String(params.entityId || '').trim();
  const safeToEmail = normalizeNotificationEmail(params.toEmail);
  if (!eventCode || !entityType || !entityId) {
    return { success: false, skipped: true, reason: 'invalid_event_identity' };
  }
  if (!safeToEmail) {
    return { success: false, skipped: true, reason: 'no_recipient' };
  }

  const [eventRows]: any = await pool.query(
    `SELECT event_code, template_id, audience, is_enabled
     FROM email_notification_events
     WHERE event_code = ?
     LIMIT 1`,
    [eventCode]
  );
  const event = eventRows?.[0];
  if (!event) return { success: false, skipped: true, reason: 'event_not_configured' };
  if (!event.is_enabled) return { success: false, skipped: true, reason: 'event_disabled', templateId: event.template_id };

  const audience = String(params.audience || event.audience || 'customer');
  const [existingRows]: any = await pool.query(
    `SELECT id, status, message_id, subject, template_id
     FROM email_logs
     WHERE entity_type = ? AND entity_id = ? AND event_code = ?
       AND audience = ? AND to_email = ?
     LIMIT 1`,
    [entityType, entityId, eventCode, audience, safeToEmail]
  );
  const existingLog = existingRows?.[0];
  if (existingLog?.status === 'sent') {
    return {
      success: false,
      skipped: true,
      reason: 'already_sent',
      messageId: existingLog.message_id || undefined,
      templateId: existingLog.template_id || event.template_id,
      subject: existingLog.subject || undefined
    };
  }
  if (existingLog?.status === 'pending') {
    return { success: false, skipped: true, reason: 'send_in_progress', templateId: existingLog.template_id || event.template_id, subject: existingLog.subject || undefined };
  }

  const requestedLanguage = normalizeNotificationLanguage(params.language || 'es');
  const tmpl = await loadTemplateTranslation(event.template_id, requestedLanguage);
  const language = tmpl.resolvedLanguage || requestedLanguage;
  const allVars = templateVariables(safeToEmail, params.recipientName, params.variables || {});
  const subject = renderTemplateText(tmpl.subject, allVars, false);
  // email_logs.id es CHAR(36): conserva el UUID completo para no truncar la inserción.
  const logId = existingLog?.id || crypto.randomUUID();
  const logPayload = JSON.stringify({ eventCode, entityType, entityId, audience });

  if (existingLog) {
    await pool.query(
      `UPDATE email_logs
       SET shipment_id = ?, user_id = ?, subject = ?, language = ?, status = 'pending',
           provider_code = ?, message_id = NULL, error_message = NULL, payload_json = ?, sent_at = NULL,
           template_id = ?
       WHERE id = ?`,
      [params.shipmentId || null, params.userId || null, subject, language, params.providerCode || null, logPayload, event.template_id, logId]
    );
  } else {
    await pool.query(
      `INSERT INTO email_logs
        (id, shipment_id, user_id, to_email, subject, language, event_code, status,
         provider_code, message_id, error_message, payload_json, sent_at,
         entity_type, entity_id, audience, template_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, NULL, ?, NULL, ?, ?, ?, ?)`,
      [
        logId,
        params.shipmentId || null,
        params.userId || null,
        safeToEmail,
        subject,
        language,
        eventCode,
        params.providerCode || null,
        logPayload,
        entityType,
        entityId,
        audience,
        event.template_id
      ]
    );
  }

  try {
    const sent = await sendTemplatedEmail({
      templateId: event.template_id,
      language,
      toEmail: safeToEmail,
      recipientName: params.recipientName,
      variables: params.variables || {}
    });
    await pool.query(
      `UPDATE email_logs
       SET status = 'sent', message_id = ?, error_message = NULL, sent_at = NOW()
       WHERE id = ?`,
      [sent.messageId || null, logId]
    );
    return { success: true, messageId: sent.messageId, templateId: event.template_id, subject };
  } catch (error: any) {
    await pool.query(
      `UPDATE email_logs
       SET status = 'failed', error_message = ?
       WHERE id = ?`,
      [String(error?.message || 'No se pudo enviar la notificación.').slice(0, 900), logId]
    ).catch(() => null);
    return { success: false, reason: 'send_failed', templateId: event.template_id, subject };
  }
}

/**
 * Envía correo de restablecimiento de contraseña usando SMTP Truobox
 */
export async function sendPasswordResetEmail({
  toEmail,
  recipientName,
  resetToken,
  expirationMinutes = 30
}: SendPasswordResetParams): Promise<{ messageId?: string; accepted?: any[] }> {
  const mailer = getTransporter();

  const appUrl = (process.env.APP_URL || 'https://doordrop.lat').replace(/\/+$/, '');
  const resetUrl = `${appUrl}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;
  
  const fromEmail = 'info@doordrop.lat';
  const fromName = 'DoorDrop';

  const safeName = recipientName ? escapeHtml(recipientName.trim()) : 'estimado/a usuario/a';
  const subject = 'Restablece tu contraseña de DoorDrop';

  const textBody = `Hola ${safeName},

Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en DoorDrop.

Para crear una nueva contraseña, haz clic en el siguiente enlace o cópialo en tu navegador:
${resetUrl}

Este enlace es válido durante los próximos ${expirationMinutes} minutos.

ADVERTENCIA DE SEGURIDAD:
Por tu seguridad, nunca compartas este enlace con nadie. Si no has solicitado este cambio, puedes ignorar este correo de forma segura; tu contraseña actual permanecerá sin cambios.

Saludos cordiales,
El equipo de DoorDrop
${appUrl}
`;

  const htmlBody = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" max-width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -2px rgba(0,0,0,0.1);border:1px solid #e2e8f0;">
          <tr>
            <td style="background-color:#0f172a;padding:28px 32px;text-align:center;">
              <span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">Door<span style="color:#3b82f6;">Drop</span></span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 24px 32px;">
              <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#0f172a;line-height:1.3;">
                Restablecimiento de Contraseña
              </h1>
              <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#475569;">
                Hola <strong>${safeName}</strong>,
              </p>
              <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#475569;">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>DoorDrop</strong>. Haz clic en el botón siguiente para definir una nueva contraseña:
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 28px auto;">
                <tr>
                  <td align="center" style="border-radius:12px;background-color:#2563eb;">
                    <a href="${escapeHtml(resetUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;background-color:#2563eb;">
                      Restablecer mi contraseña
                    </a>
                  </td>
                </tr>
              </table>
              <div style="background-color:#eff6ff;border-left:4px solid #3b82f6;border-radius:6px;padding:12px 16px;margin-bottom:24px;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:#1e40af;">
                  ⏱ Este enlace expirará en <strong>${expirationMinutes} minutos</strong>.
                </p>
              </div>
              <div style="background-color:#fef2f2;border-left:4px solid #ef4444;border-radius:6px;padding:12px 16px;margin-bottom:24px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#991b1b;">
                  🔒 <strong>Advertencia de seguridad:</strong> Nunca compartas este enlace con nadie. Si tú no solicitaste este cambio, puedes ignorar este mensaje; tu cuenta permanecerá segura y tu contraseña no cambiará.
                </p>
              </div>
              <p style="margin:0 0 8px 0;font-size:12px;color:#64748b;line-height:1.5;">
                Si el botón no funciona, copia y pega la siguiente URL en tu navegador:
              </p>
              <p style="margin:0 0 24px 0;font-size:11px;color:#3b82f6;word-break:break-all;line-height:1.4;">
                <a href="${escapeHtml(resetUrl)}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(resetUrl)}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                © 2026 DoorDrop. Todos los derechos reservados.<br>
                Enviado automáticamente desde <a href="${escapeHtml(appUrl)}" style="color:#64748b;text-decoration:none;">${escapeHtml(appUrl)}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const info = await mailer.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    sender: fromEmail,
    envelope: {
      from: fromEmail,
      to: [toEmail]
    },
    to: toEmail,
    subject,
    text: textBody,
    html: htmlBody
  });

  return {
    messageId: info.messageId,
    accepted: info.accepted
  };
}
