const fs = require('fs');
const path = require('path');
const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join(root, 'diagnostico');
fs.mkdirSync(outDir, { recursive: true });
const files = [
  'src/lang/runtimeTextTranslator.ts',
  'src/lib/i18n.tsx',
  'src/pages/CustomerPanel.tsx',
  'src/components/CustomerTickets.tsx',
  'src/components/AiCopilotChat.tsx',
];
const checks = [
  'Copiloto AI (SQL)',
  'AI Copilot (SQL)',
  'Copilota IA (SQL)',
  'Copilote IA (SQL)',
  'KI-Copilot (SQL)',
  'Resuelve tus consultas logísticas con soporte inteligente.',
  'Volver a Cotizaciones',
  'PUNTOS AUTORIZADOS',
  'SERVICE SUMMARY',
  'Mis envíos',
  'Visión General',
];
const lines = [];
lines.push('# Ship24Go — Diagnóstico Lang Runtime V1.4.27');
lines.push('');
lines.push(`Fecha: ${new Date().toISOString()}`);
lines.push('');
for (const file of files) {
  const full = path.join(root, file);
  const content = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  lines.push(`## ${file}`);
  lines.push(fs.existsSync(full) ? 'Archivo encontrado.' : 'Archivo no encontrado.');
  for (const check of checks) {
    lines.push(`- ${check}: ${content.includes(check) ? 'presente' : 'no encontrado'}`);
  }
  lines.push('');
}
lines.push('## Resultado esperado');
lines.push('La interfaz no debe mostrar sufijo (SQL) en el nombre comercial del copiloto.');
lines.push('Los textos principales del dashboard, cotización, envíos, settings y tickets deben traducirse según idioma activo.');
const out = path.join(outDir, `LANG_RUNTIME_V1_4_27_${stamp}.md`);
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log(out);
