/**
 * KrishiSetu 2.0 — Storage Service
 * Enterprise media & evidence ingestion orchestrator
 */

const crypto = require('crypto');
const MockStorageProvider = require('./mockStorageProvider');
const S3StorageProvider = require('./s3StorageProvider');
const LambdaStorageProvider = require('./lambdaStorageProvider');

const ALLOWED_MIME_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf'
};

const ALLOWED_ENTITY_TYPES = new Set([
  'product',
  'dispute',
  'quality',
  'verification',
  'profile'
]);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

class StorageService {
  constructor(provider = null) {
    if (provider) {
      this.provider = provider;
      return;
    }

    const providerType = (process.env.STORAGE_PROVIDER || '').toLowerCase();

    // AWS Lambda → S3
    if (providerType === 'lambda' && process.env.AWS_LAMBDA_STORAGE_URL) {
      try {
        this.provider = new LambdaStorageProvider();
        return;
      } catch (err) {
        console.warn(
          '[StorageService] Lambda provider failed, falling back:',
          err.message
        );
      }
    }

    // Direct S3 provider
    if (providerType === 's3' && process.env.AWS_S3_MEDIA_BUCKET) {
      try {
        this.provider = new S3StorageProvider();
        return;
      } catch (err) {
        console.warn(
          '[StorageService] S3 provider failed, falling back:',
          err.message
        );
      }
    }

    // Local/mock fallback
    this.provider = new MockStorageProvider(
      process.env.APP_URL || 'http://localhost:3000'
    );
  }

  /**
   * Validates MIME type against whitelist.
   * @param {string} mimeType 
   * @returns {string} File extension
   */
  validateMimeType(mimeType) {
    if (!mimeType || typeof mimeType !== 'string') {
      const err = new Error('MIME type is required and must be a string.');
      err.code = 'INVALID_MIME_TYPE';
      err.statusCode = 400;
      throw err;
    }

    const normalized = mimeType.trim().toLowerCase();
    const extension = ALLOWED_MIME_TYPES[normalized];
    if (!extension) {
      const err = new Error(`Unsupported MIME type "${normalized}". Allowed types: ${Object.keys(ALLOWED_MIME_TYPES).join(', ')}.`);
      err.code = 'UNSUPPORTED_MIME_TYPE';
      err.statusCode = 400;
      throw err;
    }

    return extension;
  }

  /**
   * Validates file size against platform threshold.
   * @param {number} fileSizeBytes 
   */
  validateFileSize(fileSizeBytes) {
    const size = Number(fileSizeBytes);
    if (!Number.isFinite(size) || size <= 0) {
      const err = new Error('File size in bytes must be a positive integer.');
      err.code = 'INVALID_FILE_SIZE';
      err.statusCode = 400;
      throw err;
    }

    if (size > MAX_FILE_SIZE_BYTES) {
      const err = new Error(`File size (${(size / (1024 * 1024)).toFixed(2)} MB) exceeds maximum limit of 5 MB.`);
      err.code = 'FILE_TOO_LARGE';
      err.statusCode = 400;
      throw err;
    }
  }

  /**
   * Validates entity type and entity ID to prevent path traversal.
   * @param {string} entityType 
   * @param {string} entityId 
   */
  validateEntity(entityType, entityId) {
    if (!entityType || !ALLOWED_ENTITY_TYPES.has(String(entityType).trim().toLowerCase())) {
      const err = new Error(`Invalid entityType "${entityType}". Allowed: ${Array.from(ALLOWED_ENTITY_TYPES).join(', ')}.`);
      err.code = 'INVALID_ENTITY_TYPE';
      err.statusCode = 400;
      throw err;
    }

    if (!entityId || typeof entityId !== 'string') {
      const err = new Error('entityId is required.');
      err.code = 'INVALID_ENTITY_ID';
      err.statusCode = 400;
      throw err;
    }

    const cleanId = entityId.trim();
    // Strict alphanumeric, dash, and underscore only. No slashes, no dots, no path traversal.
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(cleanId)) {
      const err = new Error('entityId contains forbidden characters or invalid length. Must be 1-64 alphanumeric/dash/underscore.');
      err.code = 'INVALID_ENTITY_ID_FORMAT';
      err.statusCode = 400;
      throw err;
    }

