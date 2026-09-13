import { pool } from './server/db/connection.js';

async function createGuestUser() {
  const guestId = 'usr_guest_omnichannel';
  const [existing] = await pool.query("SELECT id FROM users WHERE id = ?", [guestId]);
  if (!existing.length) {
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role, status, balance, country)
       VALUES (?, 'guest_omnichannel@doordrop.lat', 'NOPASSWORD', 'Cliente Omnicanal', 'customer', 'active', 0.00, 'IT')`,
      [guestId]
    );
    console.log('Created guest user successfully:', guestId);
  } else {
    console.log('Guest user already exists:', guestId);
  }

  process.exit(0);
}

createGuestUser().catch(console.error);
