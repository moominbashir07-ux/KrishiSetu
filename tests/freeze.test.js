const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const db = require('../db/db');
const { JWT_SECRET, authenticateUser } = require('../middleware/auth');

test('Account Freeze & Suspension Enforcement', async (t) => {
  await db.initDb();

  const activeUserId = 'U_ACT_' + Date.now();
  const frozenUserId = 'U_FRZ_' + Date.now();

  const activeToken = jwt.sign({ id: activeUserId, role: 'customer' }, JWT_SECRET);
  const frozenToken = jwt.sign({ id: frozenUserId, role: 'customer' }, JWT_SECRET);

  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [activeUserId, 'Active User', 'active@test.com', 'hash', 'customer']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [frozenUserId, 'Frozen User', 'frozen@test.com', 'hash', 'customer']);

  // Set frozen status
  await db.query('UPDATE users SET account_status = $1 WHERE id = $2', ['frozen', frozenUserId]);

  await t.test('allows active user to authenticate successfully', async () => {
    const req = { headers: { authorization: 'Bearer ' + activeToken } };
    let passed = false;
    const res = {};
    const next = () => { passed = true; };

    await authenticateUser(req, res, next);
    assert.ok(passed);
    assert.equal(req.user.id, activeUserId);
  });

  await t.test('rejects frozen user with 403 Forbidden message', async () => {
    const req = { headers: { authorization: 'Bearer ' + frozenToken } };
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };
    const next = () => { assert.fail('Frozen user must not be allowed to proceed'); };

    await authenticateUser(req, res, next);
    assert.equal(statusCode, 403);
    assert.equal(jsonBody.error, 'Your KrishiSetu account has been temporarily frozen. Please contact support.');
  });
});
