const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const db = require('../db/db');
const { JWT_SECRET } = require('../middleware/auth');
const { requireRole, requireAnyRole } = require('../middleware/auth');

test('RBAC & Role-Based Authorization Security', async (t) => {
  await db.initDb();

  const customerId = 'U_CUST_' + Date.now();
  const sellerId = 'U_SELL_' + Date.now();
  const adminId = 'U_ADM_' + Date.now();

  const customerToken = jwt.sign({ id: customerId, role: 'customer' }, JWT_SECRET);
  const sellerToken = jwt.sign({ id: sellerId, role: 'seller' }, JWT_SECRET);
  const adminToken = jwt.sign({ id: adminId, role: 'admin' }, JWT_SECRET);

  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [customerId, 'Buyer Momin', 'buyer@test.com', 'hash', 'customer']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [sellerId, 'Seller Suresh', 'seller@test.com', 'hash', 'seller']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [adminId, 'Admin Boss', 'admin@test.com', 'hash', 'admin']);

  await t.test('prevents seller from placing items into buyer shopping cart with clear error', () => {
    const req = { user: { id: sellerId, role: 'seller' } };
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };
    const next = () => { assert.fail('Seller should not pass customer check'); };

    const middleware = requireRole('customer');
    middleware(req, res, next);

    assert.equal(statusCode, 403);
    assert.equal(jsonBody.error, 'Sellers cannot add products to a shopping cart. Switch to your buyer account to purchase products.');
  });

  await t.test('prevents non-admin user from accessing admin endpoints', () => {
    const req = { user: { id: customerId, role: 'customer' } };
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };
    const next = () => { assert.fail('Customer should not pass admin check'); };

    const middleware = requireRole('admin');
    middleware(req, res, next);

    assert.equal(statusCode, 403);
  });

  await t.test('allows admin role to pass admin authorization check', () => {
    const req = { user: { id: adminId, role: 'admin' } };
    let passed = false;
    const res = {};
    const next = () => { passed = true; };

    const middleware = requireRole('admin');
    middleware(req, res, next);

    assert.ok(passed);
  });
});
