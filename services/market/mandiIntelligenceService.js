/**
 * KrishiSetu 2.0 — Mandi Intelligence Service
 * Orchestrates verified government market rates & isolates development mock data
 */

const DataGovMarketProvider = require('./dataGovMarketProvider');
const MockMarketAdapter = require('./mockMarketAdapter');

class MandiIntelligenceService {
  constructor(options = {}) {
    this.providerType = (options.providerType || process.env.MARKET_DATA_PROVIDER || 'mock').toLowerCase();
    this.dataGovProvider = new DataGovMarketProvider(options.apiKey);
    this.mockAdapter = new MockMarketAdapter();

    if (this.providerType === 'datagov' && this.dataGovProvider.isConfigured()) {
      this.activeProvider = this.dataGovProvider;
    } else {
      this.activeProvider = this.mockAdapter;
    }
  }

  /**
   * Returns current active provider metadata and configuration status.
   */
  getProviderStatus() {
    return {
      activeProvider: this.activeProvider === this.dataGovProvider ? 'datagov' : 'mock',
      dataGovConfigured: this.dataGovProvider.isConfigured(),
      resourceId: this.dataGovProvider.resourceId,
      mockIsolationActive: true
    };
  }

  /**
   * Pure calculation of data freshness based on observation timestamp.
   * LIVE: <= 24h
   * RECENT: > 24h and <= 48h
   * STALE: > 48h
   * UNAVAILABLE: null / missing / invalid date
   */
  calculateFreshness(observedDateStr, now = new Date(), allowUnavailable = false) {
    if (!observedDateStr) return allowUnavailable ? 'UNAVAILABLE' : 'STALE';
    const observed = new Date(observedDateStr);
    if (isNaN(observed.getTime())) return allowUnavailable ? 'UNAVAILABLE' : 'STALE';

    const diffHours = (now.getTime() - observed.getTime()) / (1000 * 60 * 60);
    if (diffHours <= 24) return 'LIVE';
    if (diffHours <= 48) return 'RECENT';
    return 'STALE';
  }

  /**
   * Fetches latest verified or mock rates depending on active configuration.
   */
  async getLatestRates(query) {
    if (this.providerType === 'datagov') {
      if (!this.dataGovProvider.isConfigured()) {
        const err = new Error('data.gov.in API key is missing. Set DATA_GOV_API_KEY or switch to MARKET_DATA_PROVIDER=mock.');
        err.code = 'DATA_GOV_KEY_MISSING';
        err.statusCode = 503;
        throw err;
      }
      return this.dataGovProvider.getLatestRates(query);
    }

    return this.mockAdapter.getLatestRates(query);
  }

  /**
   * Fetches historical time-series rates.
   */
  async getHistoricalRates(query) {
    if (this.providerType === 'datagov') {
      if (!this.dataGovProvider.isConfigured()) {
        const err = new Error('data.gov.in API key is missing.');
        err.code = 'DATA_GOV_KEY_MISSING';
        err.statusCode = 503;
        throw err;
      }
      return this.dataGovProvider.getHistoricalRates(query);
    }

    return this.mockAdapter.getHistoricalRates(query);
  }

