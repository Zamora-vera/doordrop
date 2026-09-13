-- Ship24Go · LogiHub Internacional (DO → mundo)
INSERT INTO providers (
  id, code, name, is_active, is_connected, margin_percent, currency, config_json,
  last_connection_status, last_connection_message
) VALUES (
  'prv_logihub_intl',
  'logihub_intl',
  'LogiHub Internacional',
  1,
  0,
  10.000,
  'DOP',
  JSON_OBJECT(
    'baseUrl', 'https://my.logihub.tech/api/v2',
    'publicName', 'Logihub',
    'logoUrl', 'https://logihub.tech/docs/v2/images/logo.png',
    'allowRealBuy', true,
    'originCountry', 'DO',
    'scope', 'international_do_only',
    'priority', 12,
    'maxResults', 4,
    'primaryColor', '#0ea5e9',
    'secondaryColor', '#0369a1'
  ),
  'not_tested',
  'LogiHub Internacional listo (origen DO). Configura LOGIHUB_API_KEY.'
)
ON DUPLICATE KEY UPDATE
  is_active = 1,
  name = VALUES(name),
  currency = 'DOP',
  config_json = JSON_MERGE_PATCH(COALESCE(config_json, JSON_OBJECT()), JSON_OBJECT(
    'baseUrl', 'https://my.logihub.tech/api/v2',
    'publicName', 'Logihub',
    'logoUrl', 'https://logihub.tech/docs/v2/images/logo.png',
    'originCountry', 'DO',
    'priority', 12
  )),
  updated_at = NOW();
