-- =============================================================================
-- V29 — SMTP Settings & Multilingual Email Templates System
-- DoorDrop Multi-Objective Notifications
-- Date: 2026-09-14
-- =============================================================================

-- 1. Tabla de Plantillas Maestras
CREATE TABLE IF NOT EXISTS email_templates (
  id VARCHAR(80) PRIMARY KEY,
  category ENUM('auth', 'shipments', 'billing', 'omnichannel') NOT NULL DEFAULT 'auth',
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  variables_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email_templates_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla de Traducciones por Idioma
CREATE TABLE IF NOT EXISTS email_template_translations (
  id CHAR(36) PRIMARY KEY,
  template_id VARCHAR(80) NOT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'es',
  subject VARCHAR(255) NOT NULL,
  preheader VARCHAR(255) NULL,
  body_html MEDIUMTEXT NOT NULL,
  body_text MEDIUMTEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_template_lang (template_id, language),
  INDEX idx_tmpl_trans_lang (language),
  CONSTRAINT fk_tmpl_trans_parent FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SEED DATA: Plantillas Predefinidas
-- =============================================================================

-- Plantilla 1: Bienvenida / Nuevo Cliente (auth_welcome)
INSERT INTO email_templates (id, category, name, description, variables_json) VALUES
('auth_welcome', 'auth', 'Bienvenida a Nuevo Cliente', 'Enviado tras el registro exitoso de una nueva cuenta en DoorDrop.', 
 JSON_ARRAY('userName', 'userEmail', 'loginUrl', 'siteName'))
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), variables_json=VALUES(variables_json);

-- Traducciones para auth_welcome
-- Español (es)
INSERT INTO email_template_translations (id, template_id, language, subject, preheader, body_html, body_text, is_active) VALUES
('trans_auth_welcome_es', 'auth_welcome', 'es', 
 '¡Bienvenido a DoorDrop, {{userName}}! Tu cuenta está lista', 
 'Comienza a gestionar tus envíos, tiendas online y tarifas exclusivas.',
 '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f8fafc;padding:30px;color:#1e293b;">
 <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
   <h1 style="color:#0f172a;font-size:22px;margin-bottom:16px;">¡Hola, {{userName}}! Te damos la bienvenida a DoorDrop</h1>
   <p style="font-size:14px;line-height:1.6;color:#475569;">Tu cuenta ha sido creada con éxito para <strong>{{userEmail}}</strong>. Ahora tienes acceso a cotizaciones de mensajería en tiempo real, integraciones con tiendas y tarifas de envío preferenciales.</p>
   <div style="text-align:center;margin:32px 0;">
     <a href="{{loginUrl}}" style="background:#2563eb;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">Ir a Mi Panel de Control</a>
   </div>
   <p style="font-size:12px;color:#94a3b8;text-align:center;">Si tienes alguna pregunta, nuestro equipo de soporte está disponible para ti.</p>
 </div></body></html>',
 'Hola {{userName}},\n\n¡Bienvenido a DoorDrop! Tu cuenta ha sido activada para {{userEmail}}.\nPuedes iniciar sesión aquí: {{loginUrl}}\n\nEl equipo de DoorDrop.',
 1)
ON DUPLICATE KEY UPDATE subject=VALUES(subject), preheader=VALUES(preheader), body_html=VALUES(body_html), body_text=VALUES(body_text);

-- Italiano (it)
INSERT INTO email_template_translations (id, template_id, language, subject, preheader, body_html, body_text, is_active) VALUES
('trans_auth_welcome_it', 'auth_welcome', 'it', 
 'Benvenuto su DoorDrop, {{userName}}! Il tuo account è pronto', 
 'Inizia a gestire le tue spedizioni, negozi online e tariffe esclusive.',
 '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f8fafc;padding:30px;color:#1e293b;">
 <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
   <h1 style="color:#0f172a;font-size:22px;margin-bottom:16px;">Ciao, {{userName}}! Benvenuto su DoorDrop</h1>
   <p style="font-size:14px;line-height:1.6;color:#475569;">Il tuo account è stato creato con successo per <strong>{{userEmail}}</strong>. Ora hai accesso a tariffe di corrieri espressi in tempo reale e gestione ordini.</p>
   <div style="text-align:center;margin:32px 0;">
     <a href="{{loginUrl}}" style="background:#2563eb;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">Accedi al Pannello di Controllo</a>
   </div>
 </div></body></html>',
 'Ciao {{userName}},\n\nBenvenuto su DoorDrop! Il tuo account è attivo.\nAccedi qui: {{loginUrl}}\n\nIl team di DoorDrop.',
 1)
ON DUPLICATE KEY UPDATE subject=VALUES(subject), preheader=VALUES(preheader), body_html=VALUES(body_html), body_text=VALUES(body_text);

-- Inglés (en)
INSERT INTO email_template_translations (id, template_id, language, subject, preheader, body_html, body_text, is_active) VALUES
('trans_auth_welcome_en', 'auth_welcome', 'en', 
 'Welcome to DoorDrop, {{userName}}! Your account is ready', 
 'Start managing your shipments, ecommerce integrations, and exclusive rates.',
 '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f8fafc;padding:30px;color:#1e293b;">
 <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
   <h1 style="color:#0f172a;font-size:22px;margin-bottom:16px;">Hello, {{userName}}! Welcome to DoorDrop</h1>
   <p style="font-size:14px;line-height:1.6;color:#475569;">Your account has been successfully created for <strong>{{userEmail}}</strong>. You now have access to real-time carrier quotes, store sync, and volume discounts.</p>
   <div style="text-align:center;margin:32px 0;">
     <a href="{{loginUrl}}" style="background:#2563eb;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">Go to My Dashboard</a>
   </div>
 </div></body></html>',
 'Hello {{userName}},\n\nWelcome to DoorDrop! Your account is active for {{userEmail}}.\nSign in here: {{loginUrl}}\n\nThe DoorDrop Team.',
 1)
ON DUPLICATE KEY UPDATE subject=VALUES(subject), preheader=VALUES(preheader), body_html=VALUES(body_html), body_text=VALUES(body_text);

-- Alemán (de)
INSERT INTO email_template_translations (id, template_id, language, subject, preheader, body_html, body_text, is_active) VALUES
('trans_auth_welcome_de', 'auth_welcome', 'de', 
 'Willkommen bei DoorDrop, {{userName}}! Ihr Konto ist bereit', 
 'Starten Sie mit dem Versandmanagement und exklusiven Tarifen.',
 '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f8fafc;padding:30px;color:#1e293b;">
 <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
   <h1 style="color:#0f172a;font-size:22px;margin-bottom:16px;">Guten Tag {{userName}}, willkommen bei DoorDrop</h1>
   <p style="font-size:14px;line-height:1.6;color:#475569;">Ihr Konto wurde erfolgreich für <strong>{{userEmail}}</strong> eingerichtet.</p>
   <div style="text-align:center;margin:32px 0;">
     <a href="{{loginUrl}}" style="background:#2563eb;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">Zum Dashboard</a>
   </div>
 </div></body></html>',
 'Guten Tag {{userName}},\n\nWillkommen bei DoorDrop! Anmelden unter: {{loginUrl}}\n\nIhr DoorDrop Team.',
 1)
ON DUPLICATE KEY UPDATE subject=VALUES(subject), preheader=VALUES(preheader), body_html=VALUES(body_html), body_text=VALUES(body_text);

-- Plantilla 2: Nueva Etiqueta / Envío Creado (shipment_created)
INSERT INTO email_templates (id, category, name, description, variables_json) VALUES
('shipment_created', 'shipments', 'Envío Creado / Etiqueta Generada', 'Notificación con el código de seguimiento tras la emisión de una etiqueta.',
 JSON_ARRAY('recipientName', 'trackingCode', 'carrierName', 'trackingUrl', 'originCity', 'destCity'))
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), variables_json=VALUES(variables_json);

