const fs = require('fs');
const path = require('path');

const root = process.cwd();
const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);

const files = [
  'src/lang/runtimeTextTranslator.ts',
  'src/main.tsx',
  'src/lib/i18n.tsx',
  'docs/i18n/SHIP24GO_LANG_RUNTIME_CLEANUP_V1_4_26.md',
];

const lines = [];
lines.push('# Ship24Go — Diagnóstico Lang Runtime V1.4.26');
lines.push('');
lines.push(`Fecha: ${now.toISOString()}`);
lines.push('');
lines.push('## Archivos esperados');
lines.push('');
for (const f of files) {
  const p = path.join(root, f);
  lines.push(`- ${fs.existsSync(p) ? 'OK' : 'Pendiente'} — ${f}`);
}

let runtimeCount = 0;
try {
  const content = fs.readFileSync(path.join(root, 'src/lang/runtimeTextTranslator.ts'), 'utf8');
  runtimeCount = (content.match(/\{\n\s+es:/g) || []).length;
} catch {}

lines.push('');
lines.push('## Resumen');
lines.push('');
lines.push(`- Entradas de traducción visible: ${runtimeCount}`);
lines.push('- Idiomas activos: es, en, it, fr, de, zh');
lines.push('- Estado esperado: panel sin mezcla visible de español/italiano/inglés al cambiar idioma.');
lines.push('');
lines.push('## Revisión manual sugerida');
lines.push('');
lines.push('- /panel/quote');
lines.push('- /panel/shipments');
lines.push('- /panel/stores');
lines.push('- /panel/settings');
lines.push('- /panel/tickets');
lines.push('- /panel/ai');
lines.push('');
lines.push('## Regla de continuidad');
lines.push('');
lines.push('Cada módulo nuevo debe agregar textos en lang antes de mostrarse en la interfaz.');

fs.mkdirSync(path.join(root, 'diagnostico'), { recursive: true });
const out = path.join(root, 'diagnostico', `LANG_RUNTIME_V1_4_26_${stamp}.md`);
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log(out);
