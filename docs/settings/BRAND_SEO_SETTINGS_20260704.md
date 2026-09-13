# Configuración de marca y SEO desde `/admin/settings`

## Qué se agregó

Se agregó una sección de **Marca y presencia pública** dentro de `/admin/settings` para que el Super Admin pueda cambiar desde el panel:

- Nombre comercial.
- Nombre corto para paneles.
- Frase principal.
- Logo.
- Favicon.
- Título público para buscadores.
- Descripción pública.
- Palabras clave.
- Color principal.

Estos valores se aplican en:

- Web pública.
- Login y registro.
- Panel de cliente.
- Panel de administración.
- SEO dinámico del navegador.
- Manifest PWA `/manifest.json`.
- Favicon y Apple touch icon.

## SQL usado

La configuración se guarda en la tabla existente `admin_settings`, dentro del campo JSON `settings_json`, bajo la clave `brand`.

Archivo nuevo para bases existentes:

```sql
migrations/V2__brand_seo_settings.sql
```

También se agregó el mismo bloque al patch seguro:

```sql
migrations/V1__safe_patch_existing_db.sql
```

Estructura guardada:

```json
{
  "brand": {
    "siteName": "Ship24go",
    "shortName": "Ship24go",
    "tagline": "Inteligencia en Envíos",
    "seoTitle": "Ship24go - Inteligencia en Envíos",
    "seoDescription": "La plataforma inteligente definitiva de envíos ecommerce.",
    "seoKeywords": "envíos ecommerce, logística, tracking, paquetería, cotizador de envíos",
    "logoUrl": "",
    "faviconUrl": "/icon.svg",
    "ogImageUrl": "",
    "themeColor": "#2563eb"
  }
}
```

## Archivos principales modificados

- `server.ts`
  - Lectura pública de marca: `/api/public/brand`.
  - Manifest dinámico: `/manifest.json`.
  - Guardado de marca desde `/api/admin/settings`.
  - Subida de logo/favicon como imágenes en `public/uploads/brand`.
  - Exposición pública de `/uploads`.

- `server/db/repos.ts`
  - `AdminSettingsRepo`.
  - Defaults de marca.
  - Compatibilidad SQL para instalaciones existentes.
  - Fallback al schema en `migrations/V1__production_schema.sql` si no existe `ship24go_mysql_full_schema.sql`.

- `src/lib/brand.tsx`
  - Contexto global de marca.
  - Actualización dinámica de título, meta tags, favicon y color principal.
  - Componente reutilizable `BrandMark`.

- `src/App.tsx`
  - `BrandProvider` global.

- `src/pages/AdminPanel.tsx`
  - Nueva sección de marca/SEO en `/admin/settings`.

- `src/pages/Landing.tsx`
- `src/pages/Public.tsx`
- `src/pages/Auth.tsx`
- `src/pages/CustomerPanel.tsx`
  - Uso dinámico de la marca en web, login, registro y panel cliente.

## Notas de despliegue

La carpeta `public/uploads/brand` debe quedar escribible por el proceso Node para permitir subir logo y favicon desde el panel.

Después de desplegar, ejecutar el patch SQL si la base ya existe:

```bash
mysql -u USER -p ship24go < migrations/V2__brand_seo_settings.sql
```

Luego compilar y reiniciar la app:

```bash
npm install
npm run build
pm2 restart ship24go
```

## Validación realizada

```bash
npm run lint
npm run build
```

Resultado: correcto.
