/**
 * KrishiSetu 2.0 — Phase 7: Production Readiness, Deployment Verification & Demo Hardening
 * Master Comprehensive Test Suite
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../server');
const db = require('../db/db');
const { validateEnv, getSanitizedDbUrl } = require('../config/env');
const { generateToken, getJwtSecret } = require('../middleware/auth');
const { MandiIntelligenceService } = require('../services/market/mandiIntelligenceService');
const { BedrockAdvisorService } = require('../services/ai/bedrockAdvisorService');
const { DisputeStateMachine } = require('../services/dispute/disputeStateMachine');

describe('Phase 7: Production Readiness & Deployment Verification Suite', () => {
  let server;
  let baseUrl;
  let adminToken;
  let sellerToken;
  let buyerToken;
  let otherSellerToken;
  let testProductId;
  let createdOrderId;
  let originalNodeEnv;
  let originalJwtSecret;

  before(async () => {
    originalNodeEnv = process.env.NODE_ENV;
    originalJwtSecret = process.env.JWT_SECRET;
    await db.initDb();

    // Seed test users with clean IDs
    await db.query(
      'INSERT INTO users (id, name, contact, password_hash, role, account_status) VALUES ($1, $2, $3, $4, $5, $6)',
      ['U_P7_ADMIN', 'P7 Platform Admin', 'admin.p7@krishi.gov.in', 'hash', 'admin', 'active']
    );
    await db.query(
      'INSERT INTO users (id, name, contact, password_hash, role, account_status) VALUES ($1, $2, $3, $4, $5, $6)',
      ['U_P7_SELLER', 'P7 Farmer Seller', 'farmer.p7@agri.org', 'hash', 'seller', 'active']
    );
    await db.query(
      'INSERT INTO users (id, name, contact, password_hash, role, account_status) VALUES ($1, $2, $3, $4, $5, $6)',
      ['U_P7_BUYER', 'P7 Wholesale Buyer', 'buyer.p7@market.org', 'hash', 'customer', 'active']
    );
    await db.query(
      'INSERT INTO users (id, name, contact, password_hash, role, account_status) VALUES ($1, $2, $3, $4, $5, $6)',
      ['U_P7_OTHER_SELLER', 'P7 Rival Seller', 'rival.p7@agri.org', 'hash', 'seller', 'active']
    );

    adminToken = generateToken({ id: 'U_P7_ADMIN', name: 'P7 Platform Admin', role: 'admin' });
    sellerToken = generateToken({ id: 'U_P7_SELLER', name: 'P7 Farmer Seller', role: 'seller' });
    buyerToken = generateToken({ id: 'U_P7_BUYER', name: 'P7 Wholesale Buyer', role: 'customer' });
    otherSellerToken = generateToken({ id: 'U_P7_OTHER_SELLER', name: 'P7 Rival Seller', role: 'seller' });

    // Seed initial product for inventory and checkout tests
    testProductId = 'PROD_P7_ONION_' + Date.now();
    await db.query(
      `INSERT INTO products (id, seller_id, name, commodity, variety, quantity, unit, price_per_unit, location, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [testProductId, 'U_P7_SELLER', 'Nashik Red Onion Grade A', 'Onion', 'Garwa', 100, 'kg', 28.50, 'Nashik, Maharashtra', 'active']
    );

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.JWT_SECRET = originalJwtSecret;
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  async function api(endpoint, options = {}) {
    const url = `${baseUrl}${endpoint}`;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const res = await fetch(url, { ...options, headers });
    let data;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, headers: res.headers, data };
  }

  // ===========================================================================
  // 1. Production Configuration Validation Layer
  // ===========================================================================
  describe('1. Production Configuration Validation', () => {
    test('validateEnv flags missing production variables and malformed URLs', () => {
      const prodEnv = {
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'invalid-db-uri',
        JWT_SECRET: 'short',
        ADMIN_BOOTSTRAP_KEY: ''
      };

      const result = validateEnv({ env: prodEnv, silent: true });
      assert.strictEqual(result.valid, false);
      assert.ok(result.missing.some(m => m.includes('Invalid DATABASE_URL')));
      assert.ok(result.missing.some(m => m.includes('JWT placeholder or insecure secret')));
      assert.ok(result.missing.some(m => m.includes('ADMIN_BOOTSTRAP_KEY')));
    });

    test('validateEnv requires AWS S3 bucket and region when STORAGE_PROVIDER is s3 in prod', () => {
      const mockDbUrl = ['postgresql:', '//test_user:test_pass', '@127.0.0.1:5432/test_db'].join('');
      const s3Env = {
        NODE_ENV: 'production',
        DATABASE_URL: mockDbUrl,
        JWT_SECRET: 'a_very_strong_secure_jwt_secret_key_for_prod_2026',
        ADMIN_BOOTSTRAP_KEY: 'boot-key-12345',
        STORAGE_PROVIDER: 's3'
      };

      const result = validateEnv({ env: s3Env, silent: true });
      assert.strictEqual(result.valid, false);
      assert.ok(result.missing.some(m => m.includes('AWS_S3_MEDIA_BUCKET')));
      assert.ok(result.missing.some(m => m.includes('AWS_REGION or AWS_DEFAULT_REGION')));
    });

    test('validateEnv requires AWS region when BEDROCK_PROVIDER is aws in prod', () => {
      const mockDbUrl = ['postgresql:', '//test_user:test_pass', '@127.0.0.1:5432/test_db'].join('');
      const aiEnv = {
        NODE_ENV: 'production',
        DATABASE_URL: mockDbUrl,
        JWT_SECRET: 'a_very_strong_secure_jwt_secret_key_for_prod_2026',
        ADMIN_BOOTSTRAP_KEY: 'boot-key-12345',
        BEDROCK_PROVIDER: 'aws'
      };

      const result = validateEnv({ env: aiEnv, silent: true });
      assert.strictEqual(result.valid, false);
      assert.ok(result.missing.some(m => m.includes('AWS_REGION, BEDROCK_REGION, or AWS_DEFAULT_REGION')));
    });

    test('getSanitizedDbUrl masks username and password without leaking connection string', () => {
      const mockSensitiveUrl = ['postgresql:', '//admin_user:super_secret_password_123', '@test-pooler.local:6543/postgres'].join('');
      const sanitized = getSanitizedDbUrl(mockSensitiveUrl);
      assert.strictEqual(sanitized.includes('super_secret_password_123'), false);
      assert.ok(sanitized.includes('****'));
    });
  });

  // ===========================================================================
  // 2. Health & Readiness Observability Endpoints
  // ===========================================================================
  describe('2. Health & Readiness Observability Endpoints', () => {
    test('GET /api/health and /health report process liveness with correlation ID', async () => {
      for (const path of ['/api/health', '/health']) {
        const res = await api(path);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.status, 'ok');
        assert.ok(typeof res.data.uptime === 'number');
        assert.ok(res.data.timestamp);
        assert.ok(res.data.requestId);
        assert.ok(res.headers.get('x-request-id'));
        // Never leaks connection string
        assert.strictEqual(JSON.stringify(res.data).includes('postgresql://'), false);
      }
    });

    test('GET /api/ready and /ready return structured readiness checks', async () => {
      for (const path of ['/api/ready', '/ready']) {
        const res = await api(path);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.status, 'ready');
        assert.ok(res.data.checks);
        assert.ok(['ok', 'ok (fallback)', 'connected'].includes(res.data.checks.database));
        assert.strictEqual(res.data.checks.storage, 'ok');
        assert.ok(['configured', 'configured (mock)'].includes(res.data.checks.ai));
        assert.strictEqual(res.data.checks.marketData, 'available');
        assert.ok(res.data.requestId);
      }
    });
  });

  // ===========================================================================
  // 3. End-to-End Critical User Flows
  // ===========================================================================
  describe('3. End-to-End Critical User Flows', () => {
    test('Buyer Flow: Browse products, place order, inspect order with snapshots', async () => {
      // 1. Browse products
      const listRes = await api('/api/products');
      assert.strictEqual(listRes.status, 200);
      const product = listRes.data.products.find(p => p.id === testProductId);
      assert.ok(product, 'Test product must be listed in active catalog');

      // 2. Place order
      const orderRes = await api('/api/orders', {
        method: 'POST',
        headers: { Authorization: `Bearer ${buyerToken}` },
        body: JSON.stringify({
          productId: testProductId,
          quantity: 10,
          customer_name: 'P7 Wholesale Buyer',
          customer_phone: '9876543210',
          delivery_address: 'APMC Market Yard Shop 42, Mumbai',
          delivery_city: 'Mumbai',
          delivery_state: 'Maharashtra',
          delivery_pincode: '400705'
        })
      });

      assert.strictEqual(orderRes.status, 201);
      assert.ok(orderRes.data.order);
      createdOrderId = orderRes.data.order.internalId || orderRes.data.order.id;

      // 3. Inspect single order with snapshot item verification
      const getRes = await api(`/api/orders/${createdOrderId}`, {
        headers: { Authorization: `Bearer ${buyerToken}` }
      });
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.data.order.status, 'Order Placed');
      assert.strictEqual(getRes.data.order.step, 1);
      assert.ok(getRes.data.order.items.length > 0);
      assert.strictEqual(getRes.data.order.items[0].product_id, testProductId);
    });

    test('Seller Flow: Update order lifecycle sequentially and verify audit log', async () => {
      assert.ok(createdOrderId, 'Order must be created in prior step');

      // Step 2: Farmer Confirmed
      const step2 = await api(`/api/orders/${createdOrderId}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({ status: 'Farmer Confirmed' })
      });
      assert.strictEqual(step2.status, 200);

      // Step 3: Preparing
      const step3 = await api(`/api/orders/${createdOrderId}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({ status: 'Preparing' })
      });
      assert.strictEqual(step3.status, 200);

      // Step 4: Ready
      const step4 = await api(`/api/orders/${createdOrderId}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({ status: 'Ready' })
      });
      assert.strictEqual(step4.status, 200);

      // Step 5: Completed
      const step5 = await api(`/api/orders/${createdOrderId}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({ status: 'Completed' })
      });
      assert.strictEqual(step5.status, 200);

      // Verify audit history contains sequential records
      const finalRes = await api(`/api/orders/${createdOrderId}`, {
        headers: { Authorization: `Bearer ${sellerToken}` }
      });
      assert.strictEqual(finalRes.status, 200);
      assert.strictEqual(finalRes.data.order.status, 'Completed');
      assert.strictEqual(finalRes.data.order.step, 5);
      assert.ok(finalRes.data.order.history.length >= 4);
    });

    test('Admin Flow: Resolve dispute and verify unauthorized access returns 403', async () => {
      // 1. Create a test dispute through the dispute API
      const createDisputeRes = await api('/api/disputes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${buyerToken}` },
        body: JSON.stringify({
          orderId: createdOrderId,
          reason: 'QUALITY_MISMATCH',
          description: 'Produce received bruised and substandard',
          claimedCondition: 'BRUISED'
        })
      });
      assert.strictEqual(createDisputeRes.status, 201);
      const dispId = createDisputeRes.data.dispute.id;

      // 2. Buyer attempts to resolve dispute -> 403 Forbidden
      const unauthorizedRes = await api(`/api/disputes/${dispId}/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${buyerToken}` },
        body: JSON.stringify({ resolutionStatus: 'RESOLVED', resolutionNotes: 'Refund customer' })
      });
      assert.strictEqual(unauthorizedRes.status, 403);

      // 3. Seller responds to dispute -> transitions OPEN to SELLER_RESPONDED
      const sellerResp = await api(`/api/disputes/${dispId}/respond`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({
          responseNotes: 'Offering 20% discount on next delivery for bruising',
          offerType: 'PARTIAL_REFUND',
          offerAmount: 50
        })
      });
      assert.strictEqual(sellerResp.status, 200);

      // 4. Admin formally resolves dispute -> 200 Success
      const adminRes = await api(`/api/disputes/${dispId}/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ resolutionStatus: 'RESOLVED', resolutionNotes: 'Admin approved 20% credit refund' })
      });
      assert.strictEqual(adminRes.status, 200);
      assert.strictEqual(adminRes.data.dispute.status, 'RESOLVED');
    });
  });

  // ===========================================================================
  // 4. Order & Inventory Concurrency Hardening
  // ===========================================================================
  describe('4. Inventory Concurrency & State Machine Bounds', () => {
    test('Stock = 1 race: Concurrent checkouts prevent negative inventory & overselling', async () => {
      // Create product with quantity = 1 via products API
      const createProdRes = await api('/api/products', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({
          name: 'Limited Batch Saffron',
          category: 'Spices',
          price: 25000,
          quantity: 1,
          grade: 'Standard'
        })
      });
      assert.strictEqual(createProdRes.status, 201);
      const scarceProdId = createProdRes.data.product.id;

      // Fire 2 simultaneous checkout requests for the single available unit
      const checkout = () => api('/api/orders', {
        method: 'POST',
        headers: { Authorization: `Bearer ${buyerToken}` },
        body: JSON.stringify({
          productId: scarceProdId,
          quantity: 1,
          customer_name: 'Buyer Concurrent',
          customer_phone: '9988776655'
        })
      });

      const [res1, res2] = await Promise.all([checkout(), checkout()]);
      const statuses = [res1.status, res2.status].sort();

      // Exactly one must succeed (201) and the other must be rejected (400)
      assert.deepStrictEqual(statuses, [201, 400]);

      // Check product inventory in database
      const dbRes = await db.query('SELECT quantity, status FROM products WHERE id = $1', [scarceProdId]);
      assert.strictEqual(Number(dbRes.rows[0].quantity), 0);
      assert.strictEqual(dbRes.rows[0].status, 'out_of_stock');
    });

    test('Completed order cannot transition to any other status', async () => {
      const termRes = await api(`/api/orders/${createdOrderId || 'non-existent'}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({ status: 'Cancelled' })
      });
      assert.strictEqual(termRes.status, 400);
      assert.ok(termRes.data.error.includes('Invalid status transition'));
    });

    test('Non-owner seller is rejected with 403 from modifying orders', async () => {
      const idorRes = await api(`/api/orders/${createdOrderId}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${otherSellerToken}` },
        body: JSON.stringify({ status: 'Ready' })
      });
      assert.strictEqual(idorRes.status, 403);
    });
  });

  // ===========================================================================
  // 5. Market Data Provenance & Freshness Engine Boundaries
  // ===========================================================================
  describe('5. Market Data Freshness Boundaries & Isolation', () => {
    const service = new MandiIntelligenceService();

    test('Calculates exact 24h and 48h freshness thresholds without hallucination', () => {
      const baseTime = new Date('2026-09-19T12:00:00.000Z');

      // Exactly 24h ago -> LIVE
      const exactly24h = new Date(baseTime.getTime() - 24 * 3600 * 1000).toISOString();
      assert.strictEqual(service.calculateFreshness(exactly24h, baseTime), 'LIVE');

      // 24 hours + 1 minute -> RECENT
      const recent24h1m = new Date(baseTime.getTime() - (24 * 3600 + 60) * 1000).toISOString();
      assert.strictEqual(service.calculateFreshness(recent24h1m, baseTime), 'RECENT');

      // Exactly 48h ago -> RECENT
      const exactly48h = new Date(baseTime.getTime() - 48 * 3600 * 1000).toISOString();
      assert.strictEqual(service.calculateFreshness(exactly48h, baseTime), 'RECENT');

      // 48 hours + 1 minute -> STALE
      const stale48h1m = new Date(baseTime.getTime() - (48 * 3600 + 60) * 1000).toISOString();
      assert.strictEqual(service.calculateFreshness(stale48h1m, baseTime), 'STALE');

      // Null or invalid observation timestamp -> UNAVAILABLE
      assert.strictEqual(service.calculateFreshness(null, baseTime, true), 'UNAVAILABLE');
      assert.strictEqual(service.calculateFreshness('invalid-timestamp-string', baseTime, true), 'UNAVAILABLE');
    });

    test('Market Intelligence trend endpoint handles missing observations gracefully', async () => {
      const res = await api('/api/market-prices/trend?commodity=Dragonfruit&state=Maharashtra');
      assert.strictEqual(res.status, 200);
      assert.ok(res.data);
      // Empty/sparse data does not fabricate synthetic trend curves
      if (res.data.dataPoints && res.data.dataPoints.length < 2) {
        assert.strictEqual(res.data.sufficientData, false);
      }
    });
  });

  // ===========================================================================
  // 6. Bedrock AI Safety & Storage Security
  // ===========================================================================
  describe('6. Bedrock AI & Media Storage Security', () => {
    test('BedrockAdvisorService in production refuses silent mock AI fallback', () => {
      process.env.NODE_ENV = 'production';
      const prodAiService = new BedrockAdvisorService();
      const status = prodAiService.getProviderStatus();
      assert.strictEqual(status.isMock, false);
      assert.ok(['aws', 'unavailable'].includes(status.activeProvider));
      process.env.NODE_ENV = 'test';
    });

    test('Storage upload requests enforce ownership and reject customer role for product media', async () => {
      // Customer role cannot upload product media
      const customerUploadRes = await api('/api/storage/presigned-url', {
        method: 'POST',
        headers: { Authorization: `Bearer ${buyerToken}` },
        body: JSON.stringify({
          entityType: 'product',
          entityId: testProductId,
          mimeType: 'image/jpeg',
          fileSizeBytes: 102400
        })
      });
      assert.strictEqual(customerUploadRes.status, 403);

      // Rival seller cannot upload media for another seller's product (IDOR)
      const idorUploadRes = await api('/api/storage/presigned-url', {
        method: 'POST',
        headers: { Authorization: `Bearer ${otherSellerToken}` },
        body: JSON.stringify({
          entityType: 'product',
          entityId: testProductId,
          mimeType: 'image/jpeg',
          fileSizeBytes: 102400
        })
      });
      assert.strictEqual(idorUploadRes.status, 403);
    });

    test('Storage rejects executable file types and oversized payloads', async () => {
      const exeRes = await api('/api/storage/presigned-url', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({
          entityType: 'product',
          entityId: testProductId,
          mimeType: 'application/x-msdownload',
          fileSizeBytes: 50000
        })
      });
      assert.strictEqual(exeRes.status, 400);

      const oversizedRes = await api('/api/storage/presigned-url', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({
          entityType: 'product',
          entityId: testProductId,
          mimeType: 'image/jpeg',
          fileSizeBytes: 6 * 1024 * 1024 // 6 MB > 5 MB limit
        })
      });
      assert.strictEqual(oversizedRes.status, 400);
    });
  });

  // ===========================================================================
  // 7. Security Regressions & API Contract Consistency
  // ===========================================================================
  describe('7. Security Regressions & API Contract Consistency', () => {
    test('Unmatched API routes return 404 with standard code and requestId', async () => {
      const res = await api('/api/unmatched-route-xyz');
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.data.code, 'ENDPOINT_NOT_FOUND');
      assert.ok(res.data.requestId);
      assert.strictEqual(res.headers.get('x-request-id'), res.data.requestId);
    });

    test('Protected routes reject missing and expired tokens with 401', async () => {
      const noAuthRes = await api('/api/orders');
      assert.strictEqual(noAuthRes.status, 401);

      const expiredToken = generateToken({ id: 'U_P7_BUYER', role: 'customer' }, '0s');
      const expiredRes = await api('/api/orders', {
        headers: { Authorization: `Bearer ${expiredToken}` }
      });
      assert.strictEqual(expiredRes.status, 401);
      assert.ok(expiredRes.data.error.toLowerCase().includes('expired') || expiredRes.data.error.toLowerCase().includes('invalid'));
    });

    test('SQL injection attempt in query parameter is safely handled without error disclosure', async () => {
      const res = await api("/api/products?commodity=' OR '1'='1");
      assert.ok([200, 400].includes(res.status));
      assert.strictEqual(JSON.stringify(res.data).includes('syntax error'), false);
      assert.strictEqual(JSON.stringify(res.data).includes('SELECT'), false);
    });
  });
});
