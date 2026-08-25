const express = require('express');
const db = require('../db/db');
const { authenticateUser, requireRole } = require('../middleware/auth');

const router = express.Router();

// All routes require authenticated ADMIN role
router.use(authenticateUser, requireRole('admin'));

// GET ALL USERS (ADMIN)
router.get('/users', async (req, res, next) => {
  const { role, status } = req.query;

  try {
    let sql = 'SELECT id, name, contact, role, account_status, email_verified, phone, phone_verified, profile_photo, created_at FROM users';
    const conditions = [];
    const params = [];

    if (role && ['customer', 'seller', 'admin'].includes(role)) {
      params.push(role);
      conditions.push(`role = $${params.length}`);
    }

    if (status && ['active', 'frozen', 'suspended'].includes(status)) {
      params.push(status);
      conditions.push(`account_status = $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY created_at DESC';

    const result = await db.query(sql, params);
    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
});

// AUDIT LOG HELPER FUNCTION
async function logAdminAction(adminId, action, targetId, details) {
  try {
    const id = 'LOG_' + Date.now() + Math.random().toString(36).substring(2, 5);
    await db.query(
      `INSERT INTO admin_audit_logs (id, admin_id, action, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, adminId, action, targetId, details]
    );
  } catch (err) {
    console.warn('Admin audit logging failed:', err.message);
  }
}

// UPDATE USER ACCOUNT STATUS (FREEZE / UNFREEZE / SUSPEND)
router.put('/users/:id/status', async (req, res, next) => {
  const { status } = req.body;
  const userId = req.params.id;

  if (!['active', 'frozen', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Status must be one of: active, frozen, suspended.' });
  }

  try {
    const userRes = await db.query('SELECT id, name, role FROM users WHERE id = $1', [userId]);
    if (!userRes.rows.length) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    await db.query(
      'UPDATE users SET account_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [status, userId]
    );

    await logAdminAction(req.user.id, `ACCOUNT_${status.toUpperCase()}`, userId, `Set user '${userId}' account status to '${status}'`);

    res.json({
      message: `User account '${userId}' status updated to '${status}'.`,
      userId,
      status
    });
  } catch (err) {
    next(err);
  }
});

// GET ALL PRODUCTS (ADMIN MODERATION)
router.get('/products', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT p.*, u.name as "sellerName", u.contact as "sellerContact"
       FROM products p
       JOIN users u ON p.seller_id = u.id
       ORDER BY p.created_at DESC`
    );
    res.json({ products: result.rows });
  } catch (err) {
    next(err);
  }
});

// DELETE / REMOVE PRODUCT (ADMIN MODERATION)
router.delete('/products/:id', async (req, res, next) => {
  try {
    await db.query("UPDATE products SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);
    await logAdminAction(req.user.id, 'DELETE_PRODUCT', req.params.id, `Deactivated product '${req.params.id}'`);
    res.json({ message: 'Product listing removed by admin.', productId: req.params.id });
  } catch (err) {
    next(err);
  }
});

// GET ALL ORDERS (ADMIN)
router.get('/orders', async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json({ orders: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET ALL REVIEWS (ADMIN MODERATION)
router.get('/reviews', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT r.*, u.name as "buyerName", p.name as "productName"
       FROM reviews r
       JOIN users u ON r.buyer_id = u.id
       JOIN products p ON r.product_id = p.id
       ORDER BY r.created_at DESC`
    );
    res.json({ reviews: result.rows });
  } catch (err) {
    next(err);
  }
});

// DELETE REVIEW (ADMIN MODERATION)
router.delete('/reviews/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM reviews WHERE id = $1', [req.params.id]);
    await logAdminAction(req.user.id, 'DELETE_REVIEW', req.params.id, `Deleted review '${req.params.id}'`);
    res.json({ message: 'Review removed by admin.', reviewId: req.params.id });
  } catch (err) {
    next(err);
  }
});

