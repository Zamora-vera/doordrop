#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config({ override: true });

const root = process.cwd();
const diagDir = path.join(root, 'diagnostico');
fs.mkdirSync(diagDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const mdPath = path.join(diagDir, `EASYPOST_TEST_LABEL_V1_4_21_${stamp}.md`);
const pdfPath = path.join(diagDir, `easypost_test_label_${stamp}.pdf`);

function mask(v){ return v ? `${v.slice(0,6)}...${v.slice(-6)}` : 'No configurada'; }
function isTruthy(v){ return ['1','true','yes','si','sí','on'].includes(String(v || '').trim().toLowerCase()); }
function writeMd(lines){ fs.writeFileSync(mdPath, lines.join('\n'), 'utf8'); }
async function ep(method, endpoint, body){
  const key = process.env.EASYPOST_TEST_API_KEY || process.env.EASYPOST_API_KEY || process.env.EASYPOST_KEY || '';
  if (!key) throw new Error('EasyPost no tiene clave configurada.');
  const base = (process.env.EASYPOST_BASE_URL || 'https://api.easypost.com/v2').replace(/\/$/, '');
  const res = await fetch(`${base}/${endpoint.replace(/^\/+/, '')}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json, text };
}
function chooseRate(rates){
  const list = Array.isArray(rates) ? rates : [];
  return list
    .filter(r => r && r.id && Number.isFinite(Number(r.rate)))
    .sort((a,b)=>Number(a.rate)-Number(b.rate))[0] || list[0];
}
(async()=>{
  const key = process.env.EASYPOST_TEST_API_KEY || process.env.EASYPOST_API_KEY || process.env.EASYPOST_KEY || '';
  const mode = String(process.env.EASYPOST_MODE || 'test').toLowerCase();
  const allowTest = isTruthy(process.env.EASYPOST_ALLOW_TEST_LABELS || 'true');
  const allowLive = isTruthy(process.env.EASYPOST_ALLOW_REAL_BUY || 'false');
  const lines = [
    '# EasyPost test label V1.4.21',
    '',
    `- Fecha: ${new Date().toISOString()}`,
    `- Modo: ${mode}`,
    `- Key: ${mask(key)}`,
    `- Etiquetas test: ${allowTest ? 'activadas' : 'no activadas'}`,
    `- Producción: ${allowLive ? 'activada' : 'bloqueada'}`,
    ''
  ];
  if (!key.startsWith('EZTK')) {
    lines.push('Resultado: no se ejecutó la prueba porque la clave no es de test.');
    writeMd(lines);
    console.log(mdPath);
    console.log('La clave configurada no parece de prueba. No se generó etiqueta.');
    process.exit(1);
  }
  if (!allowTest) {
    lines.push('Resultado: etiquetas de prueba no activadas.');
    writeMd(lines);
    console.log(mdPath);
    console.log('Activa EASYPOST_ALLOW_TEST_LABELS=true para generar etiquetas de prueba.');
    process.exit(1);
  }

  const payload = {
    shipment: {
      to_address: {
        name: 'Ship24Go Test Receiver',
        street1: '388 Townsend St',
        city: 'San Francisco',
        state: 'CA',
        zip: '94107',
        country: 'US',
        phone: '4153334445',
        email: process.env.SHIP24GO_PROVIDER_CONTACT_EMAIL || 'help@ship24go.com'
      },
      from_address: {
        name: 'Ship24Go Test Sender',
        street1: '417 Montgomery St',
        city: 'San Francisco',
        state: 'CA',
        zip: '94104',
        country: 'US',
        phone: '4153334445',
        email: process.env.SHIP24GO_PROVIDER_CONTACT_EMAIL || 'help@ship24go.com'
      },
      parcel: { length: '10', width: '6', height: '4', weight: '16' },
      options: { label_format: 'PDF' },
      reference: `SHIP24GO-TEST-${Date.now()}`
    }
  };

  const created = await ep('POST', 'shipments', payload);
  lines.push(`## Crear envío`, '', `- HTTP: ${created.status}`, `- Shipment ID: ${created.json?.id || 'N/D'}`, `- Tarifas: ${Array.isArray(created.json?.rates) ? created.json.rates.length : 0}`, '');
  if (!(created.status >= 200 && created.status < 300) || !created.json?.id) {
    lines.push('Resultado: no se pudo crear el envío de prueba.', '');
    lines.push('Respuesta:', '```json', JSON.stringify(created.json, null, 2), '```');
    writeMd(lines);
    console.log(mdPath);
    console.log('No se pudo crear el envío de prueba. Revisa el diagnóstico.');
    process.exit(1);
  }
  const rate = chooseRate(created.json.rates);
  lines.push(`## Tarifa seleccionada`, '', `- Carrier: ${rate?.carrier || 'N/D'}`, `- Servicio: ${rate?.service || 'N/D'}`, `- Precio: ${rate?.rate || 'N/D'} ${rate?.currency || 'USD'}`, `- Rate ID: ${rate?.id || 'N/D'}`, '');
  if (!rate?.id) {
    lines.push('Resultado: no hubo tarifa disponible para comprar etiqueta de prueba.');
    writeMd(lines);
    console.log(mdPath);
    console.log('No hubo tarifa disponible. Revisa el diagnóstico.');
    process.exit(1);
  }

  const bought = await ep('POST', `shipments/${encodeURIComponent(created.json.id)}/buy`, { rate: { id: rate.id } });
  const labelUrl = bought.json?.postage_label?.label_url || bought.json?.postage_label?.label_pdf_url || '';
  lines.push(`## Comprar etiqueta test`, '', `- HTTP: ${bought.status}`, `- Tracking: ${bought.json?.tracking_code || 'N/D'}`, `- Label URL: ${labelUrl ? 'recibida' : 'pendiente'}`, '');
  if (!(bought.status >= 200 && bought.status < 300) || !labelUrl) {
    lines.push('Resultado: no se recibió etiqueta.', '');
    lines.push('Respuesta:', '```json', JSON.stringify(bought.json, null, 2), '```');
    writeMd(lines);
    console.log(mdPath);
    console.log('No se recibió etiqueta. Revisa el diagnóstico.');
    process.exit(1);
  }

  try {
    const labelRes = await fetch(labelUrl);
    const buf = Buffer.from(await labelRes.arrayBuffer());
    fs.writeFileSync(pdfPath, buf);
    lines.push(`## PDF`, '', `- Archivo: ${pdfPath}`, `- Tamaño: ${buf.length} bytes`, '', 'Resultado: etiqueta de prueba generada correctamente.');
    writeMd(lines);
    console.log(mdPath);
    console.log(pdfPath);
    console.log('Etiqueta de prueba generada correctamente.');
  } catch (e) {
    lines.push('Resultado: etiqueta creada, pero no se pudo descargar el PDF.', `- Motivo: ${e.message}`);
    writeMd(lines);
    console.log(mdPath);
    console.log('Etiqueta creada, pero el PDF no se pudo descargar.');
    process.exit(1);
  }
})().catch(e=>{
  const lines = ['# EasyPost test label V1.4.21', '', `- Fecha: ${new Date().toISOString()}`, '', `Resultado: ${e.message || 'No se pudo completar la prueba.'}`];
  writeMd(lines);
  console.log(mdPath);
  console.error(e.message || e);
  process.exit(1);
});