  /**
   * Fetches the single latest observation for a commodity in a given market/state.
   */
  async getLatestPrice({ commodity = 'Onion', state = 'Maharashtra', market = null, dbClient = null }) {
    const cleanCommodity = String(commodity || 'Onion').trim();
    const cleanState = String(state || 'Maharashtra').trim();
    const db = dbClient || require('../../db/db');

    try {
      let sql = `SELECT * FROM market_price_snapshots 
                 WHERE LOWER(commodity) = LOWER($1) AND LOWER(state) = LOWER($2)`;
      const params = [cleanCommodity, cleanState];
      if (market && String(market).trim()) {
        params.push(String(market).trim());
        sql += ` AND LOWER(market) = LOWER($${params.length})`;
      }
      sql += ' ORDER BY arrival_date DESC LIMIT 1';

      const res = await db.query(sql, params);
      if (res && res.rows && res.rows.length > 0) {
        const r = res.rows[0];
        return {
          commodity: r.commodity,
          market: r.market,
          state: r.state,
          district: r.district || '',
          variety: r.variety || 'Standard',
          grade: r.grade || 'Standard',
          modalPrice: Number(r.modal_price),
          minPrice: Number(r.min_price || r.modal_price * 0.9),
          maxPrice: Number(r.max_price || r.modal_price * 1.1),
          unit: r.unit || 'quintal',
          observedAt: r.arrival_date ? new Date(r.arrival_date).toISOString().split('T')[0] : null,
          fetchedAt: r.fetched_at || new Date().toISOString(),
          freshness: this.calculateFreshness(r.arrival_date),
          source: r.source || 'AGMARKNET / Server Snapshot',
          isOfficial: true
        };
      }
    } catch (e) {
      // Fallback
    }

    const liveRes = await this.getLatestRates({ commodity: cleanCommodity, state: cleanState, market });
    if (liveRes && Array.isArray(liveRes.records) && liveRes.records.length > 0) {
      const r = liveRes.records[0];
      return {
        commodity: r.commodity,
        market: r.mandi || r.market,
        state: r.state,
        district: r.district || '',
        variety: r.variety || 'Standard',
        grade: r.grade || 'Standard',
        modalPrice: Number(r.modalPrice),
        minPrice: Number(r.minPrice),
        maxPrice: Number(r.maxPrice),
        unit: r.unit || 'quintal',
        observedAt: r.observedDate,
        fetchedAt: r.fetchedAt,
        freshness: r.freshnessStatus || this.calculateFreshness(r.observedDate),
        source: r.source,
        isOfficial: !r.isMock
      };
    }

    return null;
  }

  /**
   * Compares pricing across different mandis for a given commodity and state.
   * Returns market records along with derived comparison metrics.
   */
  async compareMandis({ commodity = 'Onion', state = 'Maharashtra', district = null, dbClient = null }) {
    if (!commodity || typeof commodity !== 'string' || !commodity.trim()) {
      const err = new Error('Commodity name is required for mandi comparison.');
      err.code = 'INVALID_COMMODITY';
      err.statusCode = 400;
      throw err;
    }

    const cleanCommodity = commodity.trim();
    const cleanState = String(state || 'Maharashtra').trim();
    let markets = [];

    const db = dbClient || require('../../db/db');
    try {
      let sql = 'SELECT * FROM market_price_snapshots WHERE LOWER(commodity) = LOWER($1) AND LOWER(state) = LOWER($2)';
      const params = [cleanCommodity, cleanState];
      if (district && String(district).trim()) {
        params.push(String(district).trim());
        sql += ` AND LOWER(district) = LOWER($${params.length})`;
      }
      sql += ' ORDER BY arrival_date DESC, modal_price DESC LIMIT 50';

      const dbRes = await db.query(sql, params);
      if (dbRes && dbRes.rows && dbRes.rows.length > 0) {
        const marketMap = new Map();
        for (const row of dbRes.rows) {
          const mKey = String(row.market).toLowerCase();
          if (!marketMap.has(mKey)) {
            marketMap.set(mKey, {
              market: row.market,
              district: row.district || '',
              state: row.state,
              commodity: row.commodity,
              variety: row.variety || 'Standard',
              grade: row.grade || 'Standard',
              modalPrice: Number(row.modal_price),
              minPrice: row.min_price ? Number(row.min_price) : Number(row.modal_price) * 0.9,
              maxPrice: row.max_price ? Number(row.max_price) : Number(row.modal_price) * 1.1,
              unit: row.unit || 'quintal',
              observedAt: row.arrival_date ? new Date(row.arrival_date).toISOString().split('T')[0] : null,
              fetchedAt: row.fetched_at || new Date().toISOString(),
              freshness: this.calculateFreshness(row.arrival_date),
              source: row.source || 'AGMARKNET / Server Snapshot',
              isOfficial: true
            });
          }
        }
        markets = Array.from(marketMap.values());
      }
    } catch (e) {
      // Safe fallback
    }

    if (markets.length === 0) {
      const res = await this.getLatestRates({ commodity: cleanCommodity, state: cleanState, district });
      if (res && Array.isArray(res.records) && res.records.length > 0) {
        const marketMap = new Map();
        for (const r of res.records) {
          const mKey = String(r.mandi || r.market).toLowerCase();
          if (!marketMap.has(mKey)) {
            marketMap.set(mKey, {
              market: r.mandi || r.market,
              district: r.district || '',
              state: r.state,
              commodity: r.commodity,
              variety: r.variety || 'Standard',
              grade: r.grade || 'Standard',
              modalPrice: Number(r.modalPrice),
              minPrice: Number(r.minPrice),
              maxPrice: Number(r.maxPrice),
              unit: r.unit || 'quintal',
              observedAt: r.observedDate,
              fetchedAt: r.fetchedAt || new Date().toISOString(),
              freshness: r.freshnessStatus || this.calculateFreshness(r.observedDate),
              source: r.source,
              isOfficial: !r.isMock
            });
          }
        }
        markets = Array.from(marketMap.values());
      }
    }

    if (markets.length === 0) {
      return {
        commodity: cleanCommodity,
        state: cleanState,
        district: district || null,
        markets: [],
        summary: null,
        status: 'UNAVAILABLE',
        message: `No mandi price data available for comparison for ${cleanCommodity} in ${cleanState}.`
      };
    }

    const prices = markets.map(m => m.modalPrice).filter(p => Number.isFinite(p) && p > 0);
    const highestMandi = markets.reduce((prev, curr) => (curr.modalPrice > prev.modalPrice ? curr : prev), markets[0]);
    const lowestMandi = markets.reduce((prev, curr) => (curr.modalPrice < prev.modalPrice ? curr : prev), markets[0]);
    const averagePrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
    const priceSpread = highestMandi.modalPrice - lowestMandi.modalPrice;

    return {
      commodity: cleanCommodity,
      state: cleanState,
      district: district || null,
      markets,
      summary: {
        highestMandi: { market: highestMandi.market, price: highestMandi.modalPrice, freshness: highestMandi.freshness },
        lowestMandi: { market: lowestMandi.market, price: lowestMandi.modalPrice, freshness: lowestMandi.freshness },
        averagePrice,
        priceSpread,
        totalMarketsTracked: markets.length,
        label: 'KrishiSetu Derived Comparison (Derived)',
        isDerived: true,
        isOfficial: false
      },
      status: 'AVAILABLE'
    };
  }

