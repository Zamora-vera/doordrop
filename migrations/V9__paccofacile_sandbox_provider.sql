-- Ship24Go V1.4.2 - Paccofacile sandbox provider
INSERT INTO app_versions (version, name, description)
VALUES ('1.4.2', 'Paccofacile Sandbox Provider', 'Cotización, guardado seguro, preparación de compra controlada, etiqueta y tracking Paccofacile en modo sandbox.')
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
    'publicName','Logihub',
    'primaryColor','#16a34a',
    'secondaryColor','#22c55e',
    'maxResults',10,
    'priority',30
  ),
  'not_tested',
  'Paccofacile listo para validar en sandbox'
)
ON DUPLICATE KEY UPDATE
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
      'publicName','Logihub',
      'primaryColor','#16a34a',
      'secondaryColor','#22c55e',
      'maxResults',10,
      'priority',30
    )
  ),
  updated_at = NOW();
