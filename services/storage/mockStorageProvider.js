/**
 * KrishiSetu — Mock / Local Storage Adapter
 * Maintains backward compatibility for test fixtures while using LocalStorageProvider.
 */

const LocalStorageProvider = require('./localStorageProvider');

class MockStorageProvider extends LocalStorageProvider {
  constructor(baseUrl = 'http://localhost:3000') {
    super(baseUrl);
  }

  async getPresignedUploadUrl(params) {
    const res = await super.getPresignedUploadUrl(params);
    res.provider = 'mock';
    return res;
  }
}

module.exports = MockStorageProvider;
