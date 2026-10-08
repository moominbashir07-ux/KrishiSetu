/**
 * KrishiSetu 2.0 — Storage Express Router
 * Mounts /api/storage/presigned-url
 */

const express = require('express');
const db = require('../db/db');
const { authenticateUser } = require('../middleware/auth');
const { StorageService } = require('../services/storage/storageService');

const router = express.Router();
const defaultStorageService = new StorageService();

/**
 * IDOR Authorization Guard for Storage Upload Requests.
 * Verifies that the authenticated caller has legitimate ownership or association
 * with the target entity before generating a presigned upload URL.
 */
async function authorizeStorageEntity(user, entityType, entityId) {
  if (!user) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const normalizedType = String(entityType || '').trim().toLowerCase();
  const normalizedId = String(entityId || '').trim();

  const allowedTypes = new Set(['product', 'quality', 'profile', 'verification', 'dispute']);
  if (!allowedTypes.has(normalizedType)) {
    const err = new Error(`Invalid entityType "${entityType}". Allowed: ${Array.from(allowedTypes).join(', ')}.`);
    err.code = 'INVALID_ENTITY_TYPE';
    err.statusCode = 400;
    throw err;
  }

  if (!normalizedId || !/^[A-Za-z0-9_-]{1,64}$/.test(normalizedId)) {
    const err = new Error('Invalid target entityId format.');
    err.code = 'INVALID_ENTITY_ID_FORMAT';
    err.statusCode = 400;
    throw err;
  }

  const isAdmin = user.role === 'admin';

  switch (normalizedType) {
    case 'profile': {
      const userRes = await db.query('SELECT id FROM users WHERE id = $1', [normalizedId]);
      if (!userRes || !userRes.rows || userRes.rows.length === 0) {
        const err = new Error(`Target user account "${normalizedId}" not found.`);
        err.statusCode = 404;
        err.code = 'ENTITY_NOT_FOUND';
        throw err;
      }
      if (!isAdmin && user.id !== normalizedId) {
        const err = new Error('Unauthorized: You can only upload files for your own account.');
        err.statusCode = 403;
        err.code = 'IDOR_ACCESS_DENIED';
        throw err;
      }
      return true;
    }

    case 'verification': {
      const verRes = await db.query(
        'SELECT id, seller_id FROM seller_verifications WHERE id = $1 OR seller_id = $1',
        [normalizedId]
      );
      let targetOwnerId = null;
      if (verRes && verRes.rows && verRes.rows.length > 0) {
        targetOwnerId = verRes.rows[0].seller_id;
      } else {
        const userRes = await db.query('SELECT id, role FROM users WHERE id = $1', [normalizedId]);
        if (!userRes || !userRes.rows || userRes.rows.length === 0) {
          const err = new Error(`Target verification entity "${normalizedId}" not found.`);
          err.statusCode = 404;
          err.code = 'ENTITY_NOT_FOUND';
          throw err;
        }
        targetOwnerId = userRes.rows[0].id;
      }

      if (!isAdmin && user.id !== targetOwnerId) {
        const err = new Error('Unauthorized: You can only upload verification files for your own account.');
        err.statusCode = 403;
        err.code = 'IDOR_ACCESS_DENIED';
        throw err;
      }
      return true;
    }

    case 'product':
    case 'quality': {
      if (!isAdmin && user.role !== 'seller') {
        const err = new Error('Unauthorized: Only sellers or administrators can upload product media.');
        err.statusCode = 403;
        err.code = 'SELLER_REQUIRED';
        throw err;
      }

      const prodRes = await db.query('SELECT seller_id FROM products WHERE id = $1', [normalizedId]);
      if (!prodRes || !prodRes.rows || prodRes.rows.length === 0) {
        const err = new Error(`Target product "${normalizedId}" not found.`);
        err.statusCode = 404;
        err.code = 'ENTITY_NOT_FOUND';
        throw err;
      }

      if (!isAdmin && prodRes.rows[0].seller_id !== user.id) {
        const err = new Error('Unauthorized: You can only upload media for products you own.');
        err.statusCode = 403;
        err.code = 'IDOR_ACCESS_DENIED';
        throw err;
      }
      return true;
    }

    case 'dispute': {
      const { disputeService } = require('./disputes');
      const dispute = await disputeService.repo.getDisputeById(normalizedId);
      if (!dispute) {
        const err = new Error(`Target dispute "${normalizedId}" not found.`);
        err.statusCode = 404;
        err.code = 'ENTITY_NOT_FOUND';
        throw err;
      }

      if (!isAdmin && dispute.claimantId !== user.id && dispute.respondentId !== user.id) {
        const err = new Error('Unauthorized: You can only upload evidence for disputes you are party to.');
        err.statusCode = 403;
        err.code = 'IDOR_ACCESS_DENIED';
        throw err;
      }
      return true;
    }

    default: {
      const err = new Error(`Unsupported entityType "${normalizedType}".`);
      err.statusCode = 400;
      err.code = 'INVALID_ENTITY_TYPE';
      throw err;
    }
  }
}

