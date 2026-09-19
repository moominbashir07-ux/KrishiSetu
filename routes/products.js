const express = require('express');
const db = require('../db/db');
const { authenticateUser, requireRole, requireProductOwnership } = require('../middleware/auth');
const { validateProductInput } = require('../middleware/validate');
const { ProductQualityService } = require('../services/quality/productQualityService');

const router = express.Router();
const qualityService = new ProductQualityService();

// GET ALL ACTIVE PRODUCTS (Optional filtering by category, sellerId, or excludeSellerId)
router.get('/', async (req, res, next) => {
  const { sellerId, excludeSellerId, category } = req.query;
  try {
    let sql = `SELECT p.*, u.name as "sellerName", u.contact as "sellerContact", COALESCE(sp.verification_status, 'pending') as "sellerVerificationStatus" 
               FROM products p 
               JOIN users u ON p.seller_id = u.id 
               LEFT JOIN seller_profiles sp ON p.seller_id = sp.user_id 
               WHERE p.status != 'inactive'`;
    const params = [];

    if (excludeSellerId) {
      params.push(excludeSellerId);
      sql += ` AND p.seller_id != $${params.length}`;
    } else if (sellerId) {
      params.push(sellerId);
      sql += ` AND p.seller_id = $${params.length}`;
    }

    if (category && category !== 'All' && category !== 'All produce') {
      params.push(category);
      sql += ` AND LOWER(p.category) = LOWER($${params.length})`;
    }

    sql += ' ORDER BY p.created_at DESC';

    const result = await db.query(sql, params);
    const enrichedProducts = (result.rows || []).map(p => qualityService.formatProductWithQuality(p));
    res.json({ products: enrichedProducts });
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

    res.json({ product: qualityService.formatProductWithQuality(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// CREATE NEW PRODUCT (SELLER ONLY)
router.post('/', authenticateUser, requireRole('seller'), validateProductInput, async (req, res, next) => {
  const { 
    name, category = 'Vegetables', description = '', price, price_unit = 'kg', 
    quantity, quantity_unit = 'kg', grade = 'Standard', available_date, location, latitude, longitude, image_url,
    sellerDeclaredGrade, gradeCriteria, qualityEvidence, verificationType, certificationDocKey
  } = req.body;

  let qualityMeta = null;
  if (sellerDeclaredGrade || qualityEvidence || verificationType || ['Grade A', 'Grade B', 'Grade C', 'Ungraded'].includes(grade)) {
    try {
      qualityMeta = qualityService.validateQualityDeclaration({
        sellerDeclaredGrade: sellerDeclaredGrade || grade,
        gradeCriteria,
        qualityEvidence: (qualityEvidence && (Array.isArray(qualityEvidence) ? qualityEvidence.length > 0 : true)) ? qualityEvidence : (image_url ? [image_url] : []),
        verificationType,
        certificationDocKey
      });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code });
      }
      return next(err);
    }
  }

  const id = 'P' + Date.now();
  const numPrice = Number(price);
  const numQty = Number(quantity);
  const status = numQty > 0 ? 'active' : 'out_of_stock';
  const locStr = location || 'Location pending';
  const effectiveGrade = qualityMeta ? qualityMeta.declaredGrade : grade;

  try {
    const result = await db.query(
      `INSERT INTO products 
      (id, seller_id, name, category, description, price, price_unit, quantity, quantity_unit, grade, status, available_date, location, latitude, longitude, image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [id, req.user.id, name.trim(), category, description.trim(), numPrice, price_unit, numQty, quantity_unit, effectiveGrade, status, available_date || null, locStr, latitude || null, longitude || null, image_url || null]
    );

    const product = result.rows[0];
    if (qualityMeta) {
      product.seller_declared_grade = qualityMeta.declaredGrade;
      product.grade_criteria = qualityMeta.gradeCriteria;
      product.quality_evidence = qualityMeta.qualityEvidence;
      product.verification_type = qualityMeta.verificationType;
      product.verification_status = qualityMeta.verificationStatus;
      product.is_certified = qualityMeta.isCertified;
    }

    const formattedProduct = qualityService.formatProductWithQuality({
      ...product,
      sellerName: req.user.name,
      sellerContact: req.user.contact
    });

    res.status(201).json({
      message: 'Product published successfully.',
      product: formattedProduct
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
