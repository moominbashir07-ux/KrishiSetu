/**
 * KrishiSetu 2.0 — Government Mandi Data Provider (data.gov.in / AGMARKNET)
 */

const MarketDataProvider = require('./marketDataProvider');

const RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070';
const API_BASE = `https://api.data.gov.in/resource/${RESOURCE_ID}`;

class DataGovMarketProvider extends MarketDataProvider {
  constructor(apiKey = null) {
    super();
    this.apiKey = apiKey || process.env.DATA_GOV_API_KEY || process.env.DATA_GOV_IN_API_KEY || '';
    this.resourceId = RESOURCE_ID;
    this.sourceMetadata = {
      id: 'SRC_DATAGOVIN_AGMARKNET',
      name: 'data.gov.in / AGMARKNET',
      resourceId: RESOURCE_ID,
      publisher: 'Ministry of Agriculture and Farmers Welfare, Govt of India',
      termsOfUse: 'National Data Sharing and Accessibility Policy (NDSAP)'
    };
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim() !== '' && this.apiKey !== 'test_mock_api_key' && this.apiKey !== 'your_data_gov_in_api_key_here');
  }

  parsePrice(val) {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return (Number.isFinite(val) && val > 0) ? val : null;
    if (typeof val === 'string') {
      const clean = val.trim().replace(/[^0-9.]/g, '');
      if (!clean || clean === '0') return null;
      const num = parseFloat(clean);
      return (Number.isFinite(num) && num > 0) ? num : null;
    }
    return null;
  }

  parseDate(val) {
    if (!val) return new Date().toISOString().split('T')[0];
    const str = String(val).trim();
    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts;
        return `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    return str;
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

  async getLatestRates({ commodity = 'Onion', state = 'Maharashtra', district = null, market = null, limit = 50 }) {
    if (!this.isConfigured()) {
      const err = new Error('data.gov.in API key is missing or not configured. Set DATA_GOV_API_KEY in environment or enable mock adapter.');
      err.code = 'DATA_GOV_KEY_MISSING';
      err.statusCode = 503;
      throw err;
    }

    const queryObj = {
      'api-key': this.apiKey,
      format: 'json',
      limit: String(Math.min(limit, 500)),
      offset: '0',
      'filters[state]': state,
      'filters[commodity]': commodity,
      'sort[arrival_date]': 'desc'
    };

    if (district) queryObj['filters[district]'] = district;
    if (market) queryObj['filters[market]'] = market;

    const params = new URLSearchParams(queryObj);
    const targetUrl = `${API_BASE}?${params.toString()}`;

    const now = new Date();
    const response = await fetch(targetUrl);
    if (!response.ok) {
      const err = new Error(`data.gov.in upstream request failed with HTTP ${response.status}`);
      err.code = 'DATA_GOV_UPSTREAM_ERROR';
      err.statusCode = 502;
      throw err;
    }

    const json = await response.json();
    const rawRecords = Array.isArray(json.records) ? json.records : [];

    const normalizedRecords = rawRecords.map(r => {
      const minPrice = this.parsePrice(r.min_price);
      const modalPrice = this.parsePrice(r.modal_price);
      const maxPrice = this.parsePrice(r.max_price);
      const observedDate = this.parseDate(r.arrival_date);
      const freshness = this.calculateFreshness(observedDate, now);

      return {
        commodity: r.commodity || commodity,
        variety: r.variety || 'Standard',
        grade: r.grade || 'FAQ',
        mandi: r.market || 'APMC Market',
        market: r.market || 'APMC Market',
        district: r.district || district || '',
        state: r.state || state,
        minPrice,
        maxPrice,
        modalPrice,
        unit: r.unit || 'quintal',
        observedDate,
        source: this.sourceMetadata.name,
        sourceResourceId: this.resourceId,
        fetchedAt: now.toISOString(),
        freshnessStatus: freshness,
        dataFreshness: freshness,
        isMock: false
      };
    }).filter(r => r.market && r.modalPrice !== null);

    return {
      records: normalizedRecords,
      total: normalizedRecords.length,
      source: this.sourceMetadata,
      fetchedAt: now.toISOString(),
      isMock: false
    };
  }

  async getHistoricalRates({ commodity, market, state, district, days = 7 }) {
    // data.gov.in provides daily snapshot records; getLatestRates with limit captures recent arrival history
    return this.getLatestRates({ commodity, market, state, district, limit: days * 5 });
  }
}

module.exports = DataGovMarketProvider;
