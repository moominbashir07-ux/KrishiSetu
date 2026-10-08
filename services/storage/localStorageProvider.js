/**
 * KrishiSetu — Production-Safe Local Storage Provider
 * Zero AWS / Zero Cloud Storage Dependency
 * Handles local media references, pre-signed upload tokens, and public retrieval URLs.
 */

const crypto = require('crypto');
const StorageProvider = require('./storageProvider');

class LocalStorageProvider extends StorageProvider {
  constructor(baseUrl = 'http://localhost:3000') {
    super();
    this.baseUrl = (baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
    this.uploadedObjects = new Set();
  }

  static getSecret() {
    return process.env.JWT_SECRET || 'krishisetu-default-jwt-secret-key-32chars';
  }

  static generateSignature(key, expires, secret = LocalStorageProvider.getSecret()) {
    return crypto.createHmac('sha256', secret).update(`${key}:${expires}`).digest('hex');
  }

  static verifySignature(key, expires, signature, secret = LocalStorageProvider.getSecret()) {
    if (!key || !expires || !signature || typeof signature !== 'string') return false;
    try {
      const expected = LocalStorageProvider.generateSignature(key, expires, secret);
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length !== expBuf.length || sigBuf.length === 0) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  generateSignature(key, expires) {
    return LocalStorageProvider.generateSignature(key, expires);
  }

  verifySignature(key, expires, signature) {
    return LocalStorageProvider.verifySignature(key, expires, signature);
  }

  /**
   * Generates a local pre-signed upload URL for produce photos, verification docs, and dispute proofs.
   * @param {Object} params
   * @param {string} params.key Storage key
   * @param {string} params.contentType MIME type
   * @param {number} [params.expiresIn=900] Expiration in seconds
   * @returns {Promise<Object>}
   */
  async getPresignedUploadUrl({ key, contentType, expiresIn = 900 }) {
    const expires = Date.now() + (expiresIn * 1000);
    const signature = LocalStorageProvider.generateSignature(key, expires);
    const uploadUrl = `${this.baseUrl}/api/storage/local-upload?key=${encodeURIComponent(key)}&expires=${expires}&signature=${signature}`;
    return {
      uploadUrl,
      key,
      method: 'PUT',
      headers: {
        'Content-Type': contentType
      },
      expiresIn,
      provider: 'local',
      signature
    };
  }

  /**
   * Checks if an object has been registered or uploaded.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async objectExists(key) {
    return this.uploadedObjects.has(key);
  }

  /**
   * Generates public read URL for uploaded media.
   * @param {string} key
   * @returns {string}
   */
  getReadUrl(key) {
    return `${this.baseUrl}/media/${key}`;
  }

  /**
   * Marks object as uploaded (used by upload handler and test assertions).
   * @param {string} key
   */
  markObjectUploaded(key) {
    this.uploadedObjects.add(key);
  }
}

module.exports = LocalStorageProvider;
