const express = require('express');
const db = require('../db/db');
const { authenticateUser, requireRole, requireProductOwnership } = require('../middleware/auth');
const { validateProductInput } = require('../middleware/validate');

const router = express.Router();

// GET ALL ACTIVE PRODUCTS (Optional filtering by category or seller)
router.get('/', async (req, res, next) => {
  const { sellerId, category } = req.query;
  try {
    let sql = `SELECT p.*, u.name as "sellerName", u.contact as "sellerContact", COALESCE(sp.verification_status, 'pending') as "sellerVerificationStatus" 
               FROM products p 
               JOIN users u ON p.seller_id = u.id 
               LEFT JOIN seller_profiles sp ON p.seller_id = sp.user_id 
               WHERE p.status != 'inactive'`;
    const params = [];

    if (sellerId) {
      params.push(sellerId);
      sql += ` AND p.seller_id = $${params.length}`;
    }
    if (category && category !== 'All' && category !== 'All produce') {
      params.push(category);
      sql += ` AND LOWER(p.category) = LOWER($${params.length})`;
    }

    sql += ' ORDER BY p.created_at DESC';

    const result = await db.query(sql, params);
    res.json({ products: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET SINGLE PRODUCT BY ID
router.get('/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT p.*, u.name as "sellerName", u.contact as "sellerContact", COALESCE(sp.verification_status, 'pending') as "sellerVerificationStatus" 
       FROM products p 
       JOIN users u ON p.seller_id = u.id 
       LEFT JOIN seller_profiles sp ON p.seller_id = sp.user_id 
       WHERE p.id = $1`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    res.json({ product: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// CREATE NEW PRODUCT (SELLER ONLY)
router.post('/', authenticateUser, requireRole('seller'), validateProductInput, async (req, res, next) => {
  const { 
    name, category = 'Vegetables', description = '', price, price_unit = 'kg', 
    quantity, quantity_unit = 'kg', grade = 'Standard', available_date, location, latitude, longitude, image_url 
  } = req.body;

  const id = 'P' + Date.now();
  const numPrice = Number(price);
  const numQty = Number(quantity);
  const status = numQty > 0 ? 'active' : 'out_of_stock';
  const locStr = location || 'Location pending';

  try {
    const result = await db.query(
      `INSERT INTO products 
      (id, seller_id, name, category, description, price, price_unit, quantity, quantity_unit, grade, status, available_date, location, latitude, longitude, image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [id, req.user.id, name.trim(), category, description.trim(), numPrice, price_unit, numQty, quantity_unit, grade, status, available_date || null, locStr, latitude || null, longitude || null, image_url || null]
    );

    const product = result.rows[0];
    res.status(201).json({
      message: 'Product published successfully.',
      product: {
        ...product,
        sellerName: req.user.name,
        sellerContact: req.user.contact
      }
    });
  } catch (err) {
    next(err);
  }
});

// UPDATE PRODUCT (SELLER OWNER ONLY)
router.put('/:id', authenticateUser, requireRole('seller'), requireProductOwnership, validateProductInput, async (req, res, next) => {
  const { name, category, description, price, quantity, grade, available_date, location, image_url } = req.body;
  const numPrice = Number(price);
  const numQty = Number(quantity);
  const status = numQty > 0 ? 'active' : 'out_of_stock';

  try {
    const result = await db.query(
      `UPDATE products 
       SET name = $1, category = $2, description = $3, price = $4, quantity = $5, grade = $6, available_date = $7, location = $8, status = $9, image_url = COALESCE($10, image_url), updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 RETURNING *`,
      [name.trim(), category, description, numPrice, numQty, grade, available_date || null, location, status, image_url || null, req.params.id]
    );

    res.json({
      message: 'Product updated successfully.',
      product: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

// DELETE / DEACTIVATE PRODUCT (SELLER OWNER ONLY)
router.delete('/:id', authenticateUser, requireRole('seller'), requireProductOwnership, async (req, res, next) => {
  try {
    await db.query(
      'UPDATE products SET status = \'inactive\', updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Product removed successfully.', productId: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
