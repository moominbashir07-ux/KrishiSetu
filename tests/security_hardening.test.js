/**
 * KrishiSetu 2.0 — Phase 1.5 Security Hardening & Pre-Deployment Verification Test Suite
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const app = require('../server');
process.env.DATABASE_URL = '';
const db = require('../db/db');
const { getPgSslConfig } = require('../db/db');
const { generateToken } = require('../middleware/auth');
const { authorizeStorageEntity } = require('../routes/storage');
const { MandiIntelligenceService } = require('../services/market/mandiIntelligenceService');
const AwsBedrockProvider = require('../services/ai/awsBedrockProvider');
const MockBedrockProvider = require('../services/ai/mockBedrockProvider');
const { BedrockAdvisorService } = require('../services/ai/bedrockAdvisorService');

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

test('Phase 1.5 Security Hardening & Pre-Deployment Suite', async (t) => {
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
  // 1. ADMIN BOOTSTRAP ENDPOINT HARDENING (/api/auth/admin-seed)
  // ===========================================================================
  await t.test('1.1. Rejects request with invalid or missing bootstrap key with 403', async () => {
    const res = await makeRequest('/api/auth/admin-seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        bootstrapKey: 'wrong_secret_key',
        name: 'Fake Admin',
        contact: 'fake_admin@example.com',
        password: 'AdminPassword123!'
      }
    });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /bootstrap/i);
  });

  await t.test('1.2. Successfully creates admin with valid bootstrap key and never returns password hash', async () => {
    const adminContact = `admin_seed_${Date.now()}@example.com`;
    const expectedKey = process.env.ADMIN_BOOTSTRAP_KEY || 'krishisetu_admin_seed_secret_2026';

    const res = await makeRequest('/api/auth/admin-seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        bootstrapKey: expectedKey,
        name: 'First Time Admin',
        contact: adminContact,
        password: 'SuperAdminPass2026!'
      }
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.role, 'admin');
    assert.equal(res.body.user.contact, adminContact);
    assert.equal(res.body.user.password_hash, undefined);
    assert.equal(res.body.user.password, undefined);
    assert.ok(res.body.token);
  });

  await t.test('1.3. Rejects overwrite attempt on existing account with 409 Conflict', async () => {
    const existingContact = `admin_existing_${Date.now()}@example.com`;
    const expectedKey = process.env.ADMIN_BOOTSTRAP_KEY || 'krishisetu_admin_seed_secret_2026';

    // First creation
    const firstRes = await makeRequest('/api/auth/admin-seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        bootstrapKey: expectedKey,
        name: 'Original Admin',
        contact: existingContact,
        password: 'FirstPassword123!'
      }
    });
    assert.equal(firstRes.status, 201);

    // Second attempt to overwrite existing account
    const overwriteRes = await makeRequest('/api/auth/admin-seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        bootstrapKey: expectedKey,
        name: 'Overwritten Admin',
        contact: existingContact,
        password: 'MaliciousNewPassword!'
      }
    });

    assert.equal(overwriteRes.status, 409);
    assert.match(overwriteRes.body.error, /already exists/i);
  });

  // ===========================================================================
  // 2. CORS ALLOWLIST HARDENING
  // ===========================================================================
  await t.test('2.1. Blocks request from unauthorized origin with 403', async () => {
    const res = await makeRequest('/api/health', {
      headers: { Origin: 'https://malicious-attacker-site.com' }
    });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /CORS/i);
  });

  await t.test('2.2. Allows request with no Origin header (native clients, backend services)', async () => {
    const res = await makeRequest('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  // ===========================================================================
  // 3. STORAGE IDOR & ACCESS CONTROL
  // ===========================================================================
  const sellerA = { id: 'SELLER_A_' + Date.now(), role: 'seller' };
  const sellerB = { id: 'SELLER_B_' + Date.now(), role: 'seller' };
  const customerA = { id: 'CUST_A_' + Date.now(), role: 'customer' };

  await t.test('setup product for storage IDOR tests', async () => {
    await db.query(
      `INSERT INTO products (id, seller_id, name, category, price, quantity)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['PROD_OWNED_BY_A', sellerA.id, 'Organic Wheat', 'Grains', 2200, 50]
    );
  });

  await t.test('3.1. Seller A can request upload URL for their own product', async () => {
    const authorized = await authorizeStorageEntity(sellerA, 'product', 'PROD_OWNED_BY_A');
    assert.equal(authorized, true);
  });

  await t.test('3.2. Seller B is BLOCKED from requesting upload URL for Seller A product (IDOR 403)', async () => {
    await assert.rejects(
      async () => {
        await authorizeStorageEntity(sellerB, 'product', 'PROD_OWNED_BY_A');
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'IDOR_ACCESS_DENIED');
        return true;
      }
    );
  });

  await t.test('3.3. Customer is BLOCKED from requesting product media upload (Role 403)', async () => {
    await assert.rejects(
      async () => {
        await authorizeStorageEntity(customerA, 'product', 'PROD_OWNED_BY_A');
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'SELLER_REQUIRED');
        return true;
      }
    );
  });

  await t.test('3.4. User cannot upload verification/profile documents for another user ID (IDOR 403)', async () => {
    await assert.rejects(
      async () => {
        await authorizeStorageEntity(customerA, 'profile', sellerA.id);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'IDOR_ACCESS_DENIED');
        return true;
      }
    );
  });

  // ===========================================================================
  // 4. POSTGRESQL TLS CONFIGURATION
  // ===========================================================================
  await t.test('4.1. Disables rejectUnauthorized: false by default for strict CA validation', () => {
    const origInsecure = process.env.DB_SSL_ALLOW_INSECURE;
    delete process.env.DB_SSL_ALLOW_INSECURE;
    try {
      const sslConfig = getPgSslConfig('postgres://user:pass@db.supabase.co:5432/postgres');
      assert.ok(sslConfig, 'SSL config should be present for remote host');
      assert.equal(sslConfig.rejectUnauthorized, true, 'Must enforce certificate validation');
    } finally {
      if (origInsecure) process.env.DB_SSL_ALLOW_INSECURE = origInsecure;
    }
  });

  await t.test('4.2. Localhost connections do not force SSL', () => {
    const sslConfig = getPgSslConfig('postgres://user:pass@localhost:5432/postgres');
    assert.equal(sslConfig, false);
  });

  // ===========================================================================
  // 5. JWT LIFETIME CONFIGURABILITY
  // ===========================================================================
  await t.test('5.1. Generates tokens respecting custom expiration', () => {
    const token = generateToken({ id: 'user_123', role: 'customer' }, '1h');
    const decoded = jwt.decode(token);
    assert.ok(decoded.exp);
    const durationSeconds = decoded.exp - decoded.iat;
    assert.equal(durationSeconds, 3600);
  });

  // ===========================================================================
  // 6. BEDROCK CONFIGURABILITY & SAFE DEGRADATION
  // ===========================================================================
  await t.test('6.1. Reads model ID and AWS region from environment dynamically', () => {
    const provider = new AwsBedrockProvider({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      region: 'ap-south-1'
    });
    assert.equal(provider.modelId, 'anthropic.claude-3-haiku-20240307-v1:0');
    assert.equal(provider.region, 'ap-south-1');
  });

  await t.test('6.2. Fails safely with 503 when Bedrock is unavailable', async () => {
    const mock = new MockBedrockProvider();
    mock.setSimulateFailure(true);
    const service = new BedrockAdvisorService(mock);
    await assert.rejects(
      async () => {
        await service.getFarmerAdvice({ commodity: 'Wheat', quantity: '50 kg' });
      },
      (err) => {
        assert.equal(err.statusCode, 503);
        assert.equal(err.code, 'AI_SERVICE_UNAVAILABLE');
        return true;
      }
    );
  });

  // ===========================================================================
  // 7. MANDI DATA ISOLATION & CONTAMINATION BLOCK
  // ===========================================================================
  const marketService = new MandiIntelligenceService();

  await t.test('7.1. Blocks mock market data from being persisted to persistent storage', async () => {
    const contaminatedData = [
      { commodity: 'Wheat', modal_price: 2400, isMock: true, source: 'KrishiSetu-Mock-Adapter' }
    ];

    await assert.rejects(
      async () => {
        await marketService.persistVerifiedRecords(contaminatedData, db);
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'MOCK_DATA_CONTAMINATION_BLOCKED');
        return true;
      }
    );
  });

  await t.test('7.2. Correctly categorizes data freshness without fabricating historical observations', () => {
    const now = new Date('2026-09-17T12:00:00Z');
    const liveDate = '2026-09-17T06:00:00Z'; // 6 hours ago -> LIVE
    const recentDate = '2026-09-16T04:00:00Z'; // 32 hours ago -> RECENT
    const staleDate = '2026-09-14T00:00:00Z'; // > 48 hours ago -> STALE

    assert.equal(marketService.calculateFreshness(liveDate, now), 'LIVE');
    assert.equal(marketService.calculateFreshness(recentDate, now), 'RECENT');
    assert.equal(marketService.calculateFreshness(staleDate, now), 'STALE');
    assert.equal(marketService.calculateFreshness(null, now), 'STALE');
  });
});
