/**
 * KrishiSetu 2.0 — Storage Provider Interface
 */

class StorageProvider {
  /**
   * Generates a presigned upload URL or mock upload URL.
   * @param {Object} params
   * @param {string} params.key - Sanitized object key
   * @param {string} params.contentType - Validated MIME type
   * @param {number} params.expiresIn - TTL in seconds
   * @returns {Promise<{ uploadUrl: string, key: string, method: string, expiresIn: number }>}
   */
  async getPresignedUploadUrl(params) {
    throw new Error('getPresignedUploadUrl() must be implemented by concrete StorageProvider');
  }

  /**
   * Checks if an object exists in storage.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async objectExists(key) {
    throw new Error('objectExists() must be implemented by concrete StorageProvider');
  }

  /**
   * Generates a public or signed read URL.
   * @param {string} key
   * @returns {string}
   */
  getReadUrl(key) {
    throw new Error('getReadUrl() must be implemented by concrete StorageProvider');
  }
}

module.exports = StorageProvider;
