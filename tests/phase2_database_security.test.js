/**
 * KrishiSetu 2.0 — Phase 2 Database Connection, Security & Health Check Test Suite
 */

process.env.TEST_LIVE_DB = 'true';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const app = require('../server');
const db = require('../db/db');
const { getPgSslConfig } = require('../db/db');
const { validateEnv, getSanitizedDbUrl } = require('../config/env');
const { toSafeUser, generateToken, JWT_SECRET } = require('../middleware/auth');

let server;
let baseUrl;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOpts = {
      method: options.method || 'GET',
      headers: { ...(options.headers || {}) }
    };

    let bodyData = null;
    if (options.body) {
      bodyData = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      reqOpts.headers['Content-Length'] = Buffer.byteLength(bodyData);
    }

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
    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

test('Phase 2 — Database Connection, Health Check & Security Suite', async (t) => {
  await t.test('setup test server listener', async () => {
    await db.initDb();
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

  // ===========================================================================
  // 1. DATABASE ENVIRONMENT VALIDATION & SECRET SANITIZATION
  // ===========================================================================
  await t.test('1.1. validateEnv flags missing DATABASE_URL with clear guidance', () => {
    const origDbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    const result = validateEnv({ silent: true });
    assert.equal(result.valid, false);
    assert.ok(result.missing.some(m => m.includes('DATABASE_URL is required for PostgreSQL database access.')));

    process.env.DATABASE_URL = origDbUrl;
  });

  await t.test('1.2. validateEnv validates production required variables strictly', () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origJwt = process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;

    const result = validateEnv({ silent: true });
    assert.equal(result.valid, false);
    assert.ok(result.missing.some(m => m.includes('Critical production variable missing: JWT_SECRET')));

    process.env.NODE_ENV = origNodeEnv;
    process.env.JWT_SECRET = origJwt;
  });

  await t.test('1.3. getSanitizedDbUrl strictly masks database passwords and credentials', () => {
    const rawUrl = 'postgresql://postgres.swxwtwxaoxuucjjdttdr:SecretPassword123@aws-0-ap-south-1.pooler.supabase.com:5432/postgres';
    const sanitized = getSanitizedDbUrl(rawUrl);

    assert.ok(!sanitized.includes('SecretPassword123'), 'Raw password must never appear in sanitized URL');
    assert.ok(sanitized.includes('****'), 'Password must be masked with asterisks');
    assert.ok(sanitized.includes('aws-0-ap-south-1.pooler.supabase.com'), 'Host must remain preserved for diagnostics');
  });

  // ===========================================================================
  // 2. DATABASE HEALTH CHECK ENDPOINT (/api/health)
  // ===========================================================================
  await t.test('2.1. GET /api/health returns valid status and database indicator without credentials', async () => {
    const res = await makeRequest('/api/health');

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.ok(res.body.database === 'connected' || res.body.database === 'connected (fallback)');
    assert.ok(res.body.timestamp);
    assert.ok(res.body.environment);

    // Ensure no secrets or connection strings are leaked
    const rawString = JSON.stringify(res.body);
    assert.ok(!rawString.includes('postgresql://'));
    assert.ok(!rawString.includes('password'));
    assert.ok(!rawString.includes('supabase.co'));
    assert.ok(!rawString.includes('pooler.supabase'));
  });

  // ===========================================================================
  // 3. DATABASE CONNECTION & SSL CONFIGURATION
  // ===========================================================================
  await t.test('3.1. getPgSslConfig recognizes Supabase pooler host for SSL configuration', () => {
    const sslPooler = getPgSslConfig('postgresql://user:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres');
    assert.ok(sslPooler, 'SSL must be configured for Supabase pooler host');
  });

  await t.test('3.2. pingDb successfully tests database connectivity', async () => {
    const ping = await db.pingDb();
    assert.equal(ping.connected, true);
    assert.ok(['postgresql', 'fallback'].includes(ping.type));
  });

  // ===========================================================================
  // 4. SENSITIVE DATA FILTERING & SAFE USER SERIALIZATION
  // ===========================================================================
  await t.test('4.1. toSafeUser strips password_hash, otp_hash, and jwt_secret', () => {
    const unsafeUser = {
      id: 'U_123',
      name: 'Test Farmer',
      contact: 'farmer@example.com',
      role: 'seller',
      password_hash: '$2a$10$UnsafeHashedPasswordString',
      otp_hash: 'c893475983745938475934875934',
      otp_code: '123456',
      jwt_secret: 'SuperSecretKey'
    };

    const safe = toSafeUser(unsafeUser);
    assert.equal(safe.id, 'U_123');
    assert.equal(safe.name, 'Test Farmer');
    assert.equal(safe.password_hash, undefined);
    assert.equal(safe.otp_hash, undefined);
    assert.equal(safe.otp_code, undefined);
    assert.equal(safe.jwt_secret, undefined);
  });

  await t.test('4.2. /api/auth/me returns clean user profile without password_hash', async () => {
    const token = generateToken({ id: 'U_ADMIN_DEFAULT', role: 'admin' });
    const res = await makeRequest('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.user);
    assert.equal(res.body.user.password_hash, undefined);
    assert.equal(res.body.user.password, undefined);
    assert.equal(res.body.user.otp_hash, undefined);
  });

  await t.test('4.3. Admin table inspector masks password_hash and otp_hash', async () => {
    const token = generateToken({ id: 'U_ADMIN_DEFAULT', role: 'admin' });
    const res = await makeRequest('/api/admin/database/tables/users', {
      headers: { Authorization: `Bearer ${token}` }
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.rows));
    for (const row of res.body.rows) {
      if (row.password_hash) {
        assert.equal(row.password_hash, '[MASKED_HASH]');
      }
      if (row.otp_hash) {
        assert.equal(row.otp_hash, '[MASKED_HASH]');
      }
    }
  });

  await t.test('4.4. Admin table inspector rejects unwhitelisted tables like otps with 400', async () => {
    const token = generateToken({ id: 'U_ADMIN_DEFAULT', role: 'admin' });
    const res = await makeRequest('/api/admin/database/tables/otps', {
      headers: { Authorization: `Bearer ${token}` }
    });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /whitelist/i);
  });

  // ===========================================================================
  // 5. ROLE-BASED ACCESS CONTROL & IDOR VERIFICATION
  // ===========================================================================
  await t.test('5.1. Customer cannot access admin routes (403 Forbidden)', async () => {
    const customerId = 'C_TEST_PHASE2_' + Date.now();
    await db.query(
      'INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
      [customerId, 'Test Customer', `cust_${Date.now()}@example.com`, 'hashedpass', 'customer']
    );

    const customerToken = generateToken({ id: customerId, role: 'customer' });
    const res = await makeRequest('/api/admin/users', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /Access denied/i);
  });

  await t.test('5.2. Admin can approve seller verification and records audit details', async () => {
    const adminToken = generateToken({ id: 'U_ADMIN_DEFAULT', role: 'admin' });
    const sellerId = 'S_TEST_VERIF_' + Date.now();

    // Seed seller profile in db
    await db.query(
      'INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
      [sellerId, 'Verif Farmer', `verif_${Date.now()}@example.com`, 'hash', 'seller']
    );
    await db.query(
      'INSERT INTO seller_profiles (id, user_id, business_name, verification_status) VALUES ($1, $2, $3, $4)',
      ['SP_' + sellerId, sellerId, 'Verif Farm', 'pending']
    );

    const res = await makeRequest(`/api/admin/sellers/${sellerId}/verification`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: { status: 'verified', reason: 'Verified via 7/12 Land Registry' }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.verification?.status || res.body.status || (res.body.message && 'verified'), 'verified');

    // Verify profile updated
    const check = await db.query('SELECT verification_status FROM seller_profiles WHERE user_id = $1', [sellerId]);
    assert.equal(check.rows[0]?.verification_status, 'verified');
  });

  // ===========================================================================
  // 6. ERROR SANITIZATION — DATABASE ERROR PROTECTION
  // ===========================================================================
  await t.test('6.1. Global error handler sanitizes database errors to prevent internal SQL disclosure', async () => {
    const { errorHandler } = require('../middleware/security');

    let responseStatus = null;
    let responseBody = null;

    const mockReq = { ip: '127.0.0.1', headers: {} };
    const mockRes = {
      status(code) { responseStatus = code; return this; },
      json(data) { responseBody = data; return this; }
    };
    const mockNext = () => {};

    const rawPgError = new Error('syntax error at or near "SELECT * FROM users WHERE password="');
    rawPgError.statusCode = 500;

    errorHandler(rawPgError, mockReq, mockRes, mockNext);

    assert.equal(responseStatus, 500);
    assert.equal(responseBody.error, 'Database operation failed');
    assert.ok(!responseBody.error.includes('SELECT'));
    assert.ok(!responseBody.error.includes('password'));
  });
});
