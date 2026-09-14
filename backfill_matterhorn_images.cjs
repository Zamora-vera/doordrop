const { backfillMatterhornImages } = require('./matterhorn_sync_lib.cjs');

const pagesArg = process.argv.find((arg) => arg.startsWith('--max-pages='));
backfillMatterhornImages({ maxPages: Number(pagesArg?.split('=')[1] || 50) })
  .then((result) => { console.log(JSON.stringify(result)); process.exit(0); })
  .catch((error) => { console.error(`[Matterhorn-Images] ${error.message}`); process.exit(1); });
