-- Ship24Go V1.4.21 - EasyPost etiquetas de prueba
-- Permite emitir etiquetas EasyPost en modo test sin activar compras de producción.

UPDATE providers
SET config_json = JSON_MERGE_PATCH(
  COALESCE(config_json, JSON_OBJECT()),
  JSON_OBJECT(
    'mode','test',
    'allowRealBuy', false,
    'allowTestLabels', true,
    'webhookUrl','https://ship24go.com/api/webhooks/easypost'
  )
),
last_connection_status = CASE WHEN last_connection_status = 'failed' THEN 'not_tested' ELSE last_connection_status END,
updated_at = NOW()
WHERE code = 'easypost';

INSERT IGNORE INTO app_versions (version, name, description)
VALUES ('V1.4.21', 'EasyPost etiquetas de prueba', 'Habilita generación de etiquetas EasyPost en modo test, conserva producción bloqueada y agrega comando diagnóstico con PDF de prueba.');

INSERT IGNORE INTO admin_settings (id, settings_json) VALUES (1, JSON_OBJECT());
UPDATE admin_settings
SET settings_json = JSON_SET(
  COALESCE(settings_json, JSON_OBJECT()),
  '$.release_version', 'V1.4.21',
  '$.release_name', 'EasyPost etiquetas de prueba'
)
WHERE id = 1;
