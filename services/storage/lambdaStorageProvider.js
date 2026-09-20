/**
 * KrishiSetu 2.0 — AWS Lambda Storage Provider
 *
 * Render backend calls AWS Lambda.
 * Lambda generates the S3 presigned upload URL.
 * Render does NOT need AWS credentials.
 */

const StorageProvider = require('./storageProvider');

class LambdaStorageProvider extends StorageProvider {
  constructor(options = {}) {
    super();

    this.functionUrl =
      options.functionUrl ||
      process.env.AWS_LAMBDA_STORAGE_URL;

    if (!this.functionUrl) {
      throw new Error(
        'AWS_LAMBDA_STORAGE_URL configuration is required for LambdaStorageProvider.'
      );
    }

    this.functionUrl = this.functionUrl.trim().replace(/\/+$/, '');
  }

  async getPresignedUploadUrl({
    key,
    contentType,
    expiresIn = 900
  }) {
    const response = await fetch(this.functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key,
        contentType,
        expiresIn
      })
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        `Lambda storage service returned non-JSON response (HTTP ${response.status}).`
      );
    }

    if (!response.ok || !data.success || !data.uploadUrl) {
      throw new Error(
        data.message ||
        `Lambda storage service failed with HTTP ${response.status}.`
      );
    }

    // Security check: Lambda must return the exact key we requested.
    if (data.key !== key) {
      throw new Error(
        'Lambda storage service returned a different storage key.'
      );
    }

    return {
      uploadUrl: data.uploadUrl,
      key,
      method: 'PUT',
      headers: {
        'Content-Type': contentType
      },
      expiresIn: data.expiresIn || expiresIn,
      provider: 'lambda'
    };
  }

  async objectExists() {
    throw new Error(
      'objectExists() is not implemented for LambdaStorageProvider.'
    );
  }

  getReadUrl(key) {
    const bucket =
      process.env.AWS_S3_MEDIA_BUCKET ||
      'krishisetu-evidence-2026';

    const region =
      process.env.AWS_REGION ||
      'ap-south-1';

    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }
}

module.exports = LambdaStorageProvider;