const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db/db');
const { JWT_SECRET } = require('../middleware/auth');

let server;
let testPort;

function makeRequest(urlPath, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = `http://127.0.0.1:${testPort}${urlPath}`;
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

test('KrishiSetu Background Notifications & Alert Engine Test Suite', async (t) => {
  let userAToken, userBToken;
  let userAId, userBId;

  await t.test('1. Setup Server & Test User Tokens', async () => {
    await db.initDb();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        testPort = server.address().port;
        resolve();
      });
    });

    userAId = 'S_NOTIF_A_' + Date.now();
    userBId = 'C_NOTIF_B_' + Date.now();

    await db.query(
      `INSERT INTO users (id, name, contact, password_hash, role, account_status, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userAId, 'Farmer Anand', 'farmer_anand@test.com', 'hashed_pass', 'seller', 'active', true]
    );

    await db.query(
      `INSERT INTO users (id, name, contact, password_hash, role, account_status, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userBId, 'Buyer Priya', 'buyer_priya@test.com', 'hashed_pass', 'customer', 'active', true]
    );

    userAToken = jwt.sign({ id: userAId, name: 'Farmer Anand', role: 'seller' }, JWT_SECRET, { expiresIn: '1h' });
    userBToken = jwt.sign({ id: userBId, name: 'Buyer Priya', role: 'customer' }, JWT_SECRET, { expiresIn: '1h' });
  });


  await t.test('2. sw.js Service Worker is served statically with 200 OK', async () => {
    const res = await makeRequest('/sw.js');
    assert.equal(res.status, 200, 'sw.js must return HTTP 200');
    assert.ok(res.raw.includes('notificationclick'), 'sw.js must contain notificationclick handler');
  });

  await t.test('3. POST /api/notifications/test generates a background test alert for User A', async () => {
    const res = await makeRequest('/api/notifications/test', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userAToken}`,
        'Content-Type': 'application/json'
      }
    }, {
      title: '🚨 Test Mandi Spike Alert',
      message: 'Onion prices increased by +12% in Lasalgaon APMC!',
      type: 'mandi_alert'
    });

    assert.equal(res.status, 201, 'Test notification should return HTTP 201');
    assert.ok(res.body.notification, 'Notification object should be returned');
    assert.equal(res.body.notification.title, '🚨 Test Mandi Spike Alert');
    assert.equal(res.body.notification.read, false);
    assert.equal(res.body.notification.user_id, userAId);
  });

  await t.test('4. GET /api/notifications returns User A notifications with strict user isolation', async () => {
    // User A fetches notifications
    const resA = await makeRequest('/api/notifications', {
      headers: { 'Authorization': `Bearer ${userAToken}` }
    });
    assert.equal(resA.status, 200);
    assert.ok(Array.isArray(resA.body.notifications));
    assert.ok(resA.body.notifications.length >= 1);
    assert.equal(resA.body.notifications[0].user_id, userAId);

    // User B fetches notifications (should have 0)
    const resB = await makeRequest('/api/notifications', {
      headers: { 'Authorization': `Bearer ${userBToken}` }
    });
    assert.equal(resB.status, 200);
    assert.ok(Array.isArray(resB.body.notifications));
    assert.equal(resB.body.notifications.length, 0, 'User B must not see User A notifications');
  });

  await t.test('5. PUT /api/notifications/:id/read marks single notification as read', async () => {
    // Create second notification for User A
    const created = await makeRequest('/api/notifications/test', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userAToken}`,
        'Content-Type': 'application/json'
      }
    }, { title: 'Order Update #101', message: 'Order has been dispatched' });

    const notifId = created.body.notification.id;

    // Mark as read
    const readRes = await makeRequest(`/api/notifications/${notifId}/read`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${userAToken}` }
    });
    assert.equal(readRes.status, 200);

    // Verify
    const listRes = await makeRequest('/api/notifications', {
      headers: { 'Authorization': `Bearer ${userAToken}` }
    });
    const found = listRes.body.notifications.find(n => n.id === notifId);
    assert.ok(found);
    assert.equal(found.read, true);
  });

  await t.test('6. PUT /api/notifications/read-all batch marks all unread notifications as read', async () => {
    // Create 2 more unread notifications for User A
    await makeRequest('/api/notifications/test', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${userAToken}`, 'Content-Type': 'application/json' }
    }, { title: 'Alert 1', message: 'Message 1' });

    await makeRequest('/api/notifications/test', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${userAToken}`, 'Content-Type': 'application/json' }
    }, { title: 'Alert 2', message: 'Message 2' });

    // Call batch read-all
    const batchRes = await makeRequest('/api/notifications/read-all', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${userAToken}` }
    });
    assert.equal(batchRes.status, 200);
    assert.equal(batchRes.body.message, 'All notifications marked as read.');

    // Verify all User A notifications are now read
    const listRes = await makeRequest('/api/notifications', {
      headers: { 'Authorization': `Bearer ${userAToken}` }
    });
    const unreadCount = listRes.body.notifications.filter(n => !n.read).length;
    assert.equal(unreadCount, 0, 'All notifications must be marked read');
  });

  await t.test('7. Teardown test server', async () => {
    await new Promise((resolve) => server.close(resolve));
  });
});
