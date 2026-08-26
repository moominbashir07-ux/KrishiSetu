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

test('KrishiSetu Master Control Center V6 Forensic Audit & Production Suite', async (t) => {
  await t.test('setup test server listener', async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  const adminToken = generateToken({ id: 'ADM_V6', role: 'admin', contact: 'admin' });
  const seller1Token = generateToken({ id: 'S101', role: 'seller', contact: 'farmer1@example.com' });
  const seller2Token = generateToken({ id: 'S102', role: 'seller', contact: 'farmer2@example.com' });
  const customerToken = generateToken({ id: 'C101', role: 'customer', contact: 'buyer1@example.com' });

  await t.test('1. GET /admin returns HTTP 200 OK with index.html and Cache-Control header', async () => {
    const res = await makeRequest('/admin');
    assert.equal(res.status, 200);
    assert.equal(typeof res.raw, 'string');
    assert.equal(res.raw.includes('<title>KrishiSetu'), true);
    assert.equal(res.headers['cache-control'], 'no-cache, no-store, must-revalidate');
  });

  await t.test('2. GET /js/api.js returns JavaScript file containing AuthService.getToken', async () => {
    const res = await makeRequest('/js/api.js?v=895ed93');
    assert.equal(res.status, 200);
    assert.equal(typeof res.raw, 'string');
    assert.equal(res.raw.includes('getToken()'), true);
    assert.equal(res.raw.includes('AuthService'), true);
  });

  await t.test('3. Cash on Delivery (COD) Checkout creates order with payment_status=cod and reduces stock', async () => {
    await db.query("INSERT INTO products (id, seller_id, name, category, price, quantity, status) VALUES ('P106', 'S101', 'Organic Corn', 'Grains', 25.00, 300.00, 'active')").catch(() => {});
    await db.query("INSERT INTO carts (id, customer_id) VALUES ('CART_C101', 'C101')").catch(() => {});
    await db.query("DELETE FROM cart_items WHERE cart_id = 'CART_C101'").catch(() => {});
    await db.query("INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES ('CI_V6', 'CART_C101', 'P106', 15.00)").catch(() => {});

    const res = await makeRequest('/api/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { payment_method: 'cod', payment_status: 'cod' }
    });

    assert.equal(res.status, 201);
    assert.equal(Array.isArray(res.body.orders), true);
    assert.equal(res.body.orders[0].payment_method, 'cod');
    assert.equal(res.body.orders[0].payment_status, 'cod');
  });

  await t.test('4. Online Payment requires mandatory Transaction ID (min 5 chars)', async () => {
    const createRes = await makeRequest('/api/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { productId: 'P106', quantity: 2, payment_method: 'upi_qr' }
    });

    assert.equal(createRes.status, 201);
    const orderId = createRes.body.orders[0].id;

    // Fail short transaction ID
    const failRes = await makeRequest(`/api/orders/${orderId}/verify-payment`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { transactionId: '12' }
    });

    assert.equal(failRes.status, 400);
    assert.match(failRes.body.error, /Transaction ID/i);

    // Pass valid transaction ID
    const passRes = await makeRequest(`/api/orders/${orderId}/verify-payment`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { transactionId: 'UTR1122334455' }
    });

    assert.equal(passRes.status, 200);
    assert.equal(passRes.body.paymentStatus, 'submitted');
    assert.equal(passRes.body.transactionId, 'UTR1122334455');
  });

  await t.test('5. Seller Payment Verification: Seller approval confirms order & sets payment_status=verified', async () => {
    const createRes = await makeRequest('/api/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { productId: 'P106', quantity: 3, payment_method: 'upi_qr' }
    });
    const orderId = createRes.body.orders[0].id;

    await makeRequest(`/api/orders/${orderId}/verify-payment`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { transactionId: 'UTR9988776611' }
    });

    const approveRes = await makeRequest(`/api/orders/${orderId}/seller-verify-payment`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${seller1Token}`, 'Content-Type': 'application/json' },
      body: { action: 'approve' }
    });

    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.paymentStatus, 'verified');
    assert.equal(approveRes.body.status, 'Farmer Confirmed');
  });

  await t.test('6. Seller Payment Verification: Seller rejection sets payment_status=rejected and records reason', async () => {
    const createRes = await makeRequest('/api/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { productId: 'P106', quantity: 1, payment_method: 'upi_qr' }
    });
    const orderId = createRes.body.orders[0].id;

    await makeRequest(`/api/orders/${orderId}/verify-payment`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { transactionId: 'FAKE_UTR_V6' }
    });

    const rejectRes = await makeRequest(`/api/orders/${orderId}/seller-verify-payment`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${seller1Token}`, 'Content-Type': 'application/json' },
      body: { action: 'reject', reason: 'UTR invalid on bank portal.' }
    });

    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.body.paymentStatus, 'rejected');
    assert.equal(rejectRes.body.reason, 'UTR invalid on bank portal.');
  });

  await t.test('7. IDOR Security: Seller B cannot verify Seller A payment', async () => {
    const createRes = await makeRequest('/api/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { productId: 'P106', quantity: 1, payment_method: 'upi_qr' }
    });
    const orderId = createRes.body.orders[0].id;

    const res = await makeRequest(`/api/orders/${orderId}/seller-verify-payment`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${seller2Token}`, 'Content-Type': 'application/json' },
      body: { action: 'approve' }
    });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /Forbidden/i);
  });

  await t.test('8. GET /api/admin/users/:id/profile returns full user inspector details', async () => {
    const res = await makeRequest('/api/admin/users/C101/profile', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    assert.equal(res.status, 200);
    assert.equal(typeof res.body.profile, 'object');
    assert.equal(res.body.profile.user.id, 'C101');
  });

  await t.test('9. GET /api/admin/mandi-health returns API health status', async () => {
    const res = await makeRequest('/api/admin/mandi-health', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    assert.equal(res.status, 200);
    assert.equal(typeof res.body.mandiHealth, 'object');
  });

  await t.test('teardown test server listener', async () => {
    await new Promise(resolve => server.close(resolve));
  });
});
