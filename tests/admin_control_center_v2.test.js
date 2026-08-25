const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db/db');
const { JWT_SECRET } = require('../middleware/auth');

let server = null;
let testPort = 0;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `http://127.0.0.1:${testPort}${path}`;
    const reqOpts = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(url, reqOpts, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body), raw: body, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body, raw: body, headers: res.headers });
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

test('Master Admin Control Center V2 Test Suite', async (t) => {
  let adminToken;
  let customerToken;
  let sellerToken;
  let testCustomerId;
  let testSellerId;

  await t.test('setup server listener and database', async () => {
    await db.initDb();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        testPort = server.address().port;
        resolve();
      });
    });

    testCustomerId = 'U_V2CUST_' + Date.now();
    testSellerId = 'U_V2SELL_' + Date.now();
    const adminId = 'U_V2ADMIN_' + Date.now();

    adminToken = jwt.sign({ id: adminId, name: 'V2 Admin', contact: 'v2admin@krishisetu.com', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
    customerToken = jwt.sign({ id: testCustomerId, name: 'V2 Customer', contact: 'v2cust@krishisetu.com', role: 'customer' }, JWT_SECRET, { expiresIn: '1h' });
    sellerToken = jwt.sign({ id: testSellerId, name: 'V2 Seller', contact: 'v2sell@krishisetu.com', role: 'seller' }, JWT_SECRET, { expiresIn: '1h' });

    await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [adminId, 'V2 Admin', 'v2admin@krishisetu.com', 'hash_admin', 'admin']);
    await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [testCustomerId, 'V2 Customer', 'v2cust@krishisetu.com', 'hash_cust', 'customer']);
    await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [testSellerId, 'V2 Seller', 'v2sell@krishisetu.com', 'hash_sell', 'seller']);
  });

  await t.test('1. User presence heartbeat endpoint records activity', async () => {
    const res = await makeRequest('/api/auth/heartbeat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerToken}`
      },
      body: { action: 'Browsing Marketplace', currentPage: '/#market' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'ok');
  });

  await t.test('2. GET /api/admin/analytics returns valid sales metrics', async () => {
    const res = await makeRequest('/api/admin/analytics?range=30d', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.analytics);
    assert.equal(typeof res.data.analytics.totalRevenue, 'number');
    assert.ok(Array.isArray(res.data.analytics.topProducts));
    assert.ok(Array.isArray(res.data.analytics.salesTimeline));
  });

  await t.test('3. GET /api/admin/online-users returns tracked active presence', async () => {
    const res = await makeRequest('/api/admin/online-users', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.users));
    assert.equal(typeof res.data.currentlyOnline, 'number');
  });

  await t.test('4. GET /api/admin/live-activity returns recent event stream', async () => {
    const res = await makeRequest('/api/admin/live-activity', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.events));
  });

  await t.test('5. GET /api/admin/login-history returns recorded logins', async () => {
    const res = await makeRequest('/api/admin/login-history', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.history));
  });

  await t.test('6. GET /api/admin/sellers returns enriched seller performance list', async () => {
    const res = await makeRequest('/api/admin/sellers', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.sellers));
  });

  await t.test('7. GET /api/admin/customers returns detailed customer list', async () => {
    const res = await makeRequest('/api/admin/customers', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.customers));
  });

  await t.test('8. GET /api/admin/system-health returns operational status', async () => {
    const res = await makeRequest('/api/admin/system-health', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.systemHealth);
    assert.equal(res.data.systemHealth.backend.status, 'Operational');
  });

  await t.test('9. GET /api/admin/search returns global search results', async () => {
    const res = await makeRequest('/api/admin/search?q=v2cust', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.results);
    assert.ok(Array.isArray(res.data.results.users));
    assert.ok(res.data.results.users.some(u => u.id === testCustomerId));
  });

  await t.test('10. GET /api/admin/export/:resource downloads CSV with masked credentials', async () => {
    const res = await makeRequest('/api/admin/export/users', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'));
    assert.ok(res.raw.includes('id') && res.raw.includes('contact'));
    assert.equal(res.raw.includes('password_hash'), false);
  });

  await t.test('11. Account freeze with reason records audit log', async () => {
    const freezeRes = await makeRequest(`/api/admin/users/${testCustomerId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: { status: 'frozen', reason: 'Automated security test freeze' }
    });
    assert.equal(freezeRes.status, 200);
    assert.equal(freezeRes.data.status, 'frozen');

    // Unfreeze account
    await makeRequest(`/api/admin/users/${testCustomerId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: { status: 'active', reason: 'Test complete' }
    });
  });

  await t.test('12. Non-admin users are rejected with HTTP 403 on all V2 endpoints', async () => {
    const endpoints = [
      '/api/admin/analytics',
      '/api/admin/online-users',
      '/api/admin/live-activity',
      '/api/admin/login-history',
      '/api/admin/sellers',
      '/api/admin/customers',
      '/api/admin/system-health',
      '/api/admin/search?q=test'
    ];

    for (const ep of endpoints) {
      const res = await makeRequest(ep, {
        headers: { 'Authorization': `Bearer ${customerToken}` }
      });
      assert.equal(res.status, 403);
    }
  });

  await t.test('teardown server listener', async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
