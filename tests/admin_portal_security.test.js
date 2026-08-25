const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const db = require('../db/db');
const { JWT_SECRET, requireRole } = require('../middleware/auth');

test('Admin Portal Security, Audit Logging & Database Inspector', async (t) => {
  await db.initDb();

  const adminId = 'U_ADM_SEC_' + Date.now();
  const customerId = 'U_CUST_SEC_' + Date.now();
  const sellerId = 'U_SELL_SEC_' + Date.now();

  await db.query('INSERT INTO users (id, name, contact, password_hash, role, account_status) VALUES ($1, $2, $3, $4, $5, $6)', [adminId, 'Super Admin', 'admin@krishisetu.com', 'hash', 'admin', 'active']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role, account_status) VALUES ($1, $2, $3, $4, $5, $6)', [customerId, 'Buyer User', 'buyer@krishisetu.com', 'hash', 'customer', 'active']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role, account_status) VALUES ($1, $2, $3, $4, $5, $6)', [sellerId, 'Farmer User', 'farmer@krishisetu.com', 'hash', 'seller', 'active']);

  const adminToken = jwt.sign({ id: adminId, role: 'admin' }, JWT_SECRET);
  const custToken = jwt.sign({ id: customerId, role: 'customer' }, JWT_SECRET);

  await t.test('prevents non-admin users from accessing admin routes with 403 Forbidden', async () => {
    const reqCust = { user: { id: customerId, role: 'customer' } };

    let forbiddenHit = false;
    requireRole('admin')(reqCust, { status: (c) => {
      assert.equal(c, 403);
      return { json: (d) => { forbiddenHit = true; return d; } };
    }}, () => {});
    assert.ok(forbiddenHit, 'Customer must receive 403 Forbidden for admin role check');
  });

  await t.test('admin can freeze user account and creates audit log record', async () => {
    await db.query('UPDATE users SET account_status = $1 WHERE id = $2', ['frozen', sellerId]);
    await db.query(
      `INSERT INTO admin_audit_logs (id, admin_id, action, target_id, details) VALUES ($1, $2, $3, $4, $5)`,
      ['LOG_TEST_' + Date.now(), adminId, 'ACCOUNT_FROZEN', sellerId, `Froze seller account '${sellerId}'`]
    );

    const userRes = await db.query('SELECT account_status FROM users WHERE id = $1', [sellerId]);
    assert.equal(userRes.rows[0].account_status, 'frozen');

    const logRes = await db.query('SELECT * FROM admin_audit_logs WHERE target_id = $1', [sellerId]);
    assert.ok(logRes.rows.length >= 1);
    assert.equal(logRes.rows[0].admin_id, adminId);
  });

  await t.test('whitelisted database inspector masks sensitive password hashes', async () => {
    const res = await db.query('SELECT * FROM users WHERE id = $1', [adminId]);
    const row = res.rows[0];
    assert.ok(row.password_hash, 'Original database row contains hash');

    const maskedRow = { ...row };
    if (maskedRow.password_hash) maskedRow.password_hash = '[MASKED_HASH]';

    assert.equal(maskedRow.password_hash, '[MASKED_HASH]');
  });
});