-- Traducciones para shipment_created
-- Español (es)
INSERT INTO email_template_translations (id, template_id, language, subject, preheader, body_html, body_text, is_active) VALUES
('trans_ship_created_es', 'shipment_created', 'es',
 'Tu envío {{trackingCode}} está listo con {{carrierName}}',
 'Sigue tu paquete en tiempo real hacia {{destCity}}.',
 '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f8fafc;padding:30px;color:#1e293b;">
 <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
   <h1 style="color:#0f172a;font-size:20px;margin-bottom:12px;">Envío generado con éxito</h1>
   <p style="font-size:14px;line-height:1.6;color:#475569;">Hola <strong>{{recipientName}}</strong>, se ha emitido la etiqueta de tu envío a través de <strong>{{carrierName}}</strong>.</p>
   <div style="background:#f1f5f9;padding:16px;border-radius:12px;margin:20px 0;text-align:center;">
     <span style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:bold;">Número de Seguimiento</span>
     <div style="font-size:20px;font-weight:bold;color:#2563eb;margin-top:4px;">{{trackingCode}}</div>
   </div>
   <div style="text-align:center;margin:28px 0;">
     <a href="{{trackingUrl}}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">Rastrear Paquete</a>
   </div>
 </div></body></html>',
 'Hola {{recipientName}},\n\nTu envío {{trackingCode}} con {{carrierName}} está listo.\nRastréalo aquí: {{trackingUrl}}\n\nDoorDrop Logistics.',
 1)
