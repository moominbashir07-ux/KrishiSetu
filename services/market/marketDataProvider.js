/**
 * KrishiSetu 2.0 — Market Data Provider Interface
 */

class MarketDataProvider {
  /**
   * Fetches latest commodity rates.
   * @param {Object} query
   * @param {string} query.commodity
   * @param {string} [query.state]
   * @param {string} [query.district]
   * @param {string} [query.market]
   * @param {number} [query.limit]
   * @returns {Promise<{ records: Array<Object>, source: Object, isMock: boolean }>}
   */
  async getLatestRates(query) {
    throw new Error('getLatestRates() must be implemented by concrete MarketDataProvider');
  }

  /**
   * Fetches historical time-series observations.
   * @param {Object} query
   * @param {string} query.commodity
   * @param {string} query.market
   * @param {number} query.days
   * @returns {Promise<{ records: Array<Object>, source: Object, isMock: boolean }>}
   */
  async getHistoricalRates(query) {
    throw new Error('getHistoricalRates() must be implemented by concrete MarketDataProvider');
  }
}

module.exports = MarketDataProvider;
