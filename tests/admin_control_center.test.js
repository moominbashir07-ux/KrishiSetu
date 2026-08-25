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
          resolve({ status: res.statusCode, data: JSON.parse(body), raw: body });
        } catch (e) {
          resolve({ status: res.statusCode, body, raw: body });
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

test('KrishiSetu — Master Admin Control Center & /admin Route Security Test Suite', async (t) => {
  await t.test('setup server listener', async () => {
    await db.initDb();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        testPort = server.address().port;
        resolve();
      });
    });
  });

  const adminId = 'U_ADMIN_' + Date.now();
  const customerId = 'U_CUST_' + Date.now();
  const sellerId = 'U_SELL_' + Date.now();

  const adminToken = jwt.sign({ id: adminId, name: 'Master Admin', contact: 'admin@krishisetu.com', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
  const customerToken = jwt.sign({ id: customerId, name: 'Normal Customer', contact: 'cust@krishisetu.com', role: 'customer' }, JWT_SECRET, { expiresIn: '1h' });
  const sellerToken = jwt.sign({ id: sellerId, name: 'Local Farmer', contact: 'farmer@krishisetu.com', role: 'seller' }, JWT_SECRET, { expiresIn: '1h' });

  // Seed DB records
  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [adminId, 'Master Admin', 'admin@krishisetu.com', 'secret_hash_admin', 'admin']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [customerId, 'Normal Customer', 'cust@krishisetu.com', 'secret_hash_cust', 'customer']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [sellerId, 'Local Farmer', 'farmer@krishisetu.com', 'secret_hash_sell', 'seller']);

  await t.test('0. Default Demo Admin Account ("admin" / "admin") authenticates via normal signin endpoint', async () => {
    const res = await makeRequest('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { contact: 'admin', password: 'admin' }
    });

    assert.equal(res.status, 200);
    assert.ok(res.data.token, 'Must return JWT token for admin');
    assert.equal(res.data.user.role, 'admin', 'Returned user role must be admin');
  });

  await t.test('1 & 2. GET /admin route serves HTML frontend (HTTP 200 OK)', async () => {
    const res = await makeRequest('/admin');
    assert.equal(res.status, 200);
    assert.ok(res.raw.includes('<!DOCTYPE html>') || res.raw.includes('<html'), 'Must serve HTML frontend file');
    assert.ok(res.raw.includes('KrishiSetu') || res.raw.includes('adminView'), 'Must contain KrishiSetu application elements');
  });

  await t.test('3. /api/admin/metrics without authentication returns 401 Unauthorized', async () => {
    const res = await makeRequest('/api/admin/metrics');
    assert.equal(res.status, 401);
  });

  await t.test('4 & 5. /api/admin/metrics accessed by customer or seller returns 403 Forbidden', async () => {
    const custRes = await makeRequest('/api/admin/metrics', { headers: { 'Authorization': `Bearer ${customerToken}` } });
    assert.equal(custRes.status, 403);

    const sellRes = await makeRequest('/api/admin/metrics', { headers: { 'Authorization': `Bearer ${sellerToken}` } });
    assert.equal(sellRes.status, 403);
  });

  await t.test('6. /api/admin/metrics accessed by admin returns 200 OK with real metrics', async () => {
    const res = await makeRequest('/api/admin/metrics', { headers: { 'Authorization': `Bearer ${adminToken}` } });
    assert.equal(res.status, 200);
    assert.ok(res.data.metrics);
    assert.ok(typeof res.data.metrics.totalUsers === 'number');
    assert.ok(res.data.metrics.totalUsers >= 3);
  });

  await t.test('7. GET /api/auth/me returns current user identity server-side', async () => {
    const res = await makeRequest('/api/auth/me', { headers: { 'Authorization': `Bearer ${adminToken}` } });
    assert.equal(res.status, 200);
    assert.equal(res.data.user.role, 'admin');
    assert.equal(res.data.user.contact, 'admin@krishisetu.com');
  });

  await t.test('8 & 9. User Freeze & Unfreeze by Admin', async () => {
    // Freeze
    const freezeRes = await makeRequest(`/api/admin/users/${customerId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: { status: 'frozen' }
    });
    assert.equal(freezeRes.status, 200);
    assert.equal(freezeRes.data.status, 'frozen');

    // Unfreeze
    const unfreezeRes = await makeRequest(`/api/admin/users/${customerId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: { status: 'active' }
    });
    assert.equal(unfreezeRes.status, 200);
    assert.equal(unfreezeRes.data.status, 'active');
  });

  await t.test('10. Database Inspector whitelist blocks unwhitelisted tables', async () => {
    const res = await makeRequest('/api/admin/database/tables/secret_keys', { headers: { 'Authorization': `Bearer ${adminToken}` } });
    assert.equal(res.status, 400);
    assert.ok(res.data.error.includes('whitelist'));
  });

  await t.test('11. Database Inspector masks password_hash and sensitive secrets', async () => {
    const res = await makeRequest('/api/admin/database/tables/users', { headers: { 'Authorization': `Bearer ${adminToken}` } });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.rows));
    const adminRow = res.data.rows.find(r => r.id === adminId);
    assert.ok(adminRow);
    assert.equal(adminRow.password_hash, '[MASKED_HASH]');
  });

  await t.test('12 & 13. Product moderation & deactivation', async () => {
    const prodId = 'PROD_ADMIN_' + Date.now();
    await db.query('INSERT INTO products (id, seller_id, name, category, price, quantity, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [prodId, sellerId, 'Admin Test Product', 'Vegetables', 50, 100, 'active']);

    const delRes = await makeRequest(`/api/admin/products/${prodId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(delRes.status, 200);
  });

  await t.test('14 & 15. Audit logs recorded for admin actions', async () => {
    const logsRes = await makeRequest('/api/admin/audit-logs', { headers: { 'Authorization': `Bearer ${adminToken}` } });
    assert.equal(logsRes.status, 200);
    assert.ok(Array.isArray(logsRes.data.auditLogs));
    assert.ok(logsRes.data.auditLogs.length > 0, 'Audit logs must record admin operations');
  });

  await t.test('teardown server listener', async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
