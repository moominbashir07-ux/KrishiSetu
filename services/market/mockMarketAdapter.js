/**
 * KrishiSetu 2.0 — Mock Market Adapter
 * Isolated in-memory development adapter — STRICTLY PREVENTED FROM ENTERING PRODUCTION STORAGE
 */

const MarketDataProvider = require('./marketDataProvider');

const MOCK_COMMODITY_BASE_PRICES = {
  'Onion': 2850,
  'Tomato': 2400,
  'Potato': 1950,
  'Wheat': 2800,
  'Rice': 3400,
  'Soybean': 4900,
  'Cotton': 6800,
  'Apple': 8200,
  'Chilli': 7200
};

class MockMarketAdapter extends MarketDataProvider {
  constructor() {
    super();
    this.name = 'MockMarketAdapter';
    this.sourceMetadata = {
      id: 'SRC_MOCK_DEV',
      name: 'MOCK DATA — DEVELOPMENT ONLY',
      resourceId: 'DEV_MOCK_ADAPTER',
      publisher: 'KrishiSetu Development Adapter',
      termsOfUse: 'Non-production testing only'
    };
  }

  calculateFreshness(observedDateStr, now = new Date()) {
    if (!observedDateStr) return 'STALE';
    const observed = new Date(observedDateStr);
    if (isNaN(observed.getTime())) return 'STALE';

    const diffHours = (now.getTime() - observed.getTime()) / (1000 * 60 * 60);
    if (diffHours <= 24) return 'LIVE';
    if (diffHours <= 48) return 'RECENT';
    return 'STALE';
  }

  async getLatestRates({ commodity = 'Onion', state = 'Maharashtra', district = 'Nashik', market = null, daysOld = 0 }) {
    const base = MOCK_COMMODITY_BASE_PRICES[commodity] || 2500;
    const now = new Date();
    const observed = new Date(now.getTime() - (daysOld * 86400000));
    const observedDate = observed.toISOString().split('T')[0];

    const marketList = market ? [market] : ['Lasalgaon APMC', 'Pimpalgaon APMC', 'Pune APMC'];
    const records = marketList.map((mName, idx) => {
      const modalPrice = Math.round(base + (idx * 95));
      return {
        commodity,
        variety: 'Local Red',
        grade: 'FAQ',
        mandi: mName,
        market: mName,
        district: district || 'Nashik',
        state: state || 'Maharashtra',
        minPrice: Math.round(modalPrice * 0.88),
        maxPrice: Math.round(modalPrice * 1.12),
        modalPrice,
        unit: 'quintal',
        observedDate,
        source: this.sourceMetadata.name,
        sourceResourceId: this.sourceMetadata.resourceId,
        fetchedAt: now.toISOString(),
        freshnessStatus: this.calculateFreshness(observedDate, now),
        dataFreshness: this.calculateFreshness(observedDate, now),
        isMock: true
      };
    });

    return {
      records,
      total: records.length,
      source: this.sourceMetadata,
      fetchedAt: now.toISOString(),
      isMock: true,
      warning: 'DEVELOPMENT MOCK DATA — DO NOT USE IN PRODUCTION'
    };
  }

  async getHistoricalRates({ commodity = 'Onion', market = 'Lasalgaon APMC', state = 'Maharashtra', district = 'Nashik', days = 7 }) {
    const base = MOCK_COMMODITY_BASE_PRICES[commodity] || 2500;
    const now = new Date();
    const records = [];

    for (let d = days - 1; d >= 0; d--) {
      const dayDate = new Date(now.getTime() - (d * 86400000));
      const observedDate = dayDate.toISOString().split('T')[0];
      const variance = Math.sin(d) * 120;
      const modalPrice = Math.round(base + variance);

      records.push({
        commodity,
        variety: 'Local Red',
        grade: 'FAQ',
        mandi: market,
        market,
        district,
        state,
        minPrice: Math.round(modalPrice * 0.9),
        maxPrice: Math.round(modalPrice * 1.1),
        modalPrice,
        unit: 'quintal',
        observedDate,
        source: this.sourceMetadata.name,
        sourceResourceId: this.sourceMetadata.resourceId,
        fetchedAt: now.toISOString(),
        freshnessStatus: this.calculateFreshness(observedDate, now),
        dataFreshness: this.calculateFreshness(observedDate, now),
        isMock: true
      });
    }

    return {
      records,
      total: records.length,
      source: this.sourceMetadata,
      fetchedAt: now.toISOString(),
      isMock: true,
      timePeriodDays: days
    };
  }
}

module.exports = MockMarketAdapter;