// GET PAYMENTS SUBMISSIONS (ADMIN)
router.get('/payments', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT o.id, o.order_number, o.customer_id, o.seller_id, o.total_amount as total, o.payment_method, o.payment_status, o.created_at,
              u_cust.name as "customerName", u_cust.contact as "customerContact", u_sell.name as "sellerName"
       FROM orders o
       JOIN users u_cust ON o.customer_id = u_cust.id
       JOIN users u_sell ON o.seller_id = u_sell.id
       ORDER BY o.created_at DESC`
    );
    res.json({ payments: result.rows });
  } catch (err) {
    next(err);
  }
});

// UPDATE PAYMENT STATUS (VERIFIED / REJECTED / PENDING)
router.put('/payments/:id/status', async (req, res, next) => {
  const { status } = req.body;
  const orderId = req.params.id;

  if (!['submitted', 'verified', 'rejected', 'pending', 'cod'].includes(status)) {
    return res.status(400).json({ error: 'Status must be one of: submitted, verified, rejected, pending, cod.' });
  }

  try {
    const orderRes = await db.query('SELECT id, order_number, customer_id, seller_id FROM orders WHERE id = $1 OR order_number = $1', [orderId]);
    if (!orderRes.rows.length) {
      return res.status(404).json({ error: 'Order record not found.' });
    }
    const order = orderRes.rows[0];

    await db.query('UPDATE orders SET payment_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, order.id]);
    await logAdminAction(req.user.id, 'UPDATE_PAYMENT_STATUS', order.id, `Updated payment status for order '${order.order_number}' to '${status}'`);

    // Dispatch notifications
    const notifCustomer = 'NOTIF_' + Date.now() + Math.random().toString(36).substring(2, 5);
    await db.query(
      `INSERT INTO notifications (id, user_id, type, title, message, read, order_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [notifCustomer, order.customer_id, 'payment_update', `💳 Payment Status Updated #${order.order_number}`, `Payment status has been marked as '${status}'.`, false, order.id]
    );

    res.json({ message: `Payment status for order '${order.order_number}' updated to '${status}'.`, orderId: order.id, status });
  } catch (err) {
    next(err);
  }
});

// SECURE WHITELISTED DATABASE TABLE INSPECTOR (ADMIN)
const WHITELISTED_TABLES = [
  'users', 'seller_profiles', 'customer_profiles', 'products', 'orders', 
  'order_items', 'cart_items', 'reviews', 'feedback', 'notifications', 
  'seller_verifications', 'admin_audit_logs'
];

router.get('/database/tables', async (req, res) => {
  res.json({ tables: WHITELISTED_TABLES });
});

router.get('/database/tables/:tableName', async (req, res, next) => {
  const { tableName } = req.params;
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(10, Number(req.query.limit || 20)));
  const offset = (page - 1) * limit;

  if (!WHITELISTED_TABLES.includes(tableName)) {
    return res.status(400).json({ error: `Access denied. Table '${tableName}' is not in the allowed admin inspection whitelist.` });
  }

  try {
    const result = await db.query(`SELECT * FROM ${tableName} ORDER BY 1 DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    
    // Mask sensitive fields in returned database rows
    const maskedRows = result.rows.map(row => {
      const clone = { ...row };
      if (clone.password_hash) clone.password_hash = '[MASKED_HASH]';
      if (clone.otp_code) clone.otp_code = '[MASKED_OTP]';
      if (clone.jwt_secret) clone.jwt_secret = '[MASKED_SECRET]';
      return clone;
    });

    res.json({
      table: tableName,
      page,
      limit,
      count: maskedRows.length,
      rows: maskedRows
    });
  } catch (err) {
    next(err);
  }
});

// GET ADMIN AUDIT LOGS
router.get('/audit-logs', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT l.*, u.name as "adminName" 
       FROM admin_audit_logs l 
       JOIN users u ON l.admin_id = u.id 
       ORDER BY l.created_at DESC LIMIT 100`
    );
    res.json({ auditLogs: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET ADMIN METRICS SUMMARY
router.get('/metrics', async (req, res, next) => {
  try {
    const metricsRes = await db.query('SELECT COUNT(*) as count FROM users');
    const metrics = metricsRes.rows[0] || {};

    res.json({
      metrics: {
        totalUsers: Number(metrics.totalUsers || 0),
        totalSellers: Number(metrics.totalSellers || metrics.count || 0),
        totalCustomers: Number(metrics.totalCustomers || 0),
        frozenUsers: Number(metrics.frozenUsers || 0),
        pendingVerifications: Number(metrics.pendingVerifications || 0),
        verifiedSellers: Number(metrics.verifiedSellers || 0),
        rejectedVerifications: Number(metrics.rejectedVerifications || 0),
        totalProducts: Number(metrics.totalProducts || 0),
        totalOrders: Number(metrics.totalOrders || 0),
        totalReviews: Number(metrics.totalReviews || 0),
        totalFeedback: Number(metrics.totalFeedback || 0)
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
