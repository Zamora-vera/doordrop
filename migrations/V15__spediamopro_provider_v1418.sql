-- Ship24Go V1.4.18 - SpediamoPro API v2
-- Integra SpediamoPro como proveedor normal del flujo Ship24Go.

INSERT INTO providers (id, code, name, is_active, is_connected, margin_percent, currency, config_json, last_connection_status, last_connection_message)
VALUES (
  'prv_spediamopro',
  'spediamopro',
  'SpediamoPro',
  1,
  0,
  20.000,
  'EUR',
  JSON_OBJECT(
    'mode','production',
    'baseUrl','https://core.spediamopro.com/api/v2',
    'stagingBaseUrl','https://core.spediamopro.it/api/v2',
    'allowRealBuy', true,
    'publicName','Logihub',
    'primaryColor','#4f46e5',
    'secondaryColor','#06b6d4',
    'maxResults',10,
    'priority',22
  ),
  'not_tested',
  'SpediamoPro listo para validar saldo, cotizaciones y etiquetas'
)
ON DUPLICATE KEY UPDATE
  is_active = 1,
  currency = 'EUR',
  config_json = JSON_MERGE_PATCH(
    COALESCE(config_json, JSON_OBJECT()),
    JSON_OBJECT(
      'mode','production',
      'baseUrl','https://core.spediamopro.com/api/v2',
      'stagingBaseUrl','https://core.spediamopro.it/api/v2',
      'allowRealBuy', true,
      'publicName','Logihub',
      'primaryColor','#4f46e5',
      'secondaryColor','#06b6d4',
      'maxResults',10,
      'priority',22
    )
  ),
  updated_at = NOW();

INSERT IGNORE INTO app_versions (version, name, description)
VALUES ('V1.4.18', 'SpediamoPro API v2', 'Integra SpediamoPro con OAuth Authcode, cotizaciones, aceptación de tarifa, etiqueta, tracking, saldo y puntos PUDO.');

INSERT IGNORE INTO admin_settings (id, settings_json) VALUES (1, JSON_OBJECT());
UPDATE admin_settings
SET settings_json = JSON_SET(
  COALESCE(settings_json, JSON_OBJECT()),
  '$.release_version', 'V1.4.18',
  '$.release_name', 'SpediamoPro API v2'
)
WHERE id = 1;
