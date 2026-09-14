import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Asegurar carga de .env con override para que las variables de .env manden sobre Docker
dotenv.config({ override: true });

interface SendPasswordResetParams {
  toEmail: string;
  recipientName?: string;
  resetToken: string;
  expirationMinutes?: number;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
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
    secure: isSecure, // TLS implícito en puerto 465
    auth: {
      user,
      pass
    },
    tls: {
      rejectUnauthorized: true, // Verifica certificado TLS estrictamente
      servername: host // Garantiza SNI correcto para smtp.truobox.com
    }
  });

  return transporter;
}

/**
 * Escapa caracteres HTML para evitar inyección en correos
 */
function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
  
  // Forzar remitente oficial de DoorDrop según requerimiento #12 y #13
  let fromEmail = process.env.MAIL_FROM_EMAIL || 'info@doordrop.lat';
  if (!fromEmail || fromEmail.includes('ship24go')) {
    fromEmail = 'info@doordrop.lat';
  }
  let fromName = process.env.MAIL_FROM_NAME || 'DoorDrop';
  if (!fromName || fromName.toLowerCase().includes('ship24go')) {
    fromName = 'DoorDrop';
  }

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
          <!-- Header -->
          <tr>
            <td style="background-color:#0f172a;padding:28px 32px;text-align:center;">
              <span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">Door<span style="color:#3b82f6;">Drop</span></span>
            </td>
          </tr>
          <!-- Content -->
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
              <!-- Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 28px auto;">
                <tr>
                  <td align="center" style="border-radius:12px;background-color:#2563eb;">
                    <a href="${escapeHtml(resetUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;background-color:#2563eb;">
                      Restablecer mi contraseña
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Expiration notice -->
              <div style="background-color:#eff6ff;border-left:4px solid #3b82f6;border-radius:6px;padding:12px 16px;margin-bottom:24px;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:#1e40af;">
                  ⏱ Este enlace expirará en <strong>${expirationMinutes} minutos</strong>.
                </p>
              </div>
              <!-- Security Warning -->
              <div style="background-color:#fef2f2;border-left:4px solid #ef4444;border-radius:6px;padding:12px 16px;margin-bottom:24px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#991b1b;">
                  🔒 <strong>Advertencia de seguridad:</strong> Nunca compartas este enlace con nadie. Si tú no solicitaste este cambio, puedes ignorar este mensaje; tu cuenta permanecerá segura y tu contraseña no cambiará.
                </p>
              </div>
              <!-- Plain text link fallback -->
              <p style="margin:0 0 8px 0;font-size:12px;color:#64748b;line-height:1.5;">
                Si el botón no funciona, copia y pega la siguiente URL en tu navegador:
              </p>
              <p style="margin:0 0 24px 0;font-size:11px;color:#3b82f6;word-break:break-all;line-height:1.4;">
                <a href="${escapeHtml(resetUrl)}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(resetUrl)}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
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
