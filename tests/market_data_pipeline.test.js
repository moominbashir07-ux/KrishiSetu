/**
 * KrishiSetu 2.0 — Market Data Pipeline & Anti-Contamination Test Suite
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { MandiIntelligenceService, DataGovMarketProvider, MockMarketAdapter } = require('../services/market/mandiIntelligenceService');

describe('Market Data Pipeline — Contract, Freshness & Contamination Tests', () => {
  const service = new MandiIntelligenceService({ providerType: 'mock' });
  const mockAdapter = new MockMarketAdapter();

  test('1. Every market record satisfies the complete data contract', async () => {
    const res = await service.getLatestRates({ commodity: 'Tomato', state: 'Maharashtra', district: 'Nashik' });
    assert.ok(Array.isArray(res.records));
    assert.ok(res.records.length > 0);

    const record = res.records[0];
    const requiredFields = [
      'commodity',
      'variety',
      'mandi',
      'state',
      'district',
      'minPrice',
      'maxPrice',
      'modalPrice',
      'unit',
      'observedDate',
      'source',
      'sourceResourceId',
      'fetchedAt',
      'freshnessStatus',
      'isMock'
    ];

    for (const field of requiredFields) {
      assert.ok(record[field] !== undefined, `Record must contain field: ${field}`);
    }

    assert.strictEqual(record.commodity, 'Tomato');
    assert.strictEqual(record.state, 'Maharashtra');
    assert.strictEqual(record.unit, 'quintal');
    assert.strictEqual(record.isMock, true);
    assert.strictEqual(record.source, 'MOCK DATA — DEVELOPMENT ONLY');
  });

  test('2. Freshness calculation: LIVE within 24 hours, RECENT 24-48h, STALE >48h', () => {
    const now = new Date('2026-09-16T12:00:00Z');

    // Observed today (4 hours ago) -> LIVE
    const liveDate = new Date(now.getTime() - 4 * 3600000).toISOString().split('T')[0];
    assert.strictEqual(service.calculateFreshness(liveDate, now), 'LIVE');

    // Observed yesterday (36 hours ago) -> RECENT
    const recentDate = new Date(now.getTime() - 36 * 3600000).toISOString().split('T')[0];
    assert.strictEqual(service.calculateFreshness(recentDate, now), 'RECENT');

    // Observed 4 days ago (96 hours ago) -> STALE
    const staleDate = new Date(now.getTime() - 96 * 3600000).toISOString().split('T')[0];
    assert.strictEqual(service.calculateFreshness(staleDate, now), 'STALE');

    // Invalid date -> STALE
    assert.strictEqual(service.calculateFreshness(null, now), 'STALE');
    assert.strictEqual(service.calculateFreshness('invalid-date', now), 'STALE');
  });

  test('3. CONTAMINATION FIX: Mock market records cannot contaminate production market storage', async () => {
    const mockRes = await mockAdapter.getLatestRates({ commodity: 'Onion' });
    assert.strictEqual(mockRes.records[0].isMock, true);

    const fakeDb = {
      queryCount: 0,
      async query() {
        this.queryCount++;
        return { rows: [] };
      }
    };

    // Attempting to persist mock records must throw a CONTAMINATION PREVENTED error
    await assert.rejects(
      async () => {
        await service.persistVerifiedRecords(mockRes.records, fakeDb);
      },
      (err) => {
        assert.strictEqual(err.code, 'MOCK_DATA_CONTAMINATION_BLOCKED');
        assert.ok(err.message.includes('Mock market data cannot be written to production storage'));
        return true;
      }
    );

    // Assert that the database query was never touched
    assert.strictEqual(fakeDb.queryCount, 0, 'Database query must NOT be invoked for mock data');
  });

  test('4. CONTAMINATION FIX: Verified records with isMock=false are safely accepted for persistence', async () => {
    const verifiedRecord = {
      commodity: 'Onion',
      variety: 'Red',
      grade: 'FAQ',
      market: 'Lasalgaon APMC',
      state: 'Maharashtra',
      district: 'Nashik',
      minPrice: 2200,
      maxPrice: 3200,
      modalPrice: 2800,
      unit: 'quintal',
      observedDate: '2026-09-16',
      source: 'data.gov.in / AGMARKNET',
      sourceResourceId: '9ef84268-d588-465a-a308-a864a43d0070',
      fetchedAt: new Date().toISOString(),
      freshnessStatus: 'LIVE',
      isMock: false
    };

    let executedQuery = null;
    let executedParams = null;
    const fakeDb = {
      async query(sql, params) {
        executedQuery = sql;
        executedParams = params;
        return { rows: [] };
      }
    };

    const insertedCount = await service.persistVerifiedRecords([verifiedRecord], fakeDb);
    assert.strictEqual(insertedCount, 1);
    assert.ok(executedQuery.includes('INSERT INTO market_price_snapshots'));
    assert.strictEqual(executedParams[4], 'Onion'); // commodity
  });

  test('5. DataGovMarketProvider handles missing API key with structured configuration error without silently faking data', async () => {
    const unconfiguredProvider = new DataGovMarketProvider('');
    assert.strictEqual(unconfiguredProvider.isConfigured(), false);

    await assert.rejects(
      async () => {
        await unconfiguredProvider.getLatestRates({ commodity: 'Wheat' });
      },
      (err) => {
        assert.strictEqual(err.code, 'DATA_GOV_KEY_MISSING');
        assert.strictEqual(err.statusCode, 503);
        assert.ok(err.message.includes('API key is missing'));
        return true;
      }
    );
  });

  test('6. Mock adapter returns historical time series with explicit isMock flag', async () => {
    const hist = await mockAdapter.getHistoricalRates({ commodity: 'Potato', market: 'Pune APMC', days: 7 });
    assert.strictEqual(hist.records.length, 7);
    assert.strictEqual(hist.isMock, true);
    assert.strictEqual(hist.records[0].unit, 'quintal');
    assert.ok(hist.records.every(r => r.isMock === true));
  });
});