  /**
   * Generates historical trend analysis over periods (1D, 7D, 1M, 1Y).
   * Strictly returns INSUFFICIENT_DATA when sparse observations prevent honest trend calculation.
   */
  async getTrendAnalysis({ commodity = 'Tomato', state = 'Maharashtra', market = null, period = '7D', dbClient = null }) {
    if (!commodity || typeof commodity !== 'string' || !commodity.trim()) {
      const err = new Error('Commodity name is required for trend analysis.');
      err.code = 'INVALID_COMMODITY';
      err.statusCode = 400;
      throw err;
    }

    const cleanCommodity = commodity.trim();
    const cleanState = String(state || 'Maharashtra').trim();
    const cleanPeriod = String(period || '7D').toUpperCase();
    const allowedPeriods = new Set(['1D', '7D', '1M', '1Y']);
    if (!allowedPeriods.has(cleanPeriod)) {
      const err = new Error(`Invalid trend period "${period}". Allowed periods: 1D, 7D, 1M, 1Y.`);
      err.code = 'INVALID_PERIOD';
      err.statusCode = 400;
      throw err;
    }

    let daysBack = 7;
    if (cleanPeriod === '1D') daysBack = 1;
    else if (cleanPeriod === '7D') daysBack = 7;
    else if (cleanPeriod === '1M') daysBack = 30;
    else if (cleanPeriod === '1Y') daysBack = 365;

    const db = dbClient || require('../../db/db');
    let observations = [];

    try {
      let sql = `SELECT market, commodity, state, arrival_date, modal_price, min_price, max_price, source, fetched_at
                 FROM market_price_snapshots 
                 WHERE LOWER(commodity) = LOWER($1) AND LOWER(state) = LOWER($2)`;
      const params = [cleanCommodity, cleanState];

      if (market && String(market).trim()) {
        params.push(String(market).trim());
        sql += ` AND LOWER(market) = LOWER($${params.length})`;
      }

      sql += ' ORDER BY arrival_date ASC';

      const res = await db.query(sql, params);
      if (res && res.rows) {
        observations = res.rows.map(r => ({
          date: r.arrival_date ? new Date(r.arrival_date).toISOString().split('T')[0] : null,
          price: Number(r.modal_price),
          market: r.market,
          source: r.source || 'AGMARKNET'
        })).filter(o => o.date && Number.isFinite(o.price));
      }
    } catch (e) {
      // Safe fallback
    }

    if (observations.length < 2) {
      try {
        const histRes = await this.getHistoricalRates({
          commodity: cleanCommodity,
          state: cleanState,
          market: market || 'Lasalgaon APMC',
          days: Math.max(daysBack, 3)
        });
        if (histRes && Array.isArray(histRes.records) && histRes.records.length > 0) {
          observations = histRes.records.map(r => ({
            date: r.observedDate,
            price: Number(r.modalPrice),
            market: r.mandi || r.market,
            source: r.source
          })).filter(o => o.date && Number.isFinite(o.price));
          observations.sort((a, b) => new Date(a.date) - new Date(b.date));
        }
      } catch (e) {
        // Safe fallback
      }
    }

    // Filter observations within requested daysBack window if observations exceed window
    if (observations.length > 2 && daysBack > 1) {
      const cutoff = new Date(Date.now() - (daysBack * 86400000)).toISOString().split('T')[0];
      const windowed = observations.filter(o => o.date >= cutoff);
      if (windowed.length >= 2) {
        observations = windowed;
      }
    }

    // Guard against insufficient data: MUST have at least 2 distinct observations to compute a delta
    if (observations.length < 2) {
      return {
        commodity: cleanCommodity,
        state: cleanState,
        market: market || 'All Mandis',
        period: cleanPeriod,
        status: 'INSUFFICIENT_DATA',
        direction: 'INSUFFICIENT_DATA',
        currentPrice: observations.length === 1 ? observations[0].price : null,
        previousPrice: null,
        absoluteDelta: 0,
        percentageDelta: 0,
        dataPointsAvailable: observations.length,
        observations,
        message: 'INSUFFICIENT_DATA: Real market observations are sparse for the selected window. Delta cannot be determined without inventing data.',
        isOfficial: false,
        isDerived: true
      };
    }

    const firstPoint = observations[0];
    const latestPoint = observations[observations.length - 1];

    const currentPrice = latestPoint.price;
    const previousPrice = firstPoint.price;
    const absoluteDelta = Math.round((currentPrice - previousPrice) * 100) / 100;
    const percentageDelta = previousPrice > 0 ? Math.round(((currentPrice - previousPrice) / previousPrice) * 10000) / 100 : 0;

    let direction = 'STABLE';
    if (percentageDelta > 0.5) direction = 'UP';
    else if (percentageDelta < -0.5) direction = 'DOWN';

    return {
      commodity: cleanCommodity,
      state: cleanState,
      market: market || 'All Mandis',
      period: cleanPeriod,
      status: 'AVAILABLE',
      direction,
      currentPrice,
      previousPrice,
      absoluteDelta,
      percentageDelta,
      dataPointsAvailable: observations.length,
      observations,
      startDate: firstPoint.date,
      endDate: latestPoint.date,
      provenance: {
        isOfficial: false,
        isDerived: true,
        label: 'KrishiSetu Derived Trend (Derived from official market arrivals)',
        sourceDataPoints: observations.length
      }
    };
  }

