const mysql = require('mysql2/promise');

async function main() {
  const apply = process.argv.includes('--apply');
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: Number(process.env.MYSQL_PORT || 3306)
  });

  try {
    const [accounts] = await db.query(
      "SELECT zernio_account_id FROM omnichannel_accounts WHERE status = 'connected'"
    );
    const accountIds = new Set(accounts.map((row) => String(row.zernio_account_id)));
    const [events] = await db.query(
      "SELECT event_id, payload_json FROM omnichannel_webhook_events WHERE event_type = 'message.received' AND processed = 1 ORDER BY id ASC"
    );

    const candidates = events.filter((row) => {
      try {
        const payload = JSON.parse(row.payload_json);
        const accountId = payload?.account?.id
          || payload?.account?.accountId
          || payload?.data?.account?.id
          || payload?.data?.account?.accountId;
        return accountId && accountIds.has(String(accountId));
      } catch {
        return false;
      }
    });

    console.log(`candidates=${candidates.length} mode=${apply ? 'apply' : 'dry-run'}`);
    if (!apply) return;

    let succeeded = 0;
    let failed = 0;
    for (let index = 0; index < candidates.length; index += 1) {
      const event = candidates[index];
      await db.query(
        "UPDATE omnichannel_webhook_events SET processed = 0, error_message = NULL WHERE event_id = ?",
        [event.event_id]
      );

      const response = await fetch('http://127.0.0.1:3000/api/webhooks/zernio', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-zernio-event-id': event.event_id,
          'x-zernio-replay': '1'
        },
        body: event.payload_json
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) succeeded += 1;
      else failed += 1;
      console.log(`event=${index + 1}/${candidates.length} http=${response.status} status=${body.status || 'unknown'}`);
    }

    const [counts] = await db.query(
      "SELECT (SELECT COUNT(*) FROM omnichannel_conversations) AS conversations, (SELECT COUNT(*) FROM omnichannel_messages) AS messages, (SELECT COUNT(*) FROM omnichannel_webhook_events WHERE event_type = 'message.received' AND processed = 1 AND error_message IS NULL) AS received_processed"
    );
    console.log(JSON.stringify({ succeeded, failed, counts: counts[0] }));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
