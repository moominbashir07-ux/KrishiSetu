/**
 * KrishiSetu 2.0 — Phase 4: Trust, Market Intelligence & AI Decision Layer
 * Automated Test Suite
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../server');
const db = require('../db/db');
const { generateToken } = require('../middleware/auth');
const { MandiIntelligenceService } = require('../services/market/mandiIntelligenceService');
const { ProductQualityService } = require('../services/quality/productQualityService');
const { BedrockAdvisorService } = require('../services/ai/bedrockAdvisorService');
const { DisputeService } = require('../services/dispute/disputeService');
const DisputeRepository = require('../services/dispute/disputeRepository');

describe('Phase 4: Trust, Market Intelligence & AI Decision Layer Suite', () => {
  let server;
  let baseUrl;
  let adminToken;
  let sellerToken;
  let buyerToken;
  let intruderToken;

  const mandiService = new MandiIntelligenceService();
  const qualityService = new ProductQualityService();
  const aiService = new BedrockAdvisorService();

  before(async () => {
    await db.initDb();
    adminToken = generateToken({ id: 'U_ADMIN_DEFAULT', name: 'Master Admin', role: 'admin' });
    sellerToken = generateToken({ id: 'S101', name: 'Farmer Ramesh', role: 'seller' });
    buyerToken = generateToken({ id: 'C101', name: 'Customer Priya', role: 'customer' });
    intruderToken = generateToken({ id: 'C102', name: 'Unrelated User', role: 'customer' });

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers
    });
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, headers: res.headers, data };
  }

  // =========================================================================
  // 1. MARKET INTELLIGENCE & PROVENANCE
  // =========================================================================
  describe('1. Mandi Market Intelligence & Freshness Categorization', () => {
    test('1.1. Freshness correctly categorizes LIVE, RECENT, STALE, and UNAVAILABLE', () => {
      const now = new Date();
      const liveDate = new Date(now.getTime() - 5 * 3600000).toISOString();
      const recentDate = new Date(now.getTime() - 30 * 3600000).toISOString();
      const staleDate = new Date(now.getTime() - 72 * 3600000).toISOString();

      assert.strictEqual(mandiService.calculateFreshness(liveDate, now), 'LIVE');
      assert.strictEqual(mandiService.calculateFreshness(recentDate, now), 'RECENT');
      assert.strictEqual(mandiService.calculateFreshness(staleDate, now), 'STALE');
      assert.strictEqual(mandiService.calculateFreshness(null, now, true), 'UNAVAILABLE');
      assert.strictEqual(mandiService.calculateFreshness('invalid-timestamp', now, true), 'UNAVAILABLE');
    });

    test('1.2. Mandi comparison endpoint (/api/market-prices/compare) calculates spread & derived metrics without inventing government data', async () => {
      const res = await api('/api/market-prices/compare?commodity=Tomato&state=Maharashtra');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.commodity, 'Tomato');
      assert.strictEqual(res.data.state, 'Maharashtra');
      assert.ok(Array.isArray(res.data.markets));
      assert.ok(res.data.markets.length > 0);

      // Check summary metrics
      assert.ok(res.data.summary);
      assert.ok(res.data.summary.highestMandi);
      assert.ok(res.data.summary.lowestMandi);
      assert.ok(res.data.summary.priceSpread >= 0);
      assert.strictEqual(res.data.summary.isDerived, true);
      assert.strictEqual(res.data.summary.isOfficial, false);
    });

    test('1.3. Mandi comparison rejects missing commodity with 400', async () => {
      const res = await api('/api/market-prices/compare?commodity=');
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.error.code, 'INVALID_COMMODITY');
    });

    test('1.4. Historical trend analysis (/api/market-prices/trend) returns structured trend over period', async () => {
      const res = await api('/api/market-prices/trend?commodity=Tomato&state=Maharashtra&period=7D');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.commodity, 'Tomato');
      assert.strictEqual(res.data.period, '7D');
      assert.ok(['UP', 'DOWN', 'STABLE', 'INSUFFICIENT_DATA'].includes(res.data.direction));
      assert.ok(Array.isArray(res.data.observations));
    });

    test('1.5. Trend analysis strictly returns INSUFFICIENT_DATA when sparse observations prevent honest delta calculation', async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const emptyDbMock = {
        async query() {
          return { rows: [{ arrival_date: todayStr, modal_price: 2500, market: 'Isolated Mandi' }] };
        }
      };

      const customService = new MandiIntelligenceService();
      // Force empty fallback
      customService.getHistoricalRates = async () => ({ records: [] });

      const trend = await customService.getTrendAnalysis({
        commodity: 'Exotic Dragonfruit',
        state: 'Sikkim',
        period: '7D',
        dbClient: emptyDbMock
      });

      assert.strictEqual(trend.status, 'INSUFFICIENT_DATA');
      assert.strictEqual(trend.direction, 'INSUFFICIENT_DATA');
      assert.strictEqual(trend.dataPointsAvailable, 1);
      assert.ok(trend.message.includes('INSUFFICIENT_DATA'));
    });

    test('1.6. Trend analysis rejects invalid timeframe with 400', async () => {
      const res = await api('/api/market-prices/trend?commodity=Tomato&state=Maharashtra&period=10Y');
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.error.code, 'INVALID_PERIOD');
    });

    test('1.7. Mock data storage contamination shield prevents persistent writing of mock records', async () => {
      const mockRecords = [
        { commodity: 'Onion', state: 'Maharashtra', isMock: true, modalPrice: 3000, observedDate: '2026-09-15' }
      ];

      await assert.rejects(
        async () => {
          await mandiService.persistVerifiedRecords(mockRecords, db);
        },
        (err) => {
          assert.strictEqual(err.code, 'MOCK_DATA_CONTAMINATION_BLOCKED');
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 2. PRODUCT QUALITY TRUST & GRADING HIERARCHY
  // =========================================================================
  describe('2. Product Quality Trust & Grading Hierarchy', () => {
    test('2.1. Rejects CERTIFIED or CERTIFIED_AGMARK verification without official certification doc', () => {
      assert.throws(
        () => {
          qualityService.validateQualityDeclaration({
            sellerDeclaredGrade: 'Grade A',
            qualityEvidence: ['media/quality/batch_apples.jpg'],
            verificationType: 'CERTIFIED_AGMARK',
            certificationDocKey: null
          });
        },
        (err) => {
          assert.strictEqual(err.code, 'CERTIFICATION_DOCUMENT_REQUIRED');
          return true;
        }
      );
    });

    test('2.2. Distinguishes Seller-Declared, AI-Assisted, and Certified badges properly', () => {
      const declaredBadge = ProductQualityService.formatDisplayBadge({
        verificationType: 'SELLER_DECLARED',
        declaredGrade: 'Grade A',
        isCertified: false
      });
      assert.strictEqual(declaredBadge, 'Seller-Declared: Grade A');

      const aiBadge = ProductQualityService.formatDisplayBadge({
        verificationType: 'AI_ASSISTED_ESTIMATE',
        declaredGrade: 'Grade A',
        isCertified: false
      });
      assert.strictEqual(aiBadge, 'AI-Assisted Visual Estimate: Grade A');

      const certifiedBadge = ProductQualityService.formatDisplayBadge({
        verificationType: 'CERTIFIED_AGMARK',
        declaredGrade: 'Grade A',
        isCertified: true
      });
      assert.strictEqual(certifiedBadge, 'Officially Certified: Grade A');
    });

    test('2.3. AI quality assessment endpoint (/api/ai/quality-assessment) returns INSUFFICIENT_EVIDENCE if no photos are provided', async () => {
      const res = await api('/api/ai/quality-assessment', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({
          commodity: 'Tomato',
          declaredGrade: 'Grade A',
          evidenceKeys: []
        })
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.data.assessment, 'INSUFFICIENT_EVIDENCE');
      assert.strictEqual(res.data.data.confidence, 0.0);
      assert.strictEqual(res.data.data.provenance, 'AI_ASSISTED_ESTIMATE');
      assert.strictEqual(res.data.data.isOfficial, false);
      assert.ok(res.data.data.limitations.length > 0);
    });

    test('2.4. AI quality assessment endpoint (/api/ai/quality-assessment) evaluates evidence with visual limitations stated', async () => {
      const res = await api('/api/ai/quality-assessment', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({
          commodity: 'Onion',
          declaredGrade: 'Grade A',
          evidenceKeys: ['evidence/seller_101/batch_onion_top.jpg', 'evidence/seller_101/batch_onion_side.jpg']
        })
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.data.assessment, 'GRADE_SUPPORTED');
      assert.ok(res.data.data.confidence > 0.5);
      assert.strictEqual(res.data.data.provenance, 'AI_ASSISTED_ESTIMATE');
      assert.strictEqual(res.data.data.isOfficial, false);
      assert.ok(res.data.data.disclaimer.includes('non-binding'));
      assert.ok(res.data.data.limitations.length > 0);
    });

    test('2.5. AI quality assessment requires authentication', async () => {
      const res = await api('/api/ai/quality-assessment', {
        method: 'POST',
        body: JSON.stringify({ commodity: 'Tomato' })
      });
      assert.strictEqual(res.status, 401);
    });
  });

  // =========================================================================
  // 3. FARMER MARKET DECISION ADVISOR
  // =========================================================================
  describe('3. Farmer Market Decision Advisor', () => {
    test('3.1. Advisor endpoint (/api/ai/advisor) returns grounded decision support with clear data provenance', async () => {
      const res = await api('/api/ai/advisor', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({
          commodity: 'Onion',
          quantity: '50 quintals',
          location: 'Nashik',
          availableMarkets: ['Lasalgaon APMC', 'Pimpalgaon APMC'],
          currentPrices: { 'Lasalgaon APMC': 3100 }
        })
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.data.data.adviceText);
      assert.strictEqual(res.data.data.provenance.clientPricesAreVerified, false);
      assert.ok(res.data.data.disclaimer.includes('Final selling decisions rest with the farmer'));
    });

    test('3.2. Advisor rejects missing commodity with 400', async () => {
      const res = await api('/api/ai/advisor', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({ quantity: '100 kg' })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.error.code, 'INVALID_ADVISORY_INPUT');
    });

    test('3.3. Advisor requires authentication', async () => {
      const res = await api('/api/ai/advisor', {
        method: 'POST',
        body: JSON.stringify({ commodity: 'Onion' })
      });
      assert.strictEqual(res.status, 401);
    });
  });

  // =========================================================================
  // 4. DISPUTE AI SUMMARY GENERATION & NON-MUTATION
  // =========================================================================
  describe('4. Dispute AI Summary Generation & IDOR Enforcement', () => {
    let testDisputeId;

    before(async () => {
      // Create a test dispute using the disputeService repository
      const repo = new DisputeRepository();
      const service = new DisputeService(repo);
      const mockOrder = {
        id: 'ORD_PHASE4_99',
        order_number: 'KS-PH4-99',
        customer_id: 'BUY_TRUST_01',
        seller_id: 'SEL_TRUST_01',
        status: 'Completed',
        delivered_at: new Date(Date.now() - 4 * 3600000).toISOString()
      };

      const d = await service.createDispute({
        orderId: mockOrder.id,
        buyerId: 'BUY_TRUST_01',
        reason: 'QUALITY_MISMATCH',
        description: 'Potatoes contain significant dirt, green patches and rot spots.',
        claimedCondition: 'Damaged and sprouted',
        evidenceKeys: ['media/disputes/ORD_PHASE4_99/photo1.jpg']
      }, async () => mockOrder);

      testDisputeId = d.id;
    });

    test('4.1. Generates non-binding AI summary without mutating dispute status', async () => {
      const repo = new DisputeRepository();
      const service = new DisputeService(repo);

      const d = await service.createDispute({
        orderId: 'ORD_ISOLATED_01',
        buyerId: 'BUY_TRUST_01',
        reason: 'WRONG_GRADE',
        description: 'Delivered batch is Grade C instead of declared Grade A.',
        claimedCondition: 'Under-sized produce',
        evidenceKeys: ['evidence/buyer_proof.jpg']
      }, async () => ({
        id: 'ORD_ISOLATED_01',
        order_number: 'KS-ORD-01',
        customer_id: 'BUY_TRUST_01',
        seller_id: 'SEL_TRUST_01',
        status: 'Completed',
        delivered_at: new Date().toISOString()
      }));

      assert.strictEqual(d.status, 'OPEN');

      const summaryRes = await service.generateAiSummary(d.id, { id: 'BUY_TRUST_01', role: 'customer' });
      assert.strictEqual(summaryRes.disputeId, d.id);
      assert.strictEqual(summaryRes.status, 'OPEN'); // STATUS MUST REMAIN OPEN!
      assert.strictEqual(summaryRes.nonBinding, true);
      assert.strictEqual(summaryRes.label, 'AI-GENERATED SUMMARY (NON-BINDING)');
      assert.ok(summaryRes.aiSummary);
      assert.ok(summaryRes.disclaimer.includes('non-binding'));

      // Re-verify repository record is unchanged
      const reFetched = await service.getDispute(d.id, { id: 'BUY_TRUST_01', role: 'customer' });
      assert.strictEqual(reFetched.status, 'OPEN');
    });

    test('4.2. IDOR Protection: Unrelated user cannot generate or view dispute AI summary', async () => {
      const repo = new DisputeRepository();
      const service = new DisputeService(repo);

      const d = await service.createDispute({
        orderId: 'ORD_SECRET_01',
        buyerId: 'BUY_TRUST_01',
        reason: 'DAMAGED_PRODUCE',
        description: 'Damaged produce during transit.',
        claimedCondition: 'Crushed crates',
        evidenceKeys: []
      }, async () => ({
        id: 'ORD_SECRET_01',
        customer_id: 'BUY_TRUST_01',
        seller_id: 'SEL_TRUST_01',
        status: 'Completed',
        delivered_at: new Date().toISOString()
      }));

      await assert.rejects(
        async () => {
          await service.generateAiSummary(d.id, { id: 'INTRUDER_01', role: 'customer' });
        },
        (err) => {
          assert.strictEqual(err.code, 'FORBIDDEN_DISPUTE_ACCESS');
          return true;
        }
      );
    });

    test('4.3. Admin is authorized to generate dispute AI summary for any dispute', async () => {
      const repo = new DisputeRepository();
      const service = new DisputeService(repo);

      const d = await service.createDispute({
        orderId: 'ORD_ADMIN_INSPECT',
        buyerId: 'BUY_TRUST_01',
        reason: 'QUANTITY_SHORTAGE',
        description: 'Shortage of 20 kg in received bag.',
        claimedCondition: '80kg received instead of 100kg',
        evidenceKeys: []
      }, async () => ({
        id: 'ORD_ADMIN_INSPECT',
        customer_id: 'BUY_TRUST_01',
        seller_id: 'SEL_TRUST_01',
        status: 'Completed',
        delivered_at: new Date().toISOString()
      }));

      const summary = await service.generateAiSummary(d.id, { id: 'ADM_TRUST_01', role: 'admin' });
      assert.ok(summary.aiSummary);
      assert.strictEqual(summary.status, 'OPEN');
    });
  });

  // =========================================================================
  // 5. ADMIN TRUST & INTEGRITY METRICS DASHBOARD
  // =========================================================================
  describe('5. Admin Trust & Integrity Metrics Dashboard', () => {
    test('5.1. GET /api/admin/trust-metrics returns structured metrics computed from database', async () => {
      const res = await api('/api/admin/trust-metrics', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.data.trustMetrics);
      const m = res.data.trustMetrics;

      // 1. Disputes
      assert.ok(m.disputes);
      assert.ok(typeof m.disputes.openDisputes === 'number');
      assert.ok(typeof m.disputes.resolvedDisputes === 'number');
      assert.ok(typeof m.disputes.disputeResolutionRate === 'number');

      // 2. Product quality tiers
      assert.ok(m.productsByTier);
      assert.ok(typeof m.productsByTier.SELLER_DECLARED === 'number');
      assert.ok(typeof m.productsByTier.AI_ASSISTED_ESTIMATE === 'number');
      assert.ok(typeof m.productsByTier.CERTIFIED_AGMARK === 'number');
      assert.ok(typeof m.productsByTier.UNGRADED === 'number');

      // 3. Mandi snapshots
      assert.ok(m.mandiSnapshots);
      assert.ok(typeof m.mandiSnapshots.totalSnapshots === 'number');
      assert.ok(typeof m.mandiSnapshots.liveSnapshots === 'number');
      assert.ok(typeof m.mandiSnapshots.recentSnapshots === 'number');
      assert.ok(typeof m.mandiSnapshots.staleSnapshots === 'number');

      // 4. Seller verifications
      assert.ok(m.sellerVerifications);
      assert.ok(typeof m.sellerVerifications.pending === 'number');
      assert.ok(typeof m.sellerVerifications.approved === 'number');
      assert.ok(typeof m.sellerVerifications.rejected === 'number');
    });

    test('5.2. Non-admin users are blocked from accessing /api/admin/trust-metrics (403)', async () => {
      const resBuyer = await api('/api/admin/trust-metrics', {
        headers: { Authorization: `Bearer ${buyerToken}` }
      });
      assert.strictEqual(resBuyer.status, 403);

      const resSeller = await api('/api/admin/trust-metrics', {
        headers: { Authorization: `Bearer ${sellerToken}` }
      });
      assert.strictEqual(resSeller.status, 403);

      const resUnauth = await api('/api/admin/trust-metrics');
      assert.strictEqual(resUnauth.status, 401);
    });
  });
});
