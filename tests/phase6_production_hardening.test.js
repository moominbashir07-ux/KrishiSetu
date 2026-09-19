/**
 * KrishiSetu 2.0 — Phase 6: Production Hardening, Observability & Final Trust Layer
 * Automated Test Suite
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../server');
const db = require('../db/db');
const { generateToken, getJwtSecret, KNOWN_JWT_PLACEHOLDERS, authenticateUser } = require('../middleware/auth');
const { MandiIntelligenceService } = require('../services/market/mandiIntelligenceService');
const { ProductQualityService } = require('../services/quality/productQualityService');
const { DisputeStateMachine } = require('../services/dispute/disputeStateMachine');

describe('Phase 6: Production Hardening & Observability Suite', () => {
  let server;
  let baseUrl;
  let adminToken;
  let sellerToken;
  let buyerToken;
  let testOrderId;
  let originalNodeEnv;
  let originalJwtSecret;

  before(async () => {
    originalNodeEnv = process.env.NODE_ENV;
    originalJwtSecret = process.env.JWT_SECRET;
    await db.initDb();

    // Create test accounts
    await db.query(
      'INSERT INTO users (id, name, contact, password_hash, role, account_status) VALUES ($1, $2, $3, $4, $5, $6)',
      ['U_P6_SELLER', 'P6 Seller Farmer', 'seller.p6@farm.org', 'hash', 'seller', 'active']
    );
    await db.query(
      'INSERT INTO users (id, name, contact, password_hash, role, account_status) VALUES ($1, $2, $3, $4, $5, $6)',
      ['U_P6_BUYER', 'P6 Buyer Customer', 'buyer.p6@market.org', 'hash', 'customer', 'active']
    );
    await db.query(
      'INSERT INTO users (id, name, contact, password_hash, role, account_status) VALUES ($1, $2, $3, $4, $5, $6)',
      ['U_P6_FROZEN', 'P6 Frozen User', 'frozen.p6@test.org', 'hash', 'customer', 'frozen']
    );
    await db.query(
      'INSERT INTO users (id, name, contact, password_hash, role, account_status) VALUES ($1, $2, $3, $4, $5, $6)',
      ['U_P6_ADMIN', 'P6 Admin User', 'admin.p6@krishi.org', 'hash', 'admin', 'active']
    );
    await db.query(
      'INSERT INTO users (id, name, contact, password_hash, role, account_status) VALUES ($1, $2, $3, $4, $5, $6)',
      ['U_P6_OTHER_SELLER', 'P6 Other Seller Farmer', 'other.seller.p6@farm.org', 'hash', 'seller', 'active']
    );

    adminToken = generateToken({ id: 'U_P6_ADMIN', name: 'P6 Admin User', role: 'admin' });
    sellerToken = generateToken({ id: 'U_P6_SELLER', name: 'P6 Seller Farmer', role: 'seller' });
    buyerToken = generateToken({ id: 'U_P6_BUYER', name: 'P6 Buyer Customer', role: 'customer' });

    // Seed terminal order for state machine audit
    testOrderId = 'ORD_P6_TERMINAL_' + Date.now();
    await db.query(
      `INSERT INTO orders (id, order_number, customer_id, seller_id, status, step, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testOrderId, 'KS-2026-P6-999', 'U_P6_BUYER', 'U_P6_SELLER', 'Completed', 5, 250.00]
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
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, headers: res.headers, data };
  }

  // ---------------------------------------------------------------------------
  // 1. Observability & Correlation ID Verification
  // ---------------------------------------------------------------------------
  describe('1. Request Correlation ID & Observability', () => {
    test('Automatically assigns x-request-id to incoming requests if not provided', async () => {
      const res = await api('/health');
      assert.strictEqual(res.status, 200);
      const reqId = res.headers.get('x-request-id');
      assert.ok(reqId, 'Response header must include x-request-id');
      assert.ok(reqId.startsWith('REQ_'), `Request ID format should start with REQ_, got: ${reqId}`);
    });

    test('Preserves client-supplied x-request-id header for distributed tracing', async () => {
      const customTraceId = 'CLIENT_TRACE_' + Date.now();
      const res = await api('/health', {
        headers: { 'x-request-id': customTraceId }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('x-request-id'), customTraceId);
    });

    test('Error responses include correlation requestId and machine-readable code', async () => {
      const res = await api('/api/orders/non-existent-id/status', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({ status: 'Preparing' })
      });
      assert.strictEqual(res.status, 404);
      assert.ok(res.data.requestId, 'Error payload must contain requestId');
      assert.ok(res.headers.get('x-request-id'), 'Error header must contain x-request-id');
      assert.strictEqual(res.headers.get('x-request-id'), res.data.requestId);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Production Security & Insecure JWT Secret Guard
  // ---------------------------------------------------------------------------
  describe('2. Security Guard & Insecure JWT Rejection in Production', () => {
    test('Throws INSECURE_JWT_SECRET if production runs with known default placeholder', () => {
      process.env.NODE_ENV = 'production';
      for (const badPlaceholder of KNOWN_JWT_PLACEHOLDERS) {
        process.env.JWT_SECRET = badPlaceholder;
        assert.throws(
          () => getJwtSecret(),
          (err) => {
            assert.strictEqual(err.code, 'INSECURE_JWT_SECRET');
            assert.ok(err.message.includes('Production rejects default/example JWT placeholder'));
            return true;
          }
        );
      }
      process.env.NODE_ENV = 'test';
      process.env.JWT_SECRET = originalJwtSecret;
    });

    test('Rejects authentication when account_status is frozen with 403', async () => {
      const frozenToken = generateToken({ id: 'U_P6_FROZEN', name: 'Frozen User', role: 'customer' });
      const res = await api('/api/auth/me', {
        headers: { Authorization: `Bearer ${frozenToken}` }
      });
      assert.strictEqual(res.status, 403);
      assert.ok(res.data.error.includes('frozen'));
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Order State Machine Hardening (Terminal State Immutability)
  // ---------------------------------------------------------------------------
  describe('3. Order State Machine Hardening', () => {
    test('Completed order cannot transition to any other status', async () => {
      const attempts = ['Order Placed', 'Farmer Confirmed', 'Preparing', 'Ready', 'Cancelled'];
      for (const targetState of attempts) {
        const res = await api(`/api/orders/${testOrderId}/status`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${sellerToken}` },
          body: JSON.stringify({ status: targetState })
        });
        assert.strictEqual(res.status, 400);
        assert.ok(res.data.error.includes('Invalid status transition'));
      }
    });

    test('Non-owner seller cannot modify an order (IDOR shield)', async () => {
      // Create another seller
      const otherSellerToken = generateToken({ id: 'U_P6_OTHER_SELLER', name: 'Other Seller', role: 'seller' });
      const res = await api(`/api/orders/${testOrderId}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${otherSellerToken}` },
        body: JSON.stringify({ status: 'Cancelled' })
      });
      assert.strictEqual(res.status, 403);
      assert.ok(res.data.error.toLowerCase().includes('forbidden') || res.data.error.toLowerCase().includes('only update status'));
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Market Intelligence Trust & Freshness Hierarchy
  // ---------------------------------------------------------------------------
  describe('4. Market Intelligence Trust Layer', () => {
    const service = new MandiIntelligenceService();

    test('Correctly computes data freshness categories without hallucination', () => {
      const now = new Date('2026-09-19T12:00:00Z');

      // 6 hours old -> LIVE
      const liveDate = new Date(now.getTime() - 6 * 3600 * 1000).toISOString();
      assert.strictEqual(service.calculateFreshness(liveDate, now), 'LIVE');

      // 36 hours old -> RECENT
      const recentDate = new Date(now.getTime() - 36 * 3600 * 1000).toISOString();
      assert.strictEqual(service.calculateFreshness(recentDate, now), 'RECENT');

      // 72 hours old -> STALE
      const staleDate = new Date(now.getTime() - 72 * 3600 * 1000).toISOString();
      assert.strictEqual(service.calculateFreshness(staleDate, now), 'STALE');

      // Missing / null date -> UNAVAILABLE
      assert.strictEqual(service.calculateFreshness(null, now, true), 'UNAVAILABLE');
    });

    test('DataGov provider isolates mock data from official streams', () => {
      const status = service.getProviderStatus();
      assert.strictEqual(status.mockIsolationActive, true);
      assert.ok(['datagov', 'mock'].includes(status.activeProvider));
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Product Quality Trust & Display Badges
  // ---------------------------------------------------------------------------
  describe('5. Product Quality Hierarchy & Badging', () => {
    test('formatDisplayBadge strictly labels official certification vs seller declaration', () => {
      const sellerBadge = ProductQualityService.formatDisplayBadge({
        verificationType: 'SELLER_DECLARED',
        declaredGrade: 'Grade A',
        isCertified: false
      });
      assert.strictEqual(sellerBadge, 'Seller-Declared: Grade A');

      const aiBadge = ProductQualityService.formatDisplayBadge({
        verificationType: 'AI_ASSISTED_ESTIMATE',
        declaredGrade: 'Grade B',
        isCertified: false
      });
      assert.strictEqual(aiBadge, 'AI-Assisted Visual Estimate: Grade B');

      const certBadge = ProductQualityService.formatDisplayBadge({
        verificationType: 'CERTIFIED_AGMARK',
        declaredGrade: 'Grade A',
        isCertified: true
      });
      assert.strictEqual(certBadge, 'Officially Certified: Grade A');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Dispute Resolution Authorization & Terminal State Protection
  // ---------------------------------------------------------------------------
  describe('6. Dispute System Role Shield', () => {
    test('Non-admin users are rejected from resolving disputes with 403', async () => {
      const res = await api('/api/disputes/DISP_FAKE_1/resolve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${buyerToken}` },
        body: JSON.stringify({ resolutionStatus: 'RESOLVED', resolutionNotes: 'Refund customer' })
      });
      assert.strictEqual(res.status, 403);
    });

    test('DisputeStateMachine defines valid transitions and immutable terminal states', () => {
      assert.strictEqual(DisputeStateMachine.isTerminal('RESOLVED'), true);
      assert.strictEqual(DisputeStateMachine.isTerminal('REJECTED'), true);
      assert.strictEqual(DisputeStateMachine.isTerminal('CANCELLED'), true);
      assert.strictEqual(DisputeStateMachine.isTerminal('OPEN'), false);

      assert.strictEqual(DisputeStateMachine.canTransition('RESOLVED', 'OPEN'), false);
      assert.strictEqual(DisputeStateMachine.canTransition('REJECTED', 'RESOLVED'), false);
    });
  });
});