ON DUPLICATE KEY UPDATE subject=VALUES(subject), preheader=VALUES(preheader), body_html=VALUES(body_html), body_text=VALUES(body_text);

-- Italiano (it)
INSERT INTO email_template_translations (id, template_id, language, subject, preheader, body_html, body_text, is_active) VALUES
('trans_ship_created_it', 'shipment_created', 'it',
 'La tua spedizione {{trackingCode}} è pronta con {{carrierName}}',
 'Traccia il tuo pacco in tempo reale verso {{destCity}}.',
 '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f8fafc;padding:30px;color:#1e293b;">
 <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
   <h1 style="color:#0f172a;font-size:20px;margin-bottom:12px;">Spedizione generata con successo</h1>
   <p style="font-size:14px;line-height:1.6;color:#475569;">Ciao <strong>{{recipientName}}</strong>, l''etichetta della tua spedizione è stata creata con <strong>{{carrierName}}</strong>.</p>
   <div style="background:#f1f5f9;padding:16px;border-radius:12px;margin:20px 0;text-align:center;">
     <span style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:bold;">Codice di Tracciamento</span>
     <div style="font-size:20px;font-weight:bold;color:#2563eb;margin-top:4px;">{{trackingCode}}</div>
   </div>
   <div style="text-align:center;margin:28px 0;">
     <a href="{{trackingUrl}}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">Traccia Spedizione</a>
   </div>
 </div></body></html>',
 'Ciao {{recipientName}},\n\nLa tua spedizione {{trackingCode}} con {{carrierName}} è pronta.\nTraccia qui: {{trackingUrl}}\n\nDoorDrop Logistics.',
 1)
ON DUPLICATE KEY UPDATE subject=VALUES(subject), preheader=VALUES(preheader), body_html=VALUES(body_html), body_text=VALUES(body_text);

-- Inglés (en)
INSERT INTO email_template_translations (id, template_id, language, subject, preheader, body_html, body_text, is_active) VALUES
('trans_ship_created_en', 'shipment_created', 'en',
 'Your shipment {{trackingCode}} is ready with {{carrierName}}',
 'Track your package in real-time to {{destCity}}.',
 '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f8fafc;padding:30px;color:#1e293b;">
 <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
   <h1 style="color:#0f172a;font-size:20px;margin-bottom:12px;">Shipment Created Successfully</h1>
   <p style="font-size:14px;line-height:1.6;color:#475569;">Hello <strong>{{recipientName}}</strong>, your shipping label with <strong>{{carrierName}}</strong> has been generated.</p>
   <div style="background:#f1f5f9;padding:16px;border-radius:12px;margin:20px 0;text-align:center;">
     <span style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:bold;">Tracking Number</span>
     <div style="font-size:20px;font-weight:bold;color:#2563eb;margin-top:4px;">{{trackingCode}}</div>
   </div>
   <div style="text-align:center;margin:28px 0;">
     <a href="{{trackingUrl}}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">Track Package</a>
   </div>
 </div></body></html>',
 'Hello {{recipientName}},\n\nYour shipment {{trackingCode}} with {{carrierName}} is ready.\nTrack here: {{trackingUrl}}\n\nDoorDrop Logistics.',
 1)
ON DUPLICATE KEY UPDATE subject=VALUES(subject), preheader=VALUES(preheader), body_html=VALUES(body_html), body_text=VALUES(body_text);

-- Plantilla 3: Recarga de Saldo Exitosa (wallet_topup_success)
INSERT INTO email_templates (id, category, name, description, variables_json) VALUES
('wallet_topup_success', 'billing', 'Recarga de Saldo Exitosa', 'Notificación de confirmación tras acreditar fondos en la billetera DoorDrop.',
 JSON_ARRAY('userName', 'amount', 'currency', 'newBalance', 'paymentMethod', 'panelUrl'))
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), variables_json=VALUES(variables_json);

