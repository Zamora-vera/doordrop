#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config({ override: true });

const outDir = path.join(process.cwd(), 'diagnostico');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
const file = path.join(outDir, `GLOBAL_I18N_PWA_DARK_V1_4_24_${stamp}.md`);

const exists = (p) => fs.existsSync(path.join(process.cwd(), p));
const read = (p) => exists(p) ? fs.readFileSync(path.join(process.cwd(), p), 'utf8') : '';
const files = [
  'src/lib/i18n.tsx',
  'src/lib/currency.tsx',
  'src/components/LanguageSelector.tsx',
  'src/pages/CustomerPanel.tsx',
  'src/pages/Stores.tsx',
  'src/index.css',
  'public/manifest.json',
  'public/sw.js',
  'dist/server.cjs'
];
const lines = [];
lines.push('# Diagnóstico Global — Ship24Go V1.4.24');
lines.push('');
lines.push(`Fecha: ${new Date().toISOString()}`);
lines.push('');
lines.push('## Archivos verificados');
for (const f of files) lines.push(`- ${exists(f) ? 'OK' : 'Pendiente'} — ${f}`);
lines.push('');
const i18n = read('src/lib/i18n.tsx');
const currency = read('src/lib/currency.tsx');
const css = read('src/index.css');
const sw = read('public/sw.js');
lines.push('## Cobertura');
lines.push(`- Idiomas base: ${['es-DO','es-ES','es-CO','es-EC','en','it','fr','de','zh','ht'].filter(x => i18n.includes(x)).length}/10`);
lines.push(`- Monedas principales: ${['DOP','EUR','USD','GBP','COP','CNY','HTG'].filter(x => currency.includes(x)).length}/7`);
lines.push(`- Modo oscuro con variables: ${css.includes('--ship-bg') && css.includes('[data-theme="dark"]') ? 'OK' : 'Pendiente'}`);
lines.push(`- PWA evita datos privados: ${sw.includes('/api/') && sw.includes('access_token') ? 'OK' : 'Revisar'}`);
lines.push('');
lines.push('## Revisión visual recomendada');
lines.push('- Abrir /panel/stores en modo claro y oscuro.');
lines.push('- Abrir /panel/settings y cambiar idioma, moneda y apariencia.');
lines.push('- Probar la PWA desde móvil o navegador con modo standalone.');
lines.push('- Revisar que las direcciones por corregir mantengan textos comerciales.');
lines.push('');
lines.push('## Nota');
lines.push('Esta versión no cambia el flujo de proveedores ni la compra de etiquetas. Sólo mejora idioma, moneda, PWA, responsive y modo oscuro.');
fs.writeFileSync(file, lines.join('\n'));
console.log(file);