  /**
   * HARDENED STORAGE CONTAMINATION SHIELD
   * Strictly prevents mock records from polluting persistent production snapshot tables.
   */
  async persistVerifiedRecords(records, dbClient) {
    if (!Array.isArray(records) || records.length === 0) return 0;

    // 1. Guard against any mock contamination
    for (const r of records) {
      if (r.isMock === true || (r.source && String(r.source).includes('MOCK'))) {
        const contaminationErr = new Error('CONTAMINATION PREVENTED: Mock market data cannot be written to production storage.');
        contaminationErr.code = 'MOCK_DATA_CONTAMINATION_BLOCKED';
        contaminationErr.statusCode = 400;
        throw contaminationErr;
      }
    }

    if (!dbClient || typeof dbClient.query !== 'function') {
      return 0;
    }

    let inserted = 0;
    for (const r of records) {
      const snapId = `SNAP_${r.state}_${r.market}_${r.commodity}_${r.observedDate}`;
      try {
        await dbClient.query(
          `INSERT INTO market_price_snapshots (id, state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price, unit)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO NOTHING`,
          [snapId, r.state, r.district || null, r.market, r.commodity, r.variety, r.grade, r.observedDate, r.minPrice, r.maxPrice, r.modalPrice, r.unit || 'quintal']
        );
        inserted++;
      } catch (e) {
        // Safe insert error handle
      }
    }

    return inserted;
  }
}

module.exports = {
  MandiIntelligenceService,
  DataGovMarketProvider,
  MockMarketAdapter
};
