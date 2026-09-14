const { runMatterhornSync } = require('./matterhorn_sync_lib.cjs');

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
runMatterhornSync({ limit: Number(limitArg?.split('=')[1] || 100), reclassifyExisting: true })
  .then((result) => { console.log(JSON.stringify(result)); process.exit(0); })
  .catch((error) => { console.error(error.message); process.exit(1); });
