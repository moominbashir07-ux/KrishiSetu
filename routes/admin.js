const express = require('express');
const db = require('../db/db');
const { authenticateUser, requireRole } = require('../middleware/auth');

const router = express.Router();

// All routes require authenticated ADMIN role
router.use(authenticateUser, requireRole('admin'));

// GET ALL SELLER VERIFICATION APPLICATIONS
router.get('/verifications', async (req, res, next) => {
  const { status } = req.query;

  try {
    let sql = `
      SELECT sv.*, u.name as "sellerName", u.contact as "sellerContact", sp.business_name as "businessName"
      FROM seller_verifications sv
      JOIN users u ON sv.seller_id = u.id
      LEFT JOIN seller_profiles sp ON sv.seller_id = sp.user_id
    `;
    const params = [];

    if (status && ['pending', 'verified', 'rejected'].includes(status)) {
      params.push(status);
      sql += ` WHERE sv.status = $1`;
    }

    sql += ' ORDER BY sv.submitted_at DESC';

    const result = await db.query(sql, params);
    res.json({ verifications: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET SINGLE VERIFICATION DETAILS
router.get('/verifications/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT sv.*, u.name as "sellerName", u.contact as "sellerContact", sp.business_name as "businessName", sp.description
       FROM seller_verifications sv
       JOIN users u ON sv.seller_id = u.id
       LEFT JOIN seller_profiles sp ON sv.seller_id = sp.user_id
       WHERE sv.id = $1`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Verification application not found.' });
    }

    res.json({ verification: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// REVIEW SELLER VERIFICATION (APPROVE / REJECT)
router.put('/verifications/:id', async (req, res, next) => {
  const { status, rejectionReason } = req.body;
  const verificationId = req.params.id;

  if (!['verified', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be either "verified" or "rejected".' });
  }

  if (status === 'rejected' && (!rejectionReason || typeof rejectionReason !== 'string' || !rejectionReason.trim())) {
    return res.status(400).json({ error: 'Rejection reason is required when rejecting a verification application.' });
  }

  try {
    const verifRes = await db.query('SELECT id, seller_id FROM seller_verifications WHERE id = $1', [verificationId]);
    if (!verifRes.rows.length) {
      return res.status(404).json({ error: 'Verification application not found.' });
    }

    const verification = verifRes.rows[0];
    const sellerId = verification.seller_id;
    const adminId = req.user.id;
    const reasonText = status === 'rejected' ? rejectionReason.trim() : null;

    await db.withTransaction(async (client) => {
      await client.query(
        `UPDATE seller_verifications 
         SET status = $1, admin_id = $2, rejection_reason = $3, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [status, adminId, reasonText, verificationId]
      );

      await client.query(
        `UPDATE seller_profiles SET verification_status = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
        [status, sellerId]
      );
    });

    res.json({
      message: `Seller verification status updated to '${status}'.`,
      verificationId,
      sellerId,
      status,
      rejectionReason: reasonText
    });
  } catch (err) {
    next(err);
  }
});

// GET ADMIN METRICS SUMMARY
router.get('/metrics', async (req, res, next) => {
  try {
    const metricsRes = await db.query('SELECT COUNT(*) as count FROM users WHERE role = \'seller\'');
    const metrics = metricsRes.rows[0] || {};

    res.json({
      metrics: {
        totalSellers: Number(metrics.totalSellers || metrics.count || 0),
        pendingVerifications: Number(metrics.pendingVerifications || 0),
        verifiedSellers: Number(metrics.verifiedSellers || 0),
        rejectedVerifications: Number(metrics.rejectedVerifications || 0),
        totalOrders: Number(metrics.totalOrders || 0)
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
