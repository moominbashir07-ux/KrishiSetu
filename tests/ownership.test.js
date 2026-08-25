const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/db');
const { requireProductOwnership } = require('../middleware/auth');

test('Product Ownership Security & Isolation', async (t) => {
  await db.initDb();

  const sellerAId = 'U_SELLER_A_' + Date.now();
  const sellerBId = 'U_SELLER_B_' + Date.now();
  const productId = 'P_TOMATO_' + Date.now();

  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [sellerAId, 'Seller A', 'sellera@test.com', 'hash', 'seller']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [sellerBId, 'Seller B', 'sellerb@test.com', 'hash', 'seller']);

  await db.query(
    `INSERT INTO products (id, seller_id, name, category, description, price, quantity, grade, status, location)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [productId, sellerAId, 'Organic Tomato', 'Vegetables', 'Nashik fresh', 30.00, 100, 'Grade A', 'active', 'Nashik']
  );

  await t.test('allows Seller A (owner) to pass product ownership check', async () => {
    const req = { user: { id: sellerAId, role: 'seller' }, params: { id: productId } };
    let passed = false;
    const res = {};
    const next = () => { passed = true; };

    await requireProductOwnership(req, res, next);
    assert.ok(passed, 'Owner Seller A should be allowed to modify listing');
  });

  await t.test('rejects Seller B (non-owner) with 403 Forbidden', async () => {
    const req = { user: { id: sellerBId, role: 'seller' }, params: { id: productId } };
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };
    const next = () => { assert.fail('Non-owner Seller B should be blocked'); };

    await requireProductOwnership(req, res, next);

    assert.equal(statusCode, 403);
    assert.equal(jsonBody.error, 'You can only manage your own listings.');
  });
});
