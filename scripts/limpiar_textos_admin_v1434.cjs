const fs = require('fs');

const files = [
  'src/pages/AdminPanel.tsx',
  'src/pages/CustomerPanel.tsx',
  'src/lang/moduleTranslations.ts',
  'src/lang/visibleText.ts',
  'src/lang/locales/es.json',
  'src/lang/locales/en.json',
  'src/lang/locales/it.json',
  'src/lang/locales/fr.json',
  'src/lang/locales/de.json',
  'src/lang/locales/zh.json',
  'src/lang/modules/admin.json',
  'src/lang/modules/customer.json',
  'src/lang/modules/nav.json',
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;

  let text = fs.readFileSync(file, 'utf8');

  text = text
    .replace(/ESTADO\s*\(MODIFICAR[A-ZÑa-zñ0-9_\-\s]*\)/g, 'ESTADO')
    .replace(/Estado\s*\(Modificar[A-ZÑa-zñ0-9_\-\s]*\)/g, 'Estado')
    .replace(/estado\s*\(modificar[A-ZÑa-zñ0-9_\-\s]*\)/gi, 'Estado')
    .replace(/MODIFICAR+R+/g, 'Modificar')
    .replace(/MODIFICARR+/g, 'Modificar')
    .replace(/SQL LIVE/gi, 'Asistente')
    .replace(/Copiloto AI \(SQL\)/g, 'Copiloto AI')
    .replace(/Copiloto IA \(SQL\)/g, 'Copiloto IA')
    .replace(/Connected directly to the system SQL database in real time/gi, 'Ready to help you with your account')
    .replace(/conectado directamente a la base de datos SQL del sistema en tiempo real/gi, 'listo para ayudarte con tu cuenta');

  fs.writeFileSync(file, text);
}

console.log('Textos visibles limpiados.');
