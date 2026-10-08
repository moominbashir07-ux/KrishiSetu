const express = require('express');
const db = require('../db/db');
const { authenticateUser, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET REVIEWS FOR SELLER'S PRODUCTS (SELLER OR ADMIN ONLY, STRICT IDOR PROTECTION)
router.get('/seller', authenticateUser, async (req, res, next) => {
  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. Seller credentials required to view seller reviews.' });
    }

    const sellerId = req.user.id;
    const result = await db.query(
      `SELECT r.id, r.product_id, r.buyer_id, r.order_id, r.rating, r.comment, r.created_at,
              p.name as "productName", p.category as "productCategory",
              u.name as "buyerName"
       FROM reviews r
       JOIN products p ON r.product_id = p.id
       JOIN users u ON r.buyer_id = u.id
       WHERE p.seller_id = $1
       ORDER BY r.created_at DESC`,
      [sellerId]
    );

    const reviews = result.rows.map(r => ({
      id: r.id,
      productId: r.product_id,
      productName: r.productName,
      productCategory: r.productCategory,
      buyerName: r.buyerName || 'Verified Customer',
      rating: Number(r.rating),
      comment: r.comment,
      orderId: r.order_id,
      createdAt: r.created_at,
      verifiedPurchase: true
    }));

    const avgRating = reviews.length > 0 
      ? Math.round((reviews.reduce((sum, r) => sum + Number(r.rating), 0) / reviews.length) * 10) / 10 
      : 5.0;

    res.json({
      sellerId,
      reviews,
      count: reviews.length,
      averageRating: avgRating
    });
  } catch (err) {
    next(err);
  }
});

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
  const productId = req.body.productId || req.body.product_id;
  const { rating, comment } = req.body;
  const suppliedOrderId = req.body.orderId || req.body.order_id;

  if (!productId || typeof productId !== 'string' || !productId.trim()) {
    return res.status(400).json({ error: 'Product ID is required to submit a review.' });
  }

  const numRating = Number(rating);
  if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
    return res.status(400).json({ error: 'Rating must be an integer between 1 and 5 stars.' });
  }

  if (!comment || typeof comment !== 'string' || !comment.trim() || comment.trim().length < 5) {
    return res.status(400).json({ error: 'Please write a review comment at least 5 characters long.' });
  }

  if (comment.trim().length > 2000) {
    return res.status(400).json({ error: 'Review comment exceeds maximum allowed length of 2000 characters.' });
  }

  if (suppliedOrderId !== undefined && (typeof suppliedOrderId !== 'string' || !suppliedOrderId.trim())) {
    return res.status(400).json({ error: 'Order ID, if provided, must be a valid non-empty string.' });
  }

  try {
    // 1. Verify product exists
    const prodRes = await db.query('SELECT id, seller_id FROM products WHERE id = $1', [productId.trim()]);
    if (!prodRes.rows.length) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    const product = prodRes.rows[0];

    // 2. Verify buyer actually purchased this product in an active order
    let orderQuery = `SELECT o.id, o.status 
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE o.customer_id = $1 AND oi.product_id = $2 AND o.status NOT IN ('Cancelled', 'Rejected')`;
    const orderParams = [req.user.id, productId.trim()];

    if (suppliedOrderId) {
      orderParams.push(suppliedOrderId.trim());
      orderQuery += ` AND (o.id = $3 OR o.order_number = $3)`;
    }

    orderQuery += ` LIMIT 1`;
    const orderRes = await db.query(orderQuery, orderParams);

    if (!orderRes.rows.length) {
      return res.status(403).json({
        error: 'Only customers who have purchased this produce item can submit a verified review.'
      });
    }

    const orderId = orderRes.rows[0].id;
    const reviewId = 'REV_' + Date.now() + Math.random().toString(36).substring(2, 5);

    // Insert or update review (strictly 1 review per purchase order per product)
    const insertRes = await db.query(
      `INSERT INTO reviews (id, product_id, buyer_id, order_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (buyer_id, order_id, product_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = CURRENT_TIMESTAMP`,
      [reviewId, productId.trim(), req.user.id, orderId, numRating, comment.trim()]
    );
    const actualReviewId = (insertRes.rows && insertRes.rows[0] && insertRes.rows[0].id) || reviewId;

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
      success: true,
      message: 'Verified review submitted successfully.',
      review: {
        id: actualReviewId,
        productId: productId.trim(),
        buyerId: req.user.id,
        buyerName: req.user.name,
        rating: numRating,
        comment: comment.trim(),
        orderId,
        verifiedPurchase: true
      }
    });
  } catch (err) {
    next(err);
  }
});

// DELETE REVIEW (AUTHOR OR ADMIN ONLY)
router.delete('/:id', authenticateUser, async (req, res, next) => {
  try {
    const revRes = await db.query(
      `SELECT r.*, p.seller_id 
       FROM reviews r
       JOIN products p ON r.product_id = p.id
       WHERE r.id = $1`,
      [req.params.id]
    );

    if (!revRes.rows.length) {
      return res.status(404).json({ error: 'Review not found.' });
    }

    const review = revRes.rows[0];

    // Ownership check: only review author or admin can delete
    if (review.buyer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. You do not have permission to delete this review.' });
    }

    await db.query('DELETE FROM reviews WHERE id = $1', [req.params.id]);

    // Recompute seller rating and review count
    if (review.seller_id) {
      const allSellerRevs = await db.query(
        `SELECT r.rating 
         FROM reviews r
         JOIN products p ON r.product_id = p.id
         WHERE p.seller_id = $1`,
        [review.seller_id]
      );

      const count = allSellerRevs.rows.length;
      const avg = count > 0 
        ? Math.round((allSellerRevs.rows.reduce((sum, r) => sum + Number(r.rating), 0) / count) * 10) / 10 
        : 5.0;

      await db.query(
        'UPDATE seller_profiles SET rating = $1, review_count = $2 WHERE user_id = $3',
        [avg, count, review.seller_id]
      );
    }

    res.json({ success: true, message: 'Verified review deleted successfully.', reviewId: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
