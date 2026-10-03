// Usage: ADMIN_EMAIL=you@x.com ADMIN_PASSWORD='long-password' npm run admin:create
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { ADMIN_EMAIL: email, ADMIN_PASSWORD: pw } = process.env;
if (!email || !pw || pw.length < 12) { console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ chars)'); process.exit(1); }
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const hash = await bcrypt.hash(pw, 12);
  await pool.query(`INSERT INTO users(email,password_hash) VALUES($1,$2)
    ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash`, [email.toLowerCase(), hash]);
  console.log('Admin saved:', email); await pool.end();
})();
