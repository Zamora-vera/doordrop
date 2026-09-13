const fs = require('fs');
const path = require('path');

const root = process.cwd();
const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);

const targetLocales = ['es', 'en', 'it', 'fr', 'zh', 'de'];
const localeNames = {
  es: 'Español global',
  en: 'English',
  it: 'Italiano',
  fr: 'Français',
  zh: '中文',
  de: 'Deutsch',
};

const ignoredDirs = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  'vendor',
  'storage',
  'cache',
  'logs',
  'diagnostico',
]);

const sourceExts = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.vue',
  '.svelte',
  '.html',
  '.php',
]);

const localeCandidates = [
  'src/i18n/locales',
  'frontend/src/i18n/locales',
  'client/src/i18n/locales',
  'resources/js/i18n/locales',
  'app/i18n/locales',
  'locales',
  'public/locales',
];

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return { __read_error: String(e.message || e) };
  }
}

function flatten(obj, prefix = '', out = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const nk = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, nk, out);
    } else {
      out[nk] = v;
    }
  }
  return out;
}

function walk(dir, files = []) {
  if (!exists(dir)) return files;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return files; }

  for (const e of entries) {
    if (ignoredDirs.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function rel(p) {
  return path.relative(root, p).replace(/\\/g, '/');
}

function isProbablyHumanText(s) {
  if (!s) return false;
  let t = String(s).trim();

  if (t.length < 3 || t.length > 180) return false;
  if (/^https?:\/\//i.test(t)) return false;
  if (/^[A-Z0-9_./:-]+$/.test(t)) return false;
  if (/^[a-z0-9_.:-]+$/.test(t) && !t.includes(' ')) return false;
  if (/[{}<>()[\]=]/.test(t) && t.length < 30) return false;
  if (/\.(png|jpg|jpeg|svg|webp|css|js|json|pdf|zip)$/i.test(t)) return false;
  if (/^(GET|POST|PUT|PATCH|DELETE|Bearer|Content-Type)$/i.test(t)) return false;
  if (/^(true|false|null|undefined)$/i.test(t)) return false;

  return /[A-Za-zÀ-ÿ\u4e00-\u9fff]/.test(t);
}

function hasSpanishWords(s) {
  return /\b(conectar|tienda|pedido|pedidos|env[ií]o|env[ií]os|etiqueta|cotizar|cliente|clientes|direcci[oó]n|direcciones|facturaci[oó]n|saldo|soporte|integraciones|resumen|actualizar|volver|crear|guardar|cancelar|continuar|revisar|pa[ií]s|moneda|idioma|apariencia|oscuro|claro|autom[aá]tico|no fue posible|intenta nuevamente|no hay|datos|registros|sucursal|ubicaci[oó]n)\b/i.test(s)
    || /[áéíóúñÁÉÍÓÚÑ¿¡]/.test(s);
}

function hasEnglishWords(s) {
  return /\b(connect|store|stores|order|orders|shipment|shipments|label|tracking|customer|customers|address|addresses|billing|balance|support|settings|dashboard|create|save|cancel|continue|review|country|currency|language|dark|light|automatic|try again|no data|no records)\b/i.test(s);
}

function normalizeText(s) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

function collectLocaleFiles() {
  const foundDirs = localeCandidates
    .map(d => path.join(root, d))
    .filter(exists);

  const result = {};
  for (const locale of targetLocales) {
    result[locale] = {
      file: null,
      data: {},
      flat: {},
      error: null,
    };
  }

  for (const dir of foundDirs) {
    for (const locale of targetLocales) {
      const candidates = [
        path.join(dir, `${locale}.json`),
        path.join(dir, locale, 'common.json'),
        path.join(dir, locale, 'translation.json'),
      ];

      for (const file of candidates) {
        if (exists(file) && !result[locale].file) {
          const data = readJson(file);
          result[locale].file = file;
          if (data.__read_error) result[locale].error = data.__read_error;
          else {
            result[locale].data = data;
            result[locale].flat = flatten(data);
          }
        }
      }
    }
  }

  return { foundDirs, result };
}

function collectSourceTexts() {
  const files = walk(root).filter(f => sourceExts.has(path.extname(f)));
  const findings = [];

  const stringRegex = /(['"`])((?:\\.|(?!\1).){3,180})\1/g;
  const jsxTextRegex = />\s*([^<>{}\n][^<>{}]{2,180})\s*</g;

  for (const file of files) {
    let content = '';
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }

    if (content.length > 900000) continue;

    const lines = content.split(/\r?\n/);

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      if (!trimmed) return;
      if (/^(import|export)\s/.test(trimmed)) return;
      if (/class(Name)?=|style=|href=|src=|to=|from=|path=|id=/.test(trimmed) && trimmed.length < 250) {
        if (!hasSpanishWords(trimmed) && !hasEnglishWords(trimmed)) return;
      }

      let m;
      while ((m = stringRegex.exec(line)) !== null) {
        const text = normalizeText(m[2]);
        if (!isProbablyHumanText(text)) continue;
        if (!hasSpanishWords(text) && !hasEnglishWords(text)) continue;

        findings.push({
          file: rel(file),
          line: idx + 1,
          text,
          type: hasSpanishWords(text) ? 'posible español fijo' : 'posible inglés fijo',
        });
      }

      while ((m = jsxTextRegex.exec(line)) !== null) {
        const text = normalizeText(m[1]);
        if (!isProbablyHumanText(text)) continue;
        if (!hasSpanishWords(text) && !hasEnglishWords(text)) continue;

        findings.push({
          file: rel(file),
          line: idx + 1,
          text,
          type: hasSpanishWords(text) ? 'posible español fijo' : 'posible inglés fijo',
        });
      }
    });
  }

  const unique = [];
  const seen = new Set();

  for (const item of findings) {
    const key = `${item.file}:${item.line}:${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function isIgnorableSameValue(v) {
  const s = normalizeText(v);
  if (!s) return true;
  if (s.length <= 2) return true;
  if (/^(Ship24Go|Logihub|Ecart API|Shopify|WooCommerce|PrestaShop|Amazon|eBay|UPS|DHL|FedEx|GLS|BRT|SDA)$/i.test(s)) return true;
  if (/^[0-9., €$%+-]+$/.test(s)) return true;
  if (/^https?:\/\//i.test(s)) return true;
  return false;
}

const { foundDirs, result: locales } = collectLocaleFiles();

const base = locales.es.flat || {};
const allKeys = new Set();

for (const locale of targetLocales) {
  for (const k of Object.keys(locales[locale].flat || {})) allKeys.add(k);
}

for (const k of Object.keys(base)) allKeys.add(k);

const localeReport = {};

for (const locale of targetLocales) {
  const flat = locales[locale].flat || {};
  const missing = [];
  const empty = [];
  const sameAsEs = [];
  const suspiciousSpanish = [];
  const suspiciousEnglish = [];

  for (const key of Array.from(allKeys).sort()) {
    const v = flat[key];

    if (typeof v === 'undefined') {
      missing.push(key);
      continue;
    }

    if (typeof v === 'string' && !normalizeText(v)) {
      empty.push(key);
      continue;
    }

    if (locale !== 'es' && typeof v === 'string' && typeof base[key] === 'string') {
      if (normalizeText(v) === normalizeText(base[key]) && !isIgnorableSameValue(v)) {
        sameAsEs.push({ key, value: normalizeText(v) });
      }

      if (hasSpanishWords(v)) {
        suspiciousSpanish.push({ key, value: normalizeText(v) });
      }
    }

    if (locale !== 'en' && locale !== 'es' && typeof v === 'string' && hasEnglishWords(v)) {
      suspiciousEnglish.push({ key, value: normalizeText(v) });
    }
  }

  localeReport[locale] = {
    totalKeys: Object.keys(flat).length,
    missing,
    empty,
    sameAsEs,
    suspiciousSpanish,
    suspiciousEnglish,
  };
}

const hardcoded = collectSourceTexts();

const byFile = {};
for (const h of hardcoded) {
  byFile[h.file] = (byFile[h.file] || 0) + 1;
}

const worstFiles = Object.entries(byFile)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 40);

const md = [];

md.push(`# Ship24Go — Diagnóstico FULL de traducciones`);
md.push(``);
md.push(`**Fecha:** ${now.toISOString()}`);
md.push(`**Objetivo:** detectar textos pendientes para traducción completa del sistema.`);
md.push(``);
md.push(`## Idiomas objetivo`);
md.push(``);
for (const l of targetLocales) md.push(`- ${l}: ${localeNames[l]}`);
md.push(``);
md.push(`## Carpetas de traducción encontradas`);
md.push(``);
if (foundDirs.length) {
  for (const d of foundDirs) md.push(`- ${rel(d)}`);
} else {
  md.push(`No se encontraron carpetas comunes de traducción. El sistema puede tener textos directos en componentes.`);
}
md.push(``);
md.push(`## Resumen por idioma`);
md.push(``);
md.push(`| Idioma | Archivo | Llaves | Faltantes | Vacías | Iguales al español | Posible español dentro | Posible inglés dentro |`);
md.push(`|---|---:|---:|---:|---:|---:|---:|---:|`);

for (const l of targetLocales) {
  const r = localeReport[l];
  const file = locales[l].file ? rel(locales[l].file) : 'No encontrado';
  md.push(`| ${l} | ${file} | ${r.totalKeys} | ${r.missing.length} | ${r.empty.length} | ${r.sameAsEs.length} | ${r.suspiciousSpanish.length} | ${r.suspiciousEnglish.length} |`);
}

md.push(``);
md.push(`## Archivos con más textos fijos detectados`);
md.push(``);
if (!worstFiles.length) {
  md.push(`No se detectaron textos fijos evidentes.`);
} else {
  md.push(`| Archivo | Cantidad aproximada |`);
  md.push(`|---|---:|`);
  for (const [file, count] of worstFiles) md.push(`| ${file} | ${count} |`);
}

md.push(``);
md.push(`## Detalle por idioma`);
md.push(``);

for (const l of targetLocales) {
  const r = localeReport[l];

  md.push(`### ${l} — ${localeNames[l]}`);
  md.push(``);
  md.push(`Archivo: ${locales[l].file ? rel(locales[l].file) : 'No encontrado'}`);
  if (locales[l].error) md.push(`Lectura: no fue posible leer el archivo de idioma.`);
  md.push(``);

  md.push(`#### Llaves faltantes`);
  if (!r.missing.length) md.push(`Sin faltantes detectados.`);
  else r.missing.slice(0, 300).forEach(k => md.push(`- ${k}`));
  if (r.missing.length > 300) md.push(`- ... y ${r.missing.length - 300} más.`);
  md.push(``);

  md.push(`#### Valores vacíos`);
  if (!r.empty.length) md.push(`Sin valores vacíos detectados.`);
  else r.empty.slice(0, 200).forEach(k => md.push(`- ${k}`));
  if (r.empty.length > 200) md.push(`- ... y ${r.empty.length - 200} más.`);
  md.push(``);

  if (l !== 'es') {
    md.push(`#### Posibles textos sin traducir`);
    const combined = [
      ...r.sameAsEs.map(x => ({ ...x, reason: 'igual al español' })),
      ...r.suspiciousSpanish.map(x => ({ ...x, reason: 'contiene español' })),
      ...r.suspiciousEnglish.map(x => ({ ...x, reason: 'contiene inglés' })),
    ];

    const seen = new Set();
    const clean = [];
    for (const x of combined) {
      const key = `${x.key}:${x.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      clean.push(x);
    }

    if (!clean.length) md.push(`Sin textos sospechosos detectados.`);
    else clean.slice(0, 300).forEach(x => md.push(`- ${x.key}: "${x.value}" (${x.reason})`));
    if (clean.length > 300) md.push(`- ... y ${clean.length - 300} más.`);
    md.push(``);
  }
}

md.push(`## Textos fijos en archivos del sistema`);
md.push(``);
md.push(`Estos textos probablemente deben moverse a llaves de traducción.`);
md.push(``);

if (!hardcoded.length) {
  md.push(`No se detectaron textos fijos evidentes.`);
} else {
  hardcoded.slice(0, 500).forEach(h => {
    md.push(`- ${h.file}:${h.line} — ${h.type}: "${h.text}"`);
  });
  if (hardcoded.length > 500) md.push(`- ... y ${hardcoded.length - 500} más.`);
}

md.push(``);
md.push(`## Recomendación de implementación`);
md.push(``);
md.push(`1. Usar "es" como idioma base global.`);
md.push(`2. Mantener sólo estos idiomas activos por ahora: es, en, it, fr, zh, de.`);
md.push(`3. Mover todos los textos visibles a llaves de traducción.`);
md.push(`4. No mostrar detalles técnicos en la interfaz.`);
md.push(`5. Usar textos comerciales para estados vacíos, conexión, errores y alertas.`);
md.push(`6. Después de traducir, repetir este diagnóstico hasta que faltantes y textos fijos bajen a cero.`);
md.push(``);
md.push(`## Próxima versión sugerida`);
md.push(``);
md.push(`Ship24Go V1.4.25 — Full Translation Audit & Complete i18n`);
md.push(``);
md.push(`Objetivo: traducción completa real de web, panel cliente, super admin, integraciones, ecommerce stores, envíos, cotización, facturación, soporte, PWA y modo oscuro.`);

const out = path.join(root, 'diagnostico', `I18N_FULL_AUDIT_${stamp}.md`);
fs.writeFileSync(out, md.join('\n'), 'utf8');

console.log('');
console.log('Diagnóstico generado:');
console.log(out);
console.log('');
console.log('Resumen:');
for (const l of targetLocales) {
  const r = localeReport[l];
  console.log(`${l}: keys=${r.totalKeys}, missing=${r.missing.length}, empty=${r.empty.length}, same_es=${r.sameAsEs.length}, spanish=${r.suspiciousSpanish.length}, english=${r.suspiciousEnglish.length}`);
}
console.log(`hardcoded=${hardcoded.length}`);
console.log('');
