const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../server');
const db = require('../db/db');
const { generateToken } = require('../middleware/auth');

let server;
let baseUrl;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOpts = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(url, reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

test('KrishiSetu Master Control Center V14 Forensic Audit & Security Hardening Suite', async (t) => {
  await t.test('setup test server listener', async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  t.after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  const adminToken = generateToken({ id: 'ADM_V14', role: 'admin', contact: 'admin' });
  const sellerToken = generateToken({ id: 'S101', role: 'seller', contact: 'farmer1@example.com' });
  const customer1Token = generateToken({ id: 'C101', role: 'customer', contact: 'buyer1@example.com' });
  const customer2Token = generateToken({ id: 'C102', role: 'customer', contact: 'buyer2@example.com' });

  await t.test('1. Admin Sign In accepts admin/admin and returns role=admin', async () => {
    const res = await makeRequest('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { contact: 'admin', password: 'admin' }
    });

    assert.equal(res.status, 200);
    assert.equal(typeof res.body.token, 'string');
    assert.equal(res.body.user.role, 'admin');
  });

  await t.test('2. GET /admin delivers index.html with strict no-cache headers', async () => {
    const res = await makeRequest('/admin');
    assert.equal(res.status, 200);
    assert.equal(typeof res.raw, 'string');
    assert.equal(res.raw.includes('<title>KrishiSetu'), true);
    assert.equal(res.headers['cache-control'], 'no-cache, no-store, must-revalidate');
  });

  await t.test('3. GET /api/admin/build-info returns valid build commit metadata', async () => {
    const res = await makeRequest('/api/admin/build-info', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.app, 'KrishiSetu');
    assert.ok(res.body.commit && typeof res.body.commit === 'string');
  });

  await t.test('4. Cart Item IDOR Protection: Customer B cannot update or delete Customer A cart items', async () => {
    // Setup Customer A cart item
    await db.query("INSERT INTO products (id, seller_id, name, category, price, quantity, status) VALUES ('P114', 'S101', 'Fresh Apples', 'Fruits', 120.00, 50.00, 'active')").catch(() => {});
    await db.query("INSERT INTO carts (id, customer_id) VALUES ('CART_C101', 'C101')").catch(() => {});
    await db.query("INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES ('CI_A1', 'CART_C101', 'P114', 2.00)").catch(() => {});

    // Customer B attempts to update Customer A's cart item
    const updateRes = await makeRequest('/api/cart/items/CI_A1', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${customer2Token}`, 'Content-Type': 'application/json' },
      body: { quantity: 10 }
    });
    assert.equal(updateRes.status, 404);
    assert.match(updateRes.body.error, /not found/i);

    // Customer B attempts to delete Customer A's cart item
    const deleteRes = await makeRequest('/api/cart/items/CI_A1', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${customer2Token}` }
    });
    assert.equal(deleteRes.status, 404);
    assert.match(deleteRes.body.error, /not found/i);
  });

  await t.test('5. UPI Payment Replay Attack Prevention: Duplicate Transaction ID is rejected', async () => {
    // Customer creates Order 1 and submits transactionId
    const o1Res = await makeRequest('/api/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customer1Token}`, 'Content-Type': 'application/json' },
      body: { productId: 'P114', quantity: 1, payment_method: 'upi_qr' }
    });
    assert.equal(o1Res.status, 201);
    const order1Id = o1Res.body.orders[0].id;

    const pay1Res = await makeRequest(`/api/orders/${order1Id}/verify-payment`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customer1Token}`, 'Content-Type': 'application/json' },
      body: { transactionId: 'TXN_REPLAY_TEST_1001' }
    });
    assert.equal(pay1Res.status, 200);

    // Customer creates Order 2 and attempts to reuse the same transactionId
    const o2Res = await makeRequest('/api/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customer1Token}`, 'Content-Type': 'application/json' },
      body: { productId: 'P114', quantity: 1, payment_method: 'upi_qr' }
    });
    assert.equal(o2Res.status, 201);
    const order2Id = o2Res.body.orders[0].id;

    const replayRes = await makeRequest(`/api/orders/${order2Id}/verify-payment`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customer1Token}`, 'Content-Type': 'application/json' },
      body: { transactionId: 'TXN_REPLAY_TEST_1001' }
    });
    assert.equal(replayRes.status, 409);
    assert.match(replayRes.body.error, /already been submitted/i);
  });

  await t.test('6. Payment State Machine Guard: Cannot re-verify an already verified payment', async () => {
    const oRes = await makeRequest('/api/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customer1Token}`, 'Content-Type': 'application/json' },
      body: { productId: 'P114', quantity: 1, payment_method: 'upi_qr' }
    });
    assert.equal(oRes.status, 201);
    const orderId = oRes.body.orders[0].id;

    await makeRequest(`/api/orders/${orderId}/verify-payment`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customer1Token}`, 'Content-Type': 'application/json' },
      body: { transactionId: 'TXN_STATEMACHINE_555' }
    });

    // Seller approves
    const approve1 = await makeRequest(`/api/orders/${orderId}/seller-verify-payment`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${sellerToken}`, 'Content-Type': 'application/json' },
      body: { action: 'approve' }
    });
    assert.equal(approve1.status, 200);

    // Repeat approval attempt must be blocked
    const approve2 = await makeRequest(`/api/orders/${orderId}/seller-verify-payment`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${sellerToken}`, 'Content-Type': 'application/json' },
      body: { action: 'approve' }
    });
    assert.equal(approve2.status, 409);
    assert.match(approve2.body.error, /already been verified/i);

    // Rejecting already verified payment must be blocked
    const rejectAttempt = await makeRequest(`/api/orders/${orderId}/seller-verify-payment`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${sellerToken}`, 'Content-Type': 'application/json' },
      body: { action: 'reject', reason: 'Disputed' }
    });
    assert.equal(rejectAttempt.status, 409);
    assert.match(rejectAttempt.body.error, /already been verified/i);
  });

  await t.test('7. Admin Seller Verification Workflow: Endpoints approve and reject with audit logging', async () => {
    const listRes = await makeRequest('/api/admin/seller-verifications', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(listRes.status, 200);
    assert.equal(Array.isArray(listRes.body.verifications), true);

    const approveRes = await makeRequest('/api/admin/sellers/S101/verification', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: { status: 'verified', reason: 'Official government kisan card verified.' }
    });
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.status, 'verified');
  });

  await t.test('8. Role Isolation: Buyer cannot access admin endpoints', async () => {
    const res = await makeRequest('/api/admin/metrics', {
      headers: { 'Authorization': `Bearer ${customer1Token}` }
    });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /Forbidden/i);
  });
});
