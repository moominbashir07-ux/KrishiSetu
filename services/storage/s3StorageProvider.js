/**
 * KrishiSetu 2.0 — AWS S3 Storage Provider
 * Production-ready pre-signed URL generator using AWS SDK v3
 */

const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const StorageProvider = require('./storageProvider');

class S3StorageProvider extends StorageProvider {
  constructor(options = {}) {
    super();
    this.region = options.region || process.env.AWS_REGION || 'ap-south-1';
    this.bucket = options.bucket || process.env.AWS_S3_MEDIA_BUCKET;
    
    if (!this.bucket) {
      throw new Error('AWS_S3_MEDIA_BUCKET configuration is required for S3StorageProvider.');
    }

    const clientConfig = { region: this.region };
    // If explicit credentials passed in options or environment, configure them
    if (options.credentials) {
      clientConfig.credentials = options.credentials;
    } else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      clientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN || undefined
      };
    }

    this.s3 = new S3Client(clientConfig);
  }

  async getPresignedUploadUrl({ key, contentType, expiresIn = 900 }) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn });

    return {
      uploadUrl,
      key,
      method: 'PUT',
      headers: {
        'Content-Type': contentType
      },
      expiresIn,
      provider: 's3'
    };
  }

  async objectExists(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key
      });
      await this.s3.send(command);
      return true;
    } catch (err) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  getReadUrl(key) {
    if (process.env.CLOUDFRONT_DOMAIN) {
      return `https://${process.env.CLOUDFRONT_DOMAIN}/${key}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}

module.exports = S3StorageProvider;
