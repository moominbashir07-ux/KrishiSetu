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

// Mock upload endpoint for local testing (Strictly disabled in production)
router.all('/mock-upload', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: {
        code: 'MOCK_STORAGE_DISABLED_IN_PRODUCTION',
        message: 'Mock upload endpoint is disabled in production environments.'
      }
    });
  }
  const key = req.query.key;
  if (!key) {
    return res.status(400).json({ error: 'Missing object key in mock upload.' });
  }
  if (defaultStorageService.provider.markObjectUploaded) {
    defaultStorageService.provider.markObjectUploaded(key);
  }
  res.status(200).json({ success: true, message: 'Mock upload successful', key });
});

module.exports = {
  storageRouter: router,
  defaultStorageService,
  authorizeStorageEntity
};
