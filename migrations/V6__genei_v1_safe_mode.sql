-- Ship24Go V1.3.5 - Genei V1 modo seguro
-- No contiene credenciales reales.

INSERT INTO app_versions (version, name, description)
VALUES ('1.3.5', 'Genei V1 seguro', 'Cotización Genei V1, creación sandbox por defecto y bloqueo anti-gasto real.')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO providers (id, code, name, is_active, is_connected, margin_percent, currency, config_json, last_connection_status, last_connection_message)
VALUES (
  'prv_genei',
  'genei',
  'Genei',
  1,
  0,
  20.000,
  'EUR',
  JSON_OBJECT('apiMode','v1','createFunction','crear_envio_sandbox','allowRealCreate',false,'publicName','Logihub'),
  'not_tested',
  'Listo para validar'
)
ON DUPLICATE KEY UPDATE
  config_json = JSON_MERGE_PATCH(
    COALESCE(config_json, JSON_OBJECT()),
    JSON_OBJECT('apiMode','v1','createFunction','crear_envio_sandbox','allowRealCreate',false,'publicName','Logihub')
  ),
  updated_at = NOW();
