const fs = require('fs');
const path = require('path');
require('dotenv').config();

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'diagnostico');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(outDir, `SHIP24GO_GENEI_V1_SAFE_${stamp}.md`);

const user = process.env.GENEI_V1_USER;
const pass = process.env.GENEI_V1_PASSWORD;
const base = (process.env.GENEI_V1_BASE_URL || 'https://v1.genei.es/json_interface').replace(/\/$/, '');

function mask(value) {
  return JSON.stringify(value, null, 2)
    .replaceAll(user || '', '********')
    .replaceAll(pass || '', '********');
}

async function post(fn, payload = {}) {
  const response = await fetch(`${base}/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      usuario_servicio: user,
      password_servicio: pass,
      servicio: 'api'
    })
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { httpStatus: response.status, response: data };
}

(async () => {
  let md = `# Ship24Go - Genei V1 prueba segura\n\nFecha: ${new Date().toISOString()}\n\n`;
  md += `## Seguridad\n\nNo se ejecuta creación de envío real. Sólo valida cuenta, saldo y cotización.\n\n`;

  if (!user || !pass) {
    md += `## Resultado\n\nCredenciales pendientes en .env.\n`;
    fs.writeFileSync(out, md);
    console.log(out);
    process.exit(0);
  }

  const id = await post('obtener_id_usuario');
  md += `## obtener_id_usuario\n\n\`\`\`json\n${mask(id)}\n\`\`\`\n\n`;

  const saldo = await post('obtener_saldo');
  md += `## obtener_saldo\n\n\`\`\`json\n${mask(saldo)}\n\`\`\`\n\n`;

  const quote = await post('obtener_listado_agencias_precios', {
    array_bultos: [[], { peso: '1', largo: '10', ancho: '10', alto: '10' }],
    codigos_origen: '28001',
    poblacion_salida: 'MADRID',
    iso_pais_salida: 'ES',
    codigos_destino: '08015',
    poblacion_llegada: 'BARCELONA',
    iso_pais_llegada: 'ES',
    cod_promo: ''
  });
  md += `## Cotización segura Madrid → Barcelona\n\n\`\`\`json\n${mask(quote)}\n\`\`\`\n\n`;

  fs.writeFileSync(out, md);
  console.log(out);
})().catch((error) => {
  fs.writeFileSync(out, `# Ship24Go - Genei V1 prueba segura\n\nNo se pudo completar la prueba: ${error.message || error}\n`);
  console.log(out);
  process.exit(1);
});
