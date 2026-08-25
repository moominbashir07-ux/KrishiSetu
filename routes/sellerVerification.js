const express = require('express');
const db = require('../db/db');
const { authenticateUser, requireRole } = require('../middleware/auth');
const DocumentStorageService = require('../services/documentStorageService');

const router = express.Router();

// SUBMIT SELLER VERIFICATION APPLICATION
router.post('/', authenticateUser, requireRole('seller'), async (req, res, next) => {
  const { documentType, documentReference, fileName, fileSize } = req.body;
  const sellerId = req.user.id;

  try {
    const docMeta = DocumentStorageService.storeDocumentReference({
      sellerId,
      documentType,
      documentReference,
      fileName,
      fileSize
    });

    const verificationId = 'SV_' + Date.now() + Math.random().toString(36).substring(2, 6);

    await db.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO seller_verifications (id, seller_id, document_type, document_reference, document_url, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [verificationId, sellerId, docMeta.documentType, docMeta.documentReference, docMeta.documentUrl, 'pending']
      );

      await client.query(
        'UPDATE seller_profiles SET verification_status = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
        ['pending', sellerId]
      );
    });

    res.status(201).json({
      message: 'Seller verification application submitted successfully. Pending admin review.',
      verification: {
        id: verificationId,
        sellerId,
        documentType: docMeta.documentType,
        documentReference: docMeta.documentReference,
        status: 'pending',
        submittedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET SELLER VERIFICATION STATUS
router.get('/status', authenticateUser, requireRole('seller'), async (req, res, next) => {
  const sellerId = req.user.id;

  try {
    const profileRes = await db.query(
      'SELECT verification_status, business_name FROM seller_profiles WHERE user_id = $1',
      [sellerId]
    );

    const verifRes = await db.query(
      'SELECT * FROM seller_verifications WHERE seller_id = $1 ORDER BY submitted_at DESC',
      [sellerId]
    );

    const profile = profileRes.rows[0] || {};
    const status = profile.verification_status || 'pending';
    const applications = verifRes.rows;
    const latestApp = applications[0] || null;

    res.json({
      status,
      businessName: profile.business_name || `${req.user.name}'s Farm`,
      latestApplication: latestApp,
      history: applications
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
