const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db/db');
const { JWT_SECRET } = require('../middleware/auth');
const { StorageService } = require('../services/storage/storageService');
const { BedrockAdvisorService } = require('../services/ai/bedrockAdvisorService');
const AwsBedrockProvider = require('../services/ai/awsBedrockProvider');
const { ProductQualityService } = require('../services/quality/productQualityService');
const { validateEnv } = require('../config/env');
const fs = require('fs');
const path = require('path');

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
    const postData = body !== null ? body : options.body;
    if (postData !== undefined && postData !== null) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

test('KrishiSetu Phase 3 Remediation Regression Test Suite', async (t) => {
  let adminToken, customerToken, sellerToken;
  let adminId, customerId, sellerId;

  await t.test('0. Setup Test Server and Database', async () => {
    await db.initDb();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        testPort = server.address().port;
        resolve();
      });
    });

    const suffix = Date.now();
    adminId = 'U_ADMIN_' + suffix;
    customerId = 'U_CUST_' + suffix;
    sellerId = 'U_SELLER_' + suffix;

    await db.query(
      `INSERT INTO users (id, name, contact, password_hash, role, account_status, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [adminId, 'Admin Remediation', 'admin_rem@test.com', 'hash', 'admin', 'active', true]
    );
    await db.query(
      `INSERT INTO users (id, name, contact, password_hash, role, account_status, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [customerId, 'Customer Remediation', 'cust_rem@test.com', 'hash', 'customer', 'active', true]
    );
    await db.query(
      `INSERT INTO users (id, name, contact, password_hash, role, account_status, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sellerId, 'Seller Remediation', 'sell_rem@test.com', 'hash', 'seller', 'active', true]
    );

    adminToken = jwt.sign({ id: adminId, role: 'admin', name: 'Admin Remediation' }, JWT_SECRET, { expiresIn: '1h' });
    customerToken = jwt.sign({ id: customerId, role: 'customer', name: 'Customer Remediation' }, JWT_SECRET, { expiresIn: '1h' });
    sellerToken = jwt.sign({ id: sellerId, role: 'seller', name: 'Seller Remediation' }, JWT_SECRET, { expiresIn: '1h' });
  });

  await t.test('ISSUE 4: POST /api/storage/mock-upload is gated against production', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const res = await makeRequest('/api/storage/mock-upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sellerToken}`,
          'Content-Type': 'application/json'
        }
      }, {
        key: 'evidence/test.jpg',
        fileContent: 'base64test'
      });
      assert.equal(res.status, 403, 'Mock upload must return 403 in production');
      assert.equal(res.body.error.code, 'MOCK_STORAGE_DISABLED_IN_PRODUCTION');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  await t.test('ISSUE 5: StorageService.validateExpiresIn handles boundary, invalid, and malformed inputs', () => {
    const service = new StorageService();

    // Valid values
    assert.equal(service.validateExpiresIn(60), 60);
    assert.equal(service.validateExpiresIn(3600), 3600);
    assert.equal(service.validateExpiresIn('300'), 300);
    assert.equal(service.validateExpiresIn(undefined, 900), 900);

    // Invalid values: 0, negative, NaN, Infinity, excessively large, malformed strings, non-numeric types
    assert.throws(() => service.validateExpiresIn(0), /expiresIn/);
    assert.throws(() => service.validateExpiresIn(-15), /expiresIn/);
    assert.throws(() => service.validateExpiresIn(NaN), /expiresIn/);
    assert.throws(() => service.validateExpiresIn(Infinity), /expiresIn/);
    assert.throws(() => service.validateExpiresIn(3601), /expiresIn/);
    assert.throws(() => service.validateExpiresIn(999999), /expiresIn/);
    assert.throws(() => service.validateExpiresIn('invalid_string'), /expiresIn/);
    assert.throws(() => service.validateExpiresIn(''), /expiresIn/);
    assert.throws(() => service.validateExpiresIn({}), /expiresIn/);
    assert.throws(() => service.validateExpiresIn([]), /expiresIn/);
    assert.throws(() => service.validateExpiresIn(true), /expiresIn/);
  });

  await t.test('ISSUE 6: Storage signed URL rejects non-existent target records with 404', async () => {
    // Non-existent product
    const resProduct = await makeRequest('/api/storage/presigned-url', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sellerToken}`,
        'Content-Type': 'application/json'
      }
    }, {
      entityType: 'product',
      entityId: 'NON_EXISTENT_PROD_123',
      mimeType: 'image/jpeg',
      fileSizeBytes: 1024
    });
    assert.equal(resProduct.status, 404, 'Must return 404 for non-existent product');
    assert.equal(resProduct.body.error.code, 'ENTITY_NOT_FOUND');

    // Non-existent dispute
    const resDispute = await makeRequest('/api/storage/presigned-url', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${customerToken}`,
        'Content-Type': 'application/json'
      }
    }, {
      entityType: 'dispute',
      entityId: 'NON_EXISTENT_DISPUTE_999',
      mimeType: 'image/jpeg',
      fileSizeBytes: 1024
    });
    assert.equal(resDispute.status, 404, 'Must return 404 for non-existent dispute');
    assert.equal(resDispute.body.error.code, 'ENTITY_NOT_FOUND');
  });

  await t.test('ISSUE 7: PostgreSQL TLS configuration enforces certificate verification in production', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalInsecure = process.env.DB_SSL_ALLOW_INSECURE;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.DB_SSL_ALLOW_INSECURE;
      const configProd = db.getPgSslConfig();
      assert.ok(configProd !== false, 'SSL config must be enabled');
      assert.equal(configProd.rejectUnauthorized, true, 'rejectUnauthorized must be true in production');

      // In production, DB_SSL_ALLOW_INSECURE must NOT be allowed to disable rejectUnauthorized
      process.env.DB_SSL_ALLOW_INSECURE = 'true';
      const configProdOverride = db.getPgSslConfig();
      assert.equal(configProdOverride.rejectUnauthorized, true, 'Production must never disable rejectUnauthorized');
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalInsecure) process.env.DB_SSL_ALLOW_INSECURE = originalInsecure;
      else delete process.env.DB_SSL_ALLOW_INSECURE;
    }
  });

  await t.test('ISSUE 9 & 10: Startup env validation rejects known JWT placeholders in production', () => {
    // Known placeholder secret in production should fail validation
    const invalidResult = validateEnv({
      NODE_ENV: 'production',
      PORT: '5000',
      DATABASE_URL: 'postgres://user:pass@host:5432/db',
      JWT_SECRET: 'krishisetu_super_secret_jwt_key_development_only_change_in_prod',
      STORAGE_PROVIDER: 'mock',
      AI_PROVIDER: 'mock'
    });
    assert.equal(invalidResult.valid, false);
    assert.ok(invalidResult.missing.some(m => m.includes('JWT placeholder')));

    // Strict mode throws
    assert.throws(() => {
      validateEnv({
        NODE_ENV: 'production',
        PORT: '5000',
        DATABASE_URL: 'postgres://user:pass@host:5432/db',
        JWT_SECRET: 'krishisetu_super_secret_jwt_key_development_only_change_in_prod',
        STORAGE_PROVIDER: 'mock',
        AI_PROVIDER: 'mock',
        strict: true
      });
    }, /JWT placeholder/);

    // Valid production secret passes
    const validEnv = validateEnv({
      NODE_ENV: 'production',
      PORT: '5000',
      DATABASE_URL: 'postgres://user:pass@host:5432/db',
      JWT_SECRET: 'real_production_jwt_secret_with_sufficient_entropy_random_value_2026',
      STORAGE_PROVIDER: 'mock',
      AI_PROVIDER: 'mock'
    });
    assert.equal(validEnv.isProduction, true);
  });

  await t.test('ISSUE 12: Advisor treats client-supplied prices as untrusted input with provenance separation', async () => {
    const advisor = new BedrockAdvisorService();
    const result = await advisor.getFarmerAdvice({
      commodity: 'Tomato',
      location: 'Nashik',
      currentPrices: { 'Nashik APMC': 9999.99 } // Forged client-declared price
    });

    assert.ok(result.data, 'Result must contain data payload');
    assert.ok(result.data.provenance, 'Result must contain provenance metadata');
    assert.equal(result.data.provenance.clientPricesAreVerified, false, 'Client price must never be marked verified');
    assert.ok(result.data.disclaimer.includes('Client-declared prices are unverified'));
  });

  await t.test('ISSUE 14, 17, 19: Provider selection, region source, and production mock rejection', async () => {
    // 14: AwsBedrockProvider checks this.region against supported regions
    const validRegionProvider = new AwsBedrockProvider({ region: 'ap-south-1' });
    assert.equal(validRegionProvider.isAvailable(), true);

    const invalidRegionProvider = new AwsBedrockProvider({ region: 'invalid-region-9' });
    assert.equal(invalidRegionProvider.isAvailable(), false);

    // 17 & 19: Coherence and production mock rejection
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.AWS_ACCESS_KEY_ID;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.AWS_ACCESS_KEY_ID; // Missing AWS credentials

      const advisorProd = new BedrockAdvisorService();
      const status = advisorProd.getProviderStatus();

      // Status must not say Mock when in production without credentials
      assert.equal(status.isMock, false, 'Production provider status must not be mock');
      assert.equal(status.selectedProvider, 'aws');

      // Generating advice must fail-fast with 503 rather than silently mocking
      await assert.rejects(async () => {
        await advisorProd.getFarmerAdvice({ commodity: 'Wheat' });
      }, (err) => err.code === 'AI_SERVICE_UNAVAILABLE' || err.message.includes('Amazon Bedrock'));
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalKey) process.env.AWS_ACCESS_KEY_ID = originalKey;
    }
  });

  await t.test('ISSUE 16 & 22: resolveDispute authorization prevents customer/seller and enforces admin-only', async () => {
    // Create an order and a dispute
    const orderId = 'ORD_DISP_' + Date.now();
    await db.query(
      `INSERT INTO orders (id, order_number, customer_id, seller_id, status, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId, 'KS-2026-DISP', customerId, sellerId, 'Delivered', 200]
    );

    // Customer opens dispute
    const openRes = await makeRequest('/api/disputes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${customerToken}`,
        'Content-Type': 'application/json'
      }
    }, {
      orderId,
      reason: 'quality_mismatch',
      description: 'Items delivered were damaged and rotten upon inspection.'
    });
    assert.equal(openRes.status, 201, 'Dispute creation must succeed');
    const disputeId = openRes.body.dispute.id;

    // Customer attempts to resolve dispute => 403
    const custResolve = await makeRequest(`/api/disputes/${disputeId}/resolve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${customerToken}`,
        'Content-Type': 'application/json'
      }
    }, {
      resolution: 'refund_full',
      adminNotes: 'Customer attempting self-resolution'
    });
    assert.equal(custResolve.status, 403, 'Customer must be rejected with 403');
    assert.equal((custResolve.body.error || custResolve.body).code, 'UNAUTHORIZED_DISPUTE_RESOLUTION');

    // Seller attempts to resolve dispute => 403
    const sellerResolve = await makeRequest(`/api/disputes/${disputeId}/resolve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sellerToken}`,
        'Content-Type': 'application/json'
      }
    }, {
      resolution: 'reject_claim',
      adminNotes: 'Seller attempting self-resolution'
    });
    assert.equal(sellerResolve.status, 403, 'Seller must be rejected with 403');
    assert.equal((sellerResolve.body.error || sellerResolve.body).code, 'UNAUTHORIZED_DISPUTE_RESOLUTION');

    // Advance to UNDER_REVIEW so dispute is in a valid resolvable state
    const { disputeService } = require('../routes/disputes');
    await disputeService.repo.updateDispute(disputeId, { status: 'UNDER_REVIEW' });

    // Admin resolves dispute => 200
    const adminResolve = await makeRequest(`/api/disputes/${disputeId}/resolve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    }, {
      resolutionStatus: 'RESOLVED',
      resolutionNotes: 'Admin verified evidence and approved full refund.'
    });
    assert.equal(adminResolve.status, 200, 'Admin dispute resolution must succeed');
    assert.equal(adminResolve.body.dispute.status, 'RESOLVED');
  });

  await t.test('ISSUE 18: Quality badge formatting aligns with formatProductWithQuality', () => {
    assert.equal(ProductQualityService.formatDisplayBadge('CERTIFIED_AGMARK'), 'Officially Certified: Standard');
    assert.equal(ProductQualityService.formatDisplayBadge('AI_ASSISTED_ESTIMATE'), 'AI-Assisted Visual Estimate: Standard');
    assert.equal(ProductQualityService.formatDisplayBadge('SELLER_DECLARED'), 'Seller-Declared: Standard');
    assert.equal(ProductQualityService.formatDisplayBadge('UNKNOWN_TIER'), 'Seller-Declared: Standard');
  });

  await t.test('ISSUE 21: Service worker sw.js reuses existing client and navigates to clickAction', () => {
    const swContent = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
    assert.ok(swContent.includes('client.navigate(clickAction)'), 'sw.js must navigate existing client');
    assert.ok(swContent.includes('includeUncontrolled: true'), 'sw.js must search all window clients');
    assert.ok(swContent.includes('client.focus()'), 'sw.js must focus existing client');
  });

  await t.test('Teardown test server', async () => {
    await new Promise((resolve) => server.close(resolve));
  });
});
