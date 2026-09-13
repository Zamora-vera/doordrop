-- Ship24Go V1.4.9 - SpedirePro + saldos de proveedores
-- No incluye credenciales: el instalador actualiza .env de forma privada.

INSERT INTO providers (id, code, name, is_active, is_connected, margin_percent, currency, config_json, last_connection_status, last_connection_message)
VALUES (
  'prv_spedirepro',
  'spedirepro',
  'SpedirePro',
  1,
  0,
  20.000,
  'EUR',
  JSON_OBJECT(
    'baseUrl','https://www.spedirepro.com/public-api',
    'allowRealBuy', true,
    'publicName','Logihub',
    'primaryColor','#7c3aed',
    'secondaryColor','#a855f7',
    'maxResults',10,
    'priority',25
  ),
  'not_tested',
  'SpedirePro listo para validar saldo y etiquetas'
)
ON DUPLICATE KEY UPDATE
  is_active = 1,
  currency = 'EUR',
  config_json = JSON_MERGE_PATCH(
    COALESCE(config_json, JSON_OBJECT()),
    JSON_OBJECT(
      'baseUrl','https://www.spedirepro.com/public-api',
      'allowRealBuy', true,
      'publicName','Logihub',
      'primaryColor','#7c3aed',
      'secondaryColor','#a855f7',
      'maxResults',10,
      'priority',25
    )
  ),
  updated_at = NOW();

UPDATE providers
SET is_active = 1,
    currency = 'EUR',
    config_json = JSON_MERGE_PATCH(
      COALESCE(config_json, JSON_OBJECT()),
      JSON_OBJECT(
        'mode','live',
        'baseUrl','https://paccofacile.tecnosogima.cloud/live',
        'liveBaseUrl','https://paccofacile.tecnosogima.cloud/live',
        'sandboxBaseUrl','https://paccofacile.tecnosogima.cloud/sandbox',
        'apiVersion','v1',
        'allowRealBuy', true,
        'publicName','Logihub',
        'primaryColor','#16a34a',
        'secondaryColor','#22c55e',
        'maxResults',10,
        'priority',30
      )
    ),
    last_connection_status = CASE WHEN last_connection_status = 'failed' THEN 'not_tested' ELSE last_connection_status END,
    last_connection_message = 'Paccofacile configurado para producción',
    updated_at = NOW()
WHERE code = 'paccofacile';

INSERT IGNORE INTO app_versions (version, name, description)
VALUES ('V1.4.9', 'SpedirePro y saldos de proveedores', 'Integra SpedirePro con cotización, etiqueta, tracking, webhooks y saldos visibles en administración. Paccofacile queda preparado para producción.');

INSERT IGNORE INTO admin_settings (id, settings_json) VALUES (1, JSON_OBJECT());

UPDATE admin_settings
SET settings_json = JSON_SET(
  COALESCE(settings_json, JSON_OBJECT()),
  '$.release_version', 'V1.4.9',
  '$.release_name', 'SpedirePro y saldos de proveedores'
)
WHERE id = 1;
