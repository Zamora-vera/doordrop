# Ship24Go V1.4.26 — Limpieza real de traducciones visibles

## Objetivo

Esta versión corrige los textos mezclados que todavía aparecían en el panel después de activar idiomas globales.

Idiomas activos:

- `es` — Español global
- `en` — English
- `it` — Italiano
- `fr` — Français
- `de` — Deutsch
- `zh` — 中文

## Problema detectado

Varias pantallas seguían mezclando textos visibles en español, italiano e inglés porque algunos módulos todavía tenían textos escritos directamente en componentes.

Módulos afectados:

- Panel del cliente
- Cotización
- Detalles de remitente y destinatario
- Datos aduanales
- Mis envíos
- Tiendas ecommerce
- Facturación y saldo
- Soporte y tickets
- Copiloto AI
- Selector de país y moneda

## Solución aplicada

Se agregó una capa de limpieza visible:

```text
src/lang/runtimeTextTranslator.ts
```

Esta capa traduce textos visibles que todavía no fueron migrados a llaves `lang`.

No toca:

- Proveedores
- Ecart API
- Compra de etiquetas
- Wallet
- Tracking
- Base de datos
- Rutas API
- Consultas internas
- Logs técnicos

## Regla para nuevos módulos

Todo módulo nuevo debe tener sus textos en idioma antes de mostrarse en UI.

Formato recomendado:

```ts
// src/lang/modules/quote.ts
export const quoteLang = {
  es: {
    title: 'Crear nueva expedición',
  },
  en: {
    title: 'Create New Shipment',
  },
  it: {
    title: 'Crea nuova spedizione',
  },
  fr: {
    title: 'Créer un nouvel envoi',
  },
  de: {
    title: 'Neue Sendung erstellen',
  },
  zh: {
    title: '创建新运单',
  },
};
```

## Prohibido en UI

No escribir textos visibles directo en componentes como:

```tsx
<h1>Crear nueva expedición</h1>
<button>Buscar tarifas</button>
<p>No hay datos para mostrar</p>
```

Debe usarse traducción:

```tsx
<h1>{t('quote.title')}</h1>
<button>{t('quote.searchRates')}</button>
<p>{t('common.empty')}</p>
```

## Textos técnicos

Los textos técnicos no van en la interfaz. Deben ir a diagnóstico, logs o README.

En UI usar textos comerciales:

- No hay registros todavía.
- No hay datos para mostrar.
- No fue posible completar la operación.
- La dirección necesita revisión.
- La etiqueta está en preparación.
- La tienda fue conectada correctamente.

## Diagnóstico recomendado

Después de instalar, ejecutar:

```bash
cd /www/wwwroot/ship24go.com
node scripts/diagnostico-lang-runtime-v1.4.26.cjs
```

El diagnóstico se genera en:

```text
diagnostico/LANG_RUNTIME_V1_4_26_*.md
```
