-- Ship24Go V1.4.3 - Paccofacile test mode visible and sandbox lab
INSERT INTO app_versions (version, name, description)
VALUES ('1.4.3', 'Paccofacile Test Mode', 'Proveedor visible en Super Admin, prueba completa sandbox con guardado, compra de prueba, tracking y etiqueta sin compra real live.')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO providers (id, code, name, is_active, is_connected, margin_percent, currency, config_json, last_connection_status, last_connection_message)
VALUES (
  'prv_paccofacile',
  'paccofacile',
  'Paccofacile',
  1,
  0,
  20.000,
  'EUR',
  JSON_OBJECT(
    'mode','sandbox',
    'baseUrl','https://paccofacile.tecnosogima.cloud/sandbox',
    'liveBaseUrl','https://paccofacile.tecnosogima.cloud/live',
    'apiVersion','v1',
    'allowRealBuy', false,
    'testMode', true,
    'publicName','Logihub',
    'primaryColor','#16a34a',
    'secondaryColor','#22c55e',
    'maxResults',10,
    'priority',30
  ),
  'not_tested',
  'Paccofacile listo para prueba sandbox completa'
)
ON DUPLICATE KEY UPDATE
  name = 'Paccofacile',
  is_active = 1,
  margin_percent = COALESCE(margin_percent, 20.000),
  currency = 'EUR',
  config_json = JSON_MERGE_PATCH(
    COALESCE(config_json, JSON_OBJECT()),
    JSON_OBJECT(
      'mode','sandbox',
      'baseUrl','https://paccofacile.tecnosogima.cloud/sandbox',
      'liveBaseUrl','https://paccofacile.tecnosogima.cloud/live',
      'apiVersion','v1',
      'allowRealBuy', false,
      'testMode', true,
      'publicName','Logihub',
      'primaryColor','#16a34a',
      'secondaryColor','#22c55e',
      'maxResults',10,
      'priority',30
    )
  ),
  last_connection_message = COALESCE(last_connection_message, 'Paccofacile listo para prueba sandbox completa'),
  updated_at = NOW();
