const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk('src').filter((file) => {
  return /\.(tsx|ts|json|js|jsx|bak.*)$/i.test(file) || file.includes('.tsx.bak') || file.includes('.ts.bak');
});

const replacements = [
  // Header roto en admin shipments
  [/Estado\s*\((Editar|Modificar|Bearbeiten)[^)]*\)/gi, 'Estado'],
  [/ESTADO\s*\((EDITAR|MODIFICAR|BEARBEITEN)[^)]*\)/g, 'ESTADO'],

  // Texto dañado repetido
  [/MODIFICAR+R+/g, 'MODIFICAR'],
  [/Modificar+R+/g, 'Modificar'],
  [/modificar+r+/g, 'modificar'],

  // Quitar mención visible SQL del Copiloto
  [/AI Copilot \(SQL\)/g, 'AI Copilot'],
  [/Copiloto AI \(SQL\)/g, 'Copiloto AI'],
  [/Copiloto IA \(SQL\)/g, 'Copiloto IA'],
  [/KI-Copilot \(SQL\)/g, 'KI-Copilot'],
  [/AI 助手 \(SQL\)/g, 'AI 助手'],

  // Frases técnicas visibles
  [
    /¡Hola! Soy el Copiloto Inteligente de Ship24go\. Estoy conectado directamente a la base de datos SQL del sistema en tiempo real\. Puedo darte información de envíos, transacciones, tickets, integraciones y mucho más\. ¿Qué deseas saber\?/g,
    '¡Hola! Soy el Copiloto Inteligente de Ship24Go. Puedo ayudarte con tus envíos, pagos, tickets, integraciones y cuenta. ¿Cómo puedo ayudarte hoy?'
  ],
  [
    /Hello! I am the Ship24go Intelligent Copilot\. Connected directly to the system SQL database in real time, I can assist you with shipments, stores, billing, and support inquiries\. How can I help you today\?/g,
    'Hello! I am the Ship24Go Intelligent Copilot. I can help you with shipments, payments, tickets, integrations, and your account. How can I help today?'
  ],
  [
    /Hallo! Ich bin der intelligente Copilot von Ship24go\.[^"']*?(Wie kann ich Ihnen heute helfen\?)/g,
    'Hallo! Ich bin der intelligente Copilot von Ship24Go. Ich kann Ihnen bei Sendungen, Zahlungen, Tickets, Integrationen und Ihrem Konto helfen. Wie kann ich Ihnen heute helfen?'
  ],
  [
    /Ciao! Sono il Copilota Intelligente di Ship24go\. Connesso direttamente al database SQL in tempo reale, posso fornirti informazioni su spedizioni, negozi, fatturazione e supporto\. Come posso aiutarti oggi\?/g,
    'Ciao! Sono il Copilota Intelligente di Ship24Go. Posso aiutarti con spedizioni, pagamenti, ticket, integrazioni e account. Come posso aiutarti oggi?'
  ],
  [
    /Ciao! Sono il Copilota Intelligente di Ship24go\. Collegato direttamente al database SQL del sistema in tempo reale, posso aiutarti con spedizioni, negozi, fatturazione e supporto\. Come posso aiutarti oggi\?/g,
    'Ciao! Sono il Copilota Intelligente di Ship24Go. Posso aiutarti con spedizioni, pagamenti, ticket, integrazioni e account. Come posso aiutarti oggi?'
  ],

  // Acción comercial correcta en ES
  [/"common\.actions\.edit"\s*:\s*"Modificar"/g, '"common.actions.edit": "Editar"'],
];

let changed = [];

for (const file of files) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  let next = text;

  for (const [from, to] of replacements) {
    next = next.replace(from, to);
  }

  // Corrección directa de headers de tabla si están hardcodeados.
  next = next.replace(/<th([^>]*)>\s*Estado\s*<\/th>/g, '<th$1>Estado</th>');
  next = next.replace(/<th([^>]*)>\s*ESTADO\s*<\/th>/g, '<th$1>ESTADO</th>');

  if (next !== text) {
    fs.writeFileSync(file, next);
    changed.push(file);
  }
}

console.log('Archivos corregidos:');
for (const file of changed) console.log('- ' + file);
