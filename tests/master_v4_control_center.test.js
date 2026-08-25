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
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, raw: data });
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

test('KrishiSetu Master Control Center V4, Payment Workflows & Mandi Accuracy Suite', async (t) => {
  await t.test('setup test server listener', async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  const adminToken = generateToken({ id: 'ADM_V4', role: 'admin', contact: 'admin' });
  const seller1Token = generateToken({ id: 'S101', role: 'seller', contact: 'farmer1@example.com' });
  const seller2Token = generateToken({ id: 'S102', role: 'seller', contact: 'farmer2@example.com' });
  const customerToken = generateToken({ id: 'C101', role: 'customer', contact: 'buyer1@example.com' });

  await t.test('1. Cash on Delivery (COD) Checkout creates order with payment_status=cod and reduces stock', async () => {
    // Ensure product stock exists
    await db.query("INSERT INTO products (id, seller_id, name, category, price, quantity, status) VALUES ('P101', 'S101', 'Fresh Tomatoes', 'Vegetables', 40.00, 100.00, 'active')").catch(() => {});
    await db.query("INSERT INTO carts (id, customer_id) VALUES ('CART_C101', 'C101')").catch(() => {});
    await db.query("DELETE FROM cart_items WHERE cart_id = 'CART_C101'").catch(() => {});
    await db.query("INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES ('CI_1', 'CART_C101', 'P101', 5.00)").catch(() => {});

    const res = await makeRequest('/api/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${customerToken}`,
        'Content-Type': 'application/json'
      },
      body: { payment_method: 'cod', payment_status: 'cod' }
    });

    assert.equal(res.status, 201);
    assert.equal(Array.isArray(res.body.orders), true);
    assert.equal(res.body.orders.length, 1);
    assert.equal(res.body.orders[0].payment_method, 'cod');
    assert.equal(res.body.orders[0].payment_status, 'cod');
    assert.equal(res.body.orders[0].status, 'Order Placed');
  });

  await t.test('2. Online Payment requires mandatory Transaction ID (min 5 chars)', async () => {
    // Create an order first for verification testing
    const createRes = await makeRequest('/api/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { productId: 'P101', quantity: 2, payment_method: 'upi_qr' }
    });

    assert.equal(createRes.status, 201);
    const orderId = createRes.body.orders[0].id;

    // Test submission without transactionId
    const failRes = await makeRequest(`/api/orders/${orderId}/verify-payment`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { transactionId: '  123 ' } // Less than 5 chars
    });

    assert.equal(failRes.status, 400);
    assert.match(failRes.body.error, /Transaction ID/i);

    // Test valid submission
    const passRes = await makeRequest(`/api/orders/${orderId}/verify-payment`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { transactionId: 'UPI9876543210' }
    });

    assert.equal(passRes.status, 200);
    assert.equal(passRes.body.paymentStatus, 'submitted');
    assert.equal(passRes.body.transactionId, 'UPI9876543210');
  });

  await t.test('3. Seller Payment Verification: Seller approval confirms order & sets payment_status=verified', async () => {
    // Create order with payment submitted
    const createRes = await makeRequest('/api/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { productId: 'P101', quantity: 3, payment_method: 'upi_qr' }
    });
    const orderId = createRes.body.orders[0].id;

    await makeRequest(`/api/orders/${orderId}/verify-payment`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { transactionId: 'UPI1122334455' }
    });

    // Seller1 (owner) approves payment
    const approveRes = await makeRequest(`/api/orders/${orderId}/seller-verify-payment`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${seller1Token}`, 'Content-Type': 'application/json' },
      body: { action: 'approve' }
    });

    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.paymentStatus, 'verified');
    assert.equal(approveRes.body.status, 'Farmer Confirmed');
  });

  await t.test('4. Seller Payment Verification: Seller rejection sets payment_status=rejected and notifies customer', async () => {
    // Create order with payment submitted
    const createRes = await makeRequest('/api/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { productId: 'P101', quantity: 1, payment_method: 'upi_qr' }
    });
    const orderId = createRes.body.orders[0].id;

    await makeRequest(`/api/orders/${orderId}/verify-payment`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { transactionId: 'INVALID_TXN_99' }
    });

    // Seller1 rejects payment with reason
    const rejectRes = await makeRequest(`/api/orders/${orderId}/seller-verify-payment`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${seller1Token}`, 'Content-Type': 'application/json' },
      body: { action: 'reject', reason: 'Transaction ID not found on bank statement.' }
    });

    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.body.paymentStatus, 'rejected');
    assert.equal(rejectRes.body.reason, 'Transaction ID not found on bank statement.');
  });

  await t.test('5. IDOR Security: Seller B cannot verify Seller A payment', async () => {
    const createRes = await makeRequest('/api/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: { productId: 'P101', quantity: 1, payment_method: 'upi_qr' }
    });
    const orderId = createRes.body.orders[0].id;

    // Seller 2 attempts to verify Seller 1's order
    const res = await makeRequest(`/api/orders/${orderId}/seller-verify-payment`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${seller2Token}`, 'Content-Type': 'application/json' },
      body: { action: 'approve' }
    });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /Forbidden/i);
  });

  await t.test('6. GET /api/admin/users/:id/profile returns full user profile inspector details', async () => {
    const res = await makeRequest('/api/admin/users/C101/profile', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    assert.equal(res.status, 200);
    assert.equal(typeof res.body.profile, 'object');
    assert.equal(res.body.profile.user.id, 'C101');
    assert.equal(Array.isArray(res.body.profile.orders), true);
  });

  await t.test('7. GET /api/admin/mandi-health returns API health status and sanitized raw sample', async () => {
    const res = await makeRequest('/api/admin/mandi-health', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    assert.equal(res.status, 200);
    assert.equal(typeof res.body.mandiHealth, 'object');
    assert.equal(res.body.mandiHealth.source, 'AGMARKNET / data.gov.in API');
  });

  await t.test('8. POST /api/feedback saves user feedback and makes it visible in Admin', async () => {
    const fbRes = await makeRequest('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { rating: 5, category: 'Website', message: 'KrishiSetu platform is working amazingly well!' }
    });

    assert.equal(fbRes.status, 201);
    assert.match(fbRes.body.message, /Thank you/i);

    const admFbRes = await makeRequest('/api/feedback', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    assert.equal(admFbRes.status, 200);
    assert.equal(Array.isArray(admFbRes.body.feedback), true);
    assert.equal(admFbRes.body.feedback.some(f => f.message.includes('working amazingly well')), true);
  });

  await t.test('teardown test server listener', async () => {
    await new Promise(resolve => server.close(resolve));
  });
});
