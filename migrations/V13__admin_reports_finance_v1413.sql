-- Ship24Go V1.4.13 - Admin reports financiero
-- No guarda credenciales ni modifica datos de clientes.

INSERT IGNORE INTO app_versions (version, name, description)
VALUES ('V1.4.13', 'Admin Reports Financiero', 'Vista tipo Excel para precios de compra, venta, descuentos, pagos, ganancias y pérdidas por envío.');

UPDATE admin_settings
SET settings_json = JSON_SET(
  COALESCE(settings_json, JSON_OBJECT()),
  '$.release_version', 'V1.4.13',
  '$.release_name', 'Admin Reports Financiero'
)
WHERE id = 1;