-- Traducciones para wallet_topup_success
-- Español (es)
INSERT INTO email_template_translations (id, template_id, language, subject, preheader, body_html, body_text, is_active) VALUES
('trans_wallet_topup_es', 'wallet_topup_success', 'es',
 'Recarga confirmada: +{{amount}} {{currency}} en tu Billetera DoorDrop',
 'Tu saldo disponible se ha actualizado a {{newBalance}} {{currency}}.',
 '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f8fafc;padding:30px;color:#1e293b;">
 <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
   <h1 style="color:#0f172a;font-size:20px;margin-bottom:12px;">Recarga de Saldo Exitosa</h1>
   <p style="font-size:14px;line-height:1.6;color:#475569;">Hola <strong>{{userName}}</strong>, hemos acreditado correctamente tu recarga de <strong>+{{amount}} {{currency}}</strong> mediante {{paymentMethod}}.</p>
   <div style="background:#ecfdf5;border:1px solid #a7f3d0;padding:16px;border-radius:12px;margin:20px 0;text-align:center;">
     <span style="font-size:12px;color:#047857;text-transform:uppercase;font-weight:bold;">Nuevo Saldo Disponible</span>
     <div style="font-size:24px;font-weight:bold;color:#065f46;margin-top:4px;">{{newBalance}} {{currency}}</div>
   </div>
   <div style="text-align:center;margin:28px 0;">
     <a href="{{panelUrl}}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">Ver Mi Billetera</a>
   </div>
 </div></body></html>',
 'Hola {{userName}},\n\nTu recarga de +{{amount}} {{currency}} ha sido confirmada.\nNuevo saldo: {{newBalance}} {{currency}}.\n\nDoorDrop Finance.',
 1)
ON DUPLICATE KEY UPDATE subject=VALUES(subject), preheader=VALUES(preheader), body_html=VALUES(body_html), body_text=VALUES(body_text);

-- Italiano (it)
INSERT INTO email_template_translations (id, template_id, language, subject, preheader, body_html, body_text, is_active) VALUES
('trans_wallet_topup_it', 'wallet_topup_success', 'it',
 'Ricarica confermata: +{{amount}} {{currency}} sul tuo Portafoglio DoorDrop',
 'Il tuo saldo disponibile è stato aggiornato a {{newBalance}} {{currency}}.',
 '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f8fafc;padding:30px;color:#1e293b;">
 <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
   <h1 style="color:#0f172a;font-size:20px;margin-bottom:12px;">Ricarica del Saldo Riuscita</h1>
   <p style="font-size:14px;line-height:1.6;color:#475569;">Ciao <strong>{{userName}}</strong>, abbiamo accreditato con successo la tua ricarica di <strong>+{{amount}} {{currency}}</strong> tramite {{paymentMethod}}.</p>
   <div style="background:#ecfdf5;border:1px solid #a7f3d0;padding:16px;border-radius:12px;margin:20px 0;text-align:center;">
     <span style="font-size:12px;color:#047857;text-transform:uppercase;font-weight:bold;">Nuovo Saldo Disponibile</span>
     <div style="font-size:24px;font-weight:bold;color:#065f46;margin-top:4px;">{{newBalance}} {{currency}}</div>
   </div>
   <div style="text-align:center;margin:28px 0;">
     <a href="{{panelUrl}}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">Visualizza Portafoglio</a>
   </div>
 </div></body></html>',
 'Ciao {{userName}},\n\nRicarica di +{{amount}} {{currency}} confermata.\nNuovo saldo: {{newBalance}} {{currency}}.\n\nDoorDrop Finance.',
 1)
ON DUPLICATE KEY UPDATE subject=VALUES(subject), preheader=VALUES(preheader), body_html=VALUES(body_html), body_text=VALUES(body_text);

-- Inglés (en)
INSERT INTO email_template_translations (id, template_id, language, subject, preheader, body_html, body_text, is_active) VALUES
('trans_wallet_topup_en', 'wallet_topup_success', 'en',
 'Top-up confirmed: +{{amount}} {{currency}} in your DoorDrop Wallet',
 'Your available balance has been updated to {{newBalance}} {{currency}}.',
 '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f8fafc;padding:30px;color:#1e293b;">
 <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
   <h1 style="color:#0f172a;font-size:20px;margin-bottom:12px;">Wallet Top-up Successful</h1>
   <p style="font-size:14px;line-height:1.6;color:#475569;">Hello <strong>{{userName}}</strong>, your top-up of <strong>+{{amount}} {{currency}}</strong> via {{paymentMethod}} has been credited.</p>
   <div style="background:#ecfdf5;border:1px solid #a7f3d0;padding:16px;border-radius:12px;margin:20px 0;text-align:center;">
     <span style="font-size:12px;color:#047857;text-transform:uppercase;font-weight:bold;">New Available Balance</span>
     <div style="font-size:24px;font-weight:bold;color:#065f46;margin-top:4px;">{{newBalance}} {{currency}}</div>
   </div>
   <div style="text-align:center;margin:28px 0;">
     <a href="{{panelUrl}}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">View My Wallet</a>
   </div>
 </div></body></html>',
 'Hello {{userName}},\n\nTop-up of +{{amount}} {{currency}} confirmed.\nNew balance: {{newBalance}} {{currency}}.\n\nDoorDrop Finance.',
 1)
ON DUPLICATE KEY UPDATE subject=VALUES(subject), preheader=VALUES(preheader), body_html=VALUES(body_html), body_text=VALUES(body_text);
