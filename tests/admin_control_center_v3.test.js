const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db/db');
const { JWT_SECRET } = require('../middleware/auth');

let server;
let testPort;

function makeRequest(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = `http://127.0.0.1:${testPort}${path}`;
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: null, raw: data });
        }
      });
    });

    req.on('error', reject);
    const postData = body || options.body;
    if (postData) req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    req.end();
  });
}

test('ADMIN V3 CONTROL CENTER & FINANCIAL GOVERNANCE SUITE', async (t) => {
  let adminToken, sellerToken, customerToken;
  let adminId, sellerId, customerId, orderId, productId;

  await t.test('1. Setup Accounts & Server (Admin, Seller, Customer)', async () => {
    await db.initDb();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        testPort = server.address().port;
        resolve();
      });
    });

    adminId = 'U_V3ADM_' + Date.now();
    sellerId = 'U_V3SELL_' + Date.now();
    customerId = 'U_V3CUST_' + Date.now();

    adminToken = jwt.sign({ id: adminId, name: 'Master Admin V3', contact: 'v3admin@krishisetu.com', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
    sellerToken = jwt.sign({ id: sellerId, name: 'Farmer Ramesh V3', contact: 'v3sell@krishisetu.com', role: 'seller' }, JWT_SECRET, { expiresIn: '1h' });
    customerToken = jwt.sign({ id: customerId, name: 'Customer Priya V3', contact: 'v3cust@krishisetu.com', role: 'customer' }, JWT_SECRET, { expiresIn: '1h' });

    await db.query('INSERT INTO users (id, name, contact, password_hash, role, account_status) VALUES ($1, $2, $3, $4, $5, $6)', [adminId, 'Master Admin V3', 'v3admin@krishisetu.com', 'hash_admin', 'admin', 'active']);
    await db.query('INSERT INTO users (id, name, contact, password_hash, role, account_status) VALUES ($1, $2, $3, $4, $5, $6)', [sellerId, 'Farmer Ramesh V3', 'v3sell@krishisetu.com', 'hash_sell', 'seller', 'active']);
    await db.query('INSERT INTO users (id, name, contact, password_hash, role, account_status) VALUES ($1, $2, $3, $4, $5, $6)', [customerId, 'Customer Priya V3', 'v3cust@krishisetu.com', 'hash_cust', 'customer', 'active']);
  });

  await t.test('2. Publish Product & Place Order for Financial Calculations', async () => {
    // Publish product as seller
    const prodRes = await makeRequest('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sellerToken}` },
      body: { name: 'Organic Golden Wheat V3', category: 'Grains', price: 100, quantity: 50, location: 'Punjab', description: 'Premium fresh wheat.' }
    });
    assert.equal(prodRes.status, 201);
    productId = prodRes.body.product.id;

    // Place order directly as customer (Total = ₹1000)
    const orderRes = await makeRequest('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${customerToken}` },
      body: { productId, quantity: 10, payment_method: 'cod' }
    });
    assert.equal(orderRes.status, 201);
    assert.ok(orderRes.body.orders && orderRes.body.orders.length > 0);
    orderId = orderRes.body.orders[0].id;
  });

  await t.test('3. Verify Admin V3 Financial Metrics (GMV, Platform Revenue, Seller Sales)', async () => {
    const res = await makeRequest('/api/admin/metrics', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const m = res.body.metrics;
    assert.ok(m);
    assert.ok(m.gmv >= 1000, `Expected GMV >= 1000, got ${m.gmv}`);
    assert.ok(m.platformRevenue >= 20, `Expected Platform Revenue >= 20, got ${m.platformRevenue}`);
    assert.equal(m.sellerSales, m.gmv - m.platformRevenue);
  });

  await t.test('4. Record Platform Expense & Verify Net Profit Calculation', async () => {
    // 4A. Create Expense
    const expRes = await makeRequest('/api/admin/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: { title: 'AWS EC2 Server Hosting', category: 'Cloud Hosting', amount: 15.00, description: 'Monthly cloud server' }
    });
    assert.equal(expRes.status, 200);
    assert.ok(expRes.body.expenseId);

    // 4B. Fetch Expenses List
    const listRes = await makeRequest('/api/admin/expenses', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.expenses.length >= 1);

    // 4C. Re-check Admin Metrics for Net Profit
    const metricsRes = await makeRequest('/api/admin/metrics', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const m = metricsRes.body.metrics;
    assert.equal(m.expensesConfigured, true);
    assert.ok(m.totalExpenses >= 15);
    assert.equal(m.netProfit, m.platformRevenue - m.totalExpenses);
  });

  await t.test('5. Execute Emergency Admin Override (With Mandatory Audit Reason)', async () => {
    // 5A. Rejects without reason
    const failRes = await makeRequest(`/api/admin/orders/${orderId}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: { action: 'cancel', reason: '' }
    });
    assert.equal(failRes.status, 400);

    // 5B. Successfully overrides with reason
    const successRes = await makeRequest(`/api/admin/orders/${orderId}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: { action: 'cancel', reason: 'Customer reported accidental duplicate order.' }
    });
    assert.equal(successRes.status, 200);
    assert.equal(successRes.body.status, 'Cancelled');
  });

  await t.test('6. Role Isolation & Security Verification (Admin IS NOT a Seller)', async () => {
    // 6A. Non-admin cannot access admin metrics
    const custFail = await makeRequest('/api/admin/metrics', {
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    assert.equal(custFail.status, 403);

    // 6B. Seller CAN update order status for their own order (Create a new active order first)
    const newOrderRes = await makeRequest('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${customerToken}` },
      body: { productId, quantity: 5, payment_method: 'cod' }
    });
    assert.equal(newOrderRes.status, 201);
    assert.ok(newOrderRes.body.orders && newOrderRes.body.orders.length > 0);
    const activeOrderId = newOrderRes.body.orders[0].id;

    const updateRes = await makeRequest(`/api/orders/${activeOrderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sellerToken}` },
      body: { status: 'Farmer Confirmed' }
    });
    assert.equal(updateRes.status, 200);

    // 6C. Customer CANNOT update seller order status
    const custOrderFail = await makeRequest(`/api/orders/${activeOrderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${customerToken}` },
      body: { status: 'Preparing' }
    });
    assert.equal(custOrderFail.status, 403);
  });

  await t.test('cleanup server listener', async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