// POST /api/storage/presigned-url
router.post('/presigned-url', authenticateUser, async (req, res, next) => {
  try {
    const { entityType, entityId, mimeType, fileSizeBytes, expiresIn } = req.body;

    // Validate expiresIn explicitly before use
    const validatedExpiresIn = defaultStorageService.validateExpiresIn(expiresIn);

    // IDOR & Target existence verification
    await authorizeStorageEntity(req.user, entityType, entityId);

    const result = await defaultStorageService.createPresignedUpload({
      entityType,
      entityId,
      mimeType,
      fileSizeBytes,
      expiresIn: validatedExpiresIn
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        error: {
          code: err.code || 'STORAGE_ERROR',
          message: err.message
        }
      });
    }
    next(err);
  }
});

const path = require('path');
const LocalStorageProvider = require('../services/storage/localStorageProvider');

// Production-safe local media upload endpoint (Zero AWS dependency)
// Hardened with cryptographic HMAC signature verification and path traversal rejection
const handleLocalUpload = (req, res) => {
  const query = req.query || {};
  const body = req.body || {};
  const key = query.key || body.key;
  const expires = query.expires || body.expires;
  const signature = query.signature || body.signature;

  // 1. Key validation
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Missing object key in storage upload.' });
  }

  // Path traversal & unauthorized object paths protection
  let decodedKey = key;
  try {
    decodedKey = decodeURIComponent(key);
  } catch {
    return res.status(400).json({ error: 'Malformed encoded object key.' });
  }

  if (
    decodedKey.includes('..') ||
    key.includes('..') ||
    /%2e%2e/i.test(key) ||
    path.isAbsolute(decodedKey) ||
    decodedKey.startsWith('/') ||
    decodedKey.startsWith('\\') ||
    decodedKey.includes('\0') ||
    /^[a-zA-Z]:/.test(decodedKey) ||
    !/^media\/(product|verification|dispute|quality|profile)\//.test(decodedKey)
  ) {
    return res.status(400).json({ error: 'Illegal path traversal or unauthorized object key.' });
  }

  // Executable / script blocking on key extension
  const blockedExtensions = ['.exe', '.sh', '.bat', '.cmd', '.js', '.ts', '.py', '.php', '.pl', '.vbs', '.scr'];
  const ext = path.extname(decodedKey).toLowerCase();
  if (blockedExtensions.includes(ext)) {
    return res.status(400).json({ error: 'Executable and script file uploads are strictly blocked.' });
  }

  // 2. Expiry validation
  if (!expires) {
    return res.status(400).json({ error: 'Missing expiration timestamp in storage upload.' });
  }
  const expiryNum = Number(expires);
  if (isNaN(expiryNum)) {
    return res.status(400).json({ error: 'Invalid expiration timestamp.' });
  }
  if (Date.now() > expiryNum) {
    return res.status(403).json({ error: 'Pre-signed upload URL has expired.' });
  }

  // 3. Cryptographic HMAC Signature verification
  if (!signature) {
    return res.status(403).json({ error: 'Missing cryptographic HMAC signature.' });
  }

  const isValidSig = LocalStorageProvider.verifySignature(key, expires, signature);
  if (!isValidSig) {
    return res.status(403).json({ error: 'Invalid or tampered upload signature.' });
  }

  // 4. File restrictions (size limit: 5MB) if headers are supplied
  if (req.headers['content-length']) {
    const contentLength = Number(req.headers['content-length']);
    if (contentLength > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Uploaded file exceeds 5MB size limit.' });
    }
  }

  if (defaultStorageService.provider && defaultStorageService.provider.markObjectUploaded) {
    defaultStorageService.provider.markObjectUploaded(key);
  }
  return res.status(200).json({ success: true, message: 'Upload successful', key });
};

router.all('/local-upload', handleLocalUpload);
router.all('/mock-upload', (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: {
        code: 'MOCK_STORAGE_DISABLED_IN_PRODUCTION',
        message: 'Mock storage upload endpoint is disabled in production environments.'
      }
    });
  }
  return handleLocalUpload(req, res);
});

module.exports = {
  storageRouter: router,
  defaultStorageService,
  authorizeStorageEntity,
  handleLocalUpload
};
