/**
 * KrishiSetu 2.0 — Storage Service & Pre-Signing Test Suite
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { StorageService, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } = require('../services/storage/storageService');
const MockStorageProvider = require('../services/storage/mockStorageProvider');

describe('StorageService — Unit & Validation Tests', () => {
  const mockProvider = new MockStorageProvider('http://localhost:3000');
  const storageService = new StorageService(mockProvider);

  test('1. Valid upload generates compliant presigned URL and safe key', async () => {
    const result = await storageService.createPresignedUpload({
      entityType: 'product',
      entityId: 'PROD_1001',
      mimeType: 'image/jpeg',
      fileSizeBytes: 1024 * 500, // 500 KB
      expiresIn: 600
    });

    assert.strictEqual(result.provider, 'mock');
    assert.strictEqual(result.entityType, 'product');
    assert.strictEqual(result.entityId, 'PROD_1001');
    assert.strictEqual(result.method, 'PUT');
    assert.strictEqual(result.headers['Content-Type'], 'image/jpeg');
    assert.match(result.key, /^media\/product\/PROD_1001\/[a-f0-9-]+\.jpg$/);
    assert.ok(result.uploadUrl.includes(encodeURIComponent(result.key)));
  });

  test('2. Allowed MIME types (PNG, PDF) generate appropriate extensions', async () => {
    const pngResult = await storageService.createPresignedUpload({
      entityType: 'dispute',
      entityId: 'DSP_2002',
      mimeType: 'image/png',
      fileSizeBytes: 1024 * 100
    });
    assert.match(pngResult.key, /\.png$/);

    const pdfResult = await storageService.createPresignedUpload({
      entityType: 'verification',
      entityId: 'VER_3003',
      mimeType: 'application/pdf',
      fileSizeBytes: 1024 * 200
    });
    assert.match(pdfResult.key, /\.pdf$/);
  });

  test('3. Rejects invalid or executable MIME types with 400', async () => {
    const badTypes = ['application/x-msdownload', 'text/html', 'image/gif', 'application/javascript', ''];
    for (const badType of badTypes) {
      await assert.rejects(
        async () => {
          await storageService.createPresignedUpload({
            entityType: 'product',
            entityId: 'PROD_101',
            mimeType: badType,
            fileSizeBytes: 1024
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.ok(err.code === 'INVALID_MIME_TYPE' || err.code === 'UNSUPPORTED_MIME_TYPE');
          return true;
        }
      );
    }
  });

  test('4. Rejects oversized files (> 5 MB)', async () => {
    await assert.rejects(
      async () => {
        await storageService.createPresignedUpload({
          entityType: 'product',
          entityId: 'PROD_101',
          mimeType: 'image/jpeg',
          fileSizeBytes: 5 * 1024 * 1024 + 1 // 5 MB + 1 byte
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.code, 'FILE_TOO_LARGE');
        return true;
      }
    );
  });

  test('5. Rejects invalid file size values (negative, zero, NaN)', async () => {
    for (const badSize of [0, -500, NaN, 'not-a-number']) {
      await assert.rejects(
        async () => {
          await storageService.createPresignedUpload({
            entityType: 'product',
            entityId: 'PROD_101',
            mimeType: 'image/jpeg',
            fileSizeBytes: badSize
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.strictEqual(err.code, 'INVALID_FILE_SIZE');
          return true;
        }
      );
    }
  });

  test('6. Rejects path traversal and illegal characters in entityId', async () => {
    const maliciousIds = [
      '../etc/passwd',
      '..\\windows\\system32',
      'folder/subfolder',
      'id with spaces',
      'id;drop table users;',
      '"><script>alert(1)</script>'
    ];

    for (const badId of maliciousIds) {
      await assert.rejects(
        async () => {
          await storageService.createPresignedUpload({
            entityType: 'product',
            entityId: badId,
            mimeType: 'image/jpeg',
            fileSizeBytes: 1024
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.strictEqual(err.code, 'INVALID_ENTITY_ID_FORMAT');
          return true;
        }
      );
    }
  });

  test('7. Rejects invalid or unwhitelisted entityType', async () => {
    await assert.rejects(
      async () => {
        await storageService.createPresignedUpload({
          entityType: 'system_root',
          entityId: 'SYS_01',
          mimeType: 'image/jpeg',
          fileSizeBytes: 1024
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.code, 'INVALID_ENTITY_TYPE');
        return true;
      }
    );
  });

  test('8. Mock provider registers uploaded objects and generates read URL', async () => {
    const key = 'media/product/P1/uuid.jpg';
    assert.strictEqual(await mockProvider.objectExists(key), false);
    mockProvider.markObjectUploaded(key);
    assert.strictEqual(await mockProvider.objectExists(key), true);
    assert.strictEqual(mockProvider.getReadUrl(key), 'http://localhost:3000/media/media/product/P1/uuid.jpg');
  });
});

describe('LocalStorageProvider — Unit & Security Tests', () => {
  const LocalStorageProvider = require('../services/storage/localStorageProvider');

  test('9. LocalStorageProvider initializes safely without requiring AWS credentials or URLs', () => {
    const provider = new LocalStorageProvider('http://localhost:3000');
    assert.strictEqual(provider.baseUrl, 'http://localhost:3000');
  });

  test('10. Generates secure local presigned upload URL and parameters without cloud dependencies', async () => {
    const provider = new LocalStorageProvider('http://localhost:3000');
    const result = await provider.getPresignedUploadUrl({
      key: 'media/product/P1/test.jpg',
      contentType: 'image/jpeg',
      expiresIn: 900
    });

    assert.strictEqual(result.provider, 'local');
    assert.strictEqual(result.method, 'PUT');
    assert.strictEqual(result.key, 'media/product/P1/test.jpg');
    assert.ok(result.uploadUrl.includes('/api/storage/local-upload'));
    assert.strictEqual(result.headers['Content-Type'], 'image/jpeg');
  });

  test('11. objectExists and getReadUrl resolve local media paths correctly', async () => {
    const provider = new LocalStorageProvider('http://localhost:3000');
    assert.strictEqual(await provider.objectExists('media/product/P1/test.jpg'), false);
    provider.markObjectUploaded('media/product/P1/test.jpg');
    assert.strictEqual(await provider.objectExists('media/product/P1/test.jpg'), true);
    assert.strictEqual(provider.getReadUrl('media/product/P1/test.jpg'), 'http://localhost:3000/media/media/product/P1/test.jpg');
  });

  test('12. StorageService selects LocalStorageProvider by default in all environments including production', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const service = new StorageService();
      assert.strictEqual(service.provider instanceof LocalStorageProvider, true);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});
