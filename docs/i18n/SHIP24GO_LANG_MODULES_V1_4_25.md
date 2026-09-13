# Ship24Go V1.4.25 — Reglas de traducción por módulo

## Idiomas activos

Esta versión deja activos sólo estos idiomas:

- `es` — Español global
- `en` — English
- `it` — Italiano
- `fr` — Français
- `de` — Deutsch
- `zh` — 中文

No usar variantes regionales en esta fase. Si el usuario viene con `es-DO`, `es-ES`, `es-CO` o `es-EC`, el sistema lo normaliza a `es`.

## Estructura obligatoria

Toda traducción nueva debe vivir en `src/lang`.

```text
src/lang/moduleTranslations.ts          # llaves comerciales usadas por t()
src/lang/visibleText.ts                 # textos heredados que aún están escritos directo en componentes
src/lang/locales/es.json                # espejo completo por idioma
src/lang/locales/en.json
src/lang/locales/it.json
src/lang/locales/fr.json
src/lang/locales/de.json
src/lang/locales/zh.json
src/lang/modules/common.json            # traducción agrupada por módulo
src/lang/modules/customer.json
src/lang/modules/admin.json
src/lang/modules/stores.json
src/lang/modules/tickets.json
src/lang/modules/camera.json
src/lang/modules/settings.json
```

También se genera espejo en:

```text
src/i18n/locales/*.json
```

Esto permite que los diagnósticos detecten archivos reales de idioma.

## Regla para cada módulo

Cada pantalla o módulo nuevo debe declarar sus textos con una llave propia:

```tsx
const { t } = useI18n();

<h1>{t('stores.title')}</h1>
<p>{t('stores.subtitle')}</p>
<button>{t('stores.connect')}</button>
```

No escribir textos visibles directo dentro de componentes nuevos.

## Nombres de llaves por módulo

Usar este patrón:

```text
common.actions.save
common.empty.no_data
customer.dashboard.title
customer.quote.search_rates
customer.shipments.view_label
stores.connect
stores.sync
admin.integrations.title
tickets.create.title
camera.title
settings.language
```

## Textos heredados

Como el sistema tenía muchos textos escritos directamente dentro de `.tsx`, esta versión agrega una capa segura de traducción automática para textos visibles heredados:

```text
src/lib/autoTranslate.ts
src/lang/visibleText.ts
```

Esto permite traducir pantallas existentes sin tocar la lógica de proveedores, Ecart, cotización, labels, tracking ni pagos.

## Regla de interfaz

Nunca mostrar detalles técnicos al usuario. Usar textos comerciales:

- No hay registros todavía.
- No hay datos para mostrar.
- No fue posible completar la operación.
- Intenta nuevamente.
- La tienda fue conectada correctamente.
- La dirección necesita revisión.
- La etiqueta está en preparación.

Los detalles técnicos deben ir a `diagnostico`, logs o documentos internos.

## Checklist antes de aprobar una pantalla nueva

1. La pantalla usa `useI18n()`.
2. Todo texto visible usa `t('modulo.llave')`.
3. La llave existe en `es`, `en`, `it`, `fr`, `de`, `zh`.
4. No hay errores técnicos visibles en UI.
5. Modo oscuro y móvil siguen funcionando.
6. Se ejecutó el diagnóstico i18n.
