const express = require('express');
const db = require('../db/db');
const { authenticateUser, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET REVIEWS FOR A PRODUCT
router.get('/products/:productId', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT r.*, u.name as "buyerName"
       FROM reviews r
       JOIN users u ON r.buyer_id = u.id
       WHERE r.product_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.productId]
    );

    const reviews = result.rows.map(r => ({
      ...r,
      verifiedPurchase: true
    }));

    const avgRating = reviews.length > 0 
      ? Math.round((reviews.reduce((sum, r) => sum + Number(r.rating), 0) / reviews.length) * 10) / 10 
      : 5.0;

    res.json({
      productId: req.params.productId,
      reviews,
      count: reviews.length,
      averageRating: avgRating
    });
  } catch (err) {
    next(err);
  }
});

// SUBMIT VERIFIED PURCHASE REVIEW (CUSTOMER ONLY)
router.post('/', authenticateUser, requireRole('customer'), async (req, res, next) => {
  const { productId, rating, comment } = req.body;

  const numRating = Number(rating);
  if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
    return res.status(400).json({ error: 'Rating must be an integer between 1 and 5 stars.' });
  }

  if (!comment || typeof comment !== 'string' || !comment.trim() || comment.trim().length < 5) {
    return res.status(400).json({ error: 'Please write a review comment at least 5 characters long.' });
  }

  try {
    // 1. Verify product exists
    const prodRes = await db.query('SELECT id, seller_id FROM products WHERE id = $1', [productId]);
    if (!prodRes.rows.length) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    const product = prodRes.rows[0];

    // 2. Verify buyer actually purchased this product in a valid order
    const orderRes = await db.query(
      `SELECT o.id 
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE o.customer_id = $1 AND oi.product_id = $2
       LIMIT 1`,
      [req.user.id, productId]
    );

    if (!orderRes.rows.length) {
      return res.status(403).json({
        error: 'Only customers who have purchased this produce item can submit a verified review.'
      });
    }

    const orderId = orderRes.rows[0].id;
    const reviewId = 'REV_' + Date.now() + Math.random().toString(36).substring(2, 5);

    // Insert review
    await db.query(
      `INSERT INTO reviews (id, product_id, buyer_id, order_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (buyer_id, order_id, product_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = CURRENT_TIMESTAMP`,
      [reviewId, productId, req.user.id, orderId, numRating, comment.trim()]
    );

    // Update seller profile review count & rating
    const allSellerRevs = await db.query(
      `SELECT r.rating 
       FROM reviews r
       JOIN products p ON r.product_id = p.id
       WHERE p.seller_id = $1`,
      [product.seller_id]
    );

    if (allSellerRevs.rows.length > 0) {
      const totalRating = allSellerRevs.rows.reduce((sum, r) => sum + Number(r.rating), 0);
      const avg = Math.round((totalRating / allSellerRevs.rows.length) * 10) / 10;
      await db.query(
        'UPDATE seller_profiles SET rating = $1, review_count = $2 WHERE user_id = $3',
        [avg, allSellerRevs.rows.length, product.seller_id]
      );
    }

    res.status(201).json({
      message: 'Verified review submitted successfully.',
      review: {
        id: reviewId,
        productId,
        buyerId: req.user.id,
        buyerName: req.user.name,
        rating: numRating,
        comment: comment.trim(),
        verifiedPurchase: true
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