    return {
      entityType: entityType.trim().toLowerCase(),
      entityId: cleanId
    };
  }

  /**
   * Validates expiresIn duration for presigned URLs.
   * Rejects invalid, non-finite, negative, zero, malformed string, or excessively large values.
   * Upper bound: 3600 seconds (1 hour). Minimum: 1 second.
   * @param {*} expiresIn
   * @returns {number} Normalized integer seconds
   */
  validateExpiresIn(expiresIn) {
    if (expiresIn === undefined || expiresIn === null) {
      return 900;
    }

    if (typeof expiresIn === 'boolean' || typeof expiresIn === 'object' || Array.isArray(expiresIn)) {
      const err = new Error('expiresIn must be a valid integer number of seconds.');
      err.code = 'INVALID_EXPIRES_IN';
      err.statusCode = 400;
      throw err;
    }

    if (typeof expiresIn === 'string') {
      const trimmed = expiresIn.trim();
      if (!/^-?\d+$/.test(trimmed)) {
        const err = new Error('expiresIn must be a valid integer number of seconds.');
        err.code = 'INVALID_EXPIRES_IN';
        err.statusCode = 400;
        throw err;
      }
    }

    const num = Number(expiresIn);
    if (!Number.isFinite(num) || Number.isNaN(num)) {
      const err = new Error('expiresIn must be a finite number.');
      err.code = 'INVALID_EXPIRES_IN';
      err.statusCode = 400;
      throw err;
    }

    if (num <= 0) {
      const err = new Error('expiresIn must be a positive integer greater than zero.');
      err.code = 'INVALID_EXPIRES_IN';
      err.statusCode = 400;
      throw err;
    }

    if (num > 3600) {
      const err = new Error('expiresIn exceeds maximum allowable lifetime of 3600 seconds (1 hour).');
      err.code = 'EXPIRES_IN_TOO_LARGE';
      err.statusCode = 400;
      throw err;
    }

    return Math.floor(num);
  }

  /**
   * Generates a safe, unguessable S3 object key.
   * Format: media/{entityType}/{entityId}/{uuid}.{ext}
   */
  generateObjectKey(entityType, entityId, extension) {
    const uuid = crypto.randomUUID();
    return `media/${entityType}/${entityId}/${uuid}${extension}`;
  }

  /**
   * Creates a presigned upload URL after comprehensive parameter validation.
   * @param {Object} options
   * @param {string} options.entityType
   * @param {string} options.entityId
   * @param {string} options.mimeType
   * @param {number} options.fileSizeBytes
   * @param {number} [options.expiresIn=900]
   */
  async createPresignedUpload({ entityType, entityId, mimeType, fileSizeBytes, expiresIn = 900 }) {
    const ext = this.validateMimeType(mimeType);
    this.validateFileSize(fileSizeBytes);
    const { entityType: cleanType, entityId: cleanId } = this.validateEntity(entityType, entityId);
    const validExpiresIn = this.validateExpiresIn(expiresIn);

    const key = this.generateObjectKey(cleanType, cleanId, ext);
    const presigned = await this.provider.getPresignedUploadUrl({
      key,
      contentType: mimeType.trim().toLowerCase(),
      expiresIn: validExpiresIn
    });

    return {
      ...presigned,
      key,
      maxSizeBytes: MAX_FILE_SIZE_BYTES,
      entityType: cleanType,
      entityId: cleanId,
      expiresIn: validExpiresIn
    };
  }

  getReadUrl(key) {
    return this.provider.getReadUrl(key);
  }
}

module.exports = {
  StorageService,
  ALLOWED_MIME_TYPES,
  ALLOWED_ENTITY_TYPES,
  MAX_FILE_SIZE_BYTES
};
