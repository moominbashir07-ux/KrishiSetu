/**
 * KrishiSetu 2.0 — Mock Storage Provider
 * Safe local development & automated test adapter
 */

const StorageProvider = require('./storageProvider');

class MockStorageProvider extends StorageProvider {
  constructor(baseUrl = 'http://localhost:3000') {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.uploadedObjects = new Set();
  }

  async getPresignedUploadUrl({ key, contentType, expiresIn = 900 }) {
    const uploadUrl = `${this.baseUrl}/api/storage/mock-upload?key=${encodeURIComponent(key)}&expires=${Date.now() + (expiresIn * 1000)}`;
    return {
      uploadUrl,
      key,
      method: 'PUT',
      headers: {
        'Content-Type': contentType
      },
      expiresIn,
      provider: 'mock'
    };
  }

  async objectExists(key) {
    return this.uploadedObjects.has(key);
  }

  getReadUrl(key) {
    return `${this.baseUrl}/media/${key}`;
  }

  // Helper for test assertions
  markObjectUploaded(key) {
    this.uploadedObjects.add(key);
  }
}

module.exports = MockStorageProvider;
