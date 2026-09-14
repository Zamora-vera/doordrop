const { runMatterhornSync } = require('./matterhorn_sync_lib.cjs');

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));

runMatterhornSync({
  limit: Number(args.get('batch') || args.get('limit') || 10),
  reclassifyExisting: args.get('reclassify-existing') === 'true',
}).then(() => process.exit(0)).catch((error) => {
  console.error(`[Matterhorn-Cron] ${error.message}`);
  process.exit(1);
});
