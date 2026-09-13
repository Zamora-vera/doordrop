-- Ship24Go / EnvioX - configuración central de marca y SEO
-- Ejecutar una sola vez en bases existentes. Es seguro volver a ejecutarlo.
USE ship24go;

CREATE TABLE IF NOT EXISTS admin_settings (
  id INT PRIMARY KEY,
  settings_json JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO admin_settings (id, settings_json) VALUES (1, JSON_OBJECT());

UPDATE admin_settings
SET settings_json = JSON_SET(
  COALESCE(settings_json, JSON_OBJECT()),
  '$.brand',
  COALESCE(
    JSON_EXTRACT(settings_json, '$.brand'),
    JSON_OBJECT(
      'siteName', 'Ship24go',
      'shortName', 'Ship24go',
      'tagline', 'Inteligencia en Envíos',
      'seoTitle', 'Ship24go - Inteligencia en Envíos',
      'seoDescription', 'La plataforma inteligente definitiva de envíos ecommerce.',
      'seoKeywords', 'envíos ecommerce, logística, tracking, paquetería, cotizador de envíos',
      'logoUrl', '',
      'faviconUrl', '/icon.svg',
      'ogImageUrl', '',
      'themeColor', '#2563eb'
    )
  )
)
WHERE id = 1;
