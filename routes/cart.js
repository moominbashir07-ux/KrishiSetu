const express = require('express');
const db = require('../db/db');
const { authenticateUser, requireRole } = require('../middleware/auth');
const { validateCartItemInput } = require('../middleware/validate');

const router = express.Router();

// Helper to get or create cart ID for customer
async function getOrCreateCartId(customerId) {
  let cartResult = await db.query('SELECT id FROM carts WHERE customer_id = $1', [customerId]);
  if (cartResult.rows.length === 0) {
    const cartId = 'CART_' + customerId;
    await db.query('INSERT INTO carts (id, customer_id) VALUES ($1, $2)', [cartId, customerId]);
    return cartId;
  }
  return cartResult.rows[0].id;
}

// GET CUSTOMER CART
router.get('/', authenticateUser, requireRole('customer'), async (req, res, next) => {
  try {
    const cartId = await getOrCreateCartId(req.user.id);
    const itemsResult = await db.query(
      `SELECT ci.id, ci.cart_id, ci.product_id, ci.quantity, p.name as product_name, p.price as unit_price, p.seller_id, p.image_url,
              (ci.quantity * p.price) as subtotal
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.cart_id = $1`,
      [cartId]
    );

    const items = itemsResult.rows;
    const subtotal = items.reduce((sum, item) => sum + Number(item.subtotal), 0);
    const totalQty = items.reduce((sum, item) => sum + Number(item.quantity), 0);
    const isBulk = subtotal >= 5000 || totalQty >= 100;
    const platformFeeRate = isBulk ? 0.005 : 0.02;
    const platformFee = Math.round(subtotal * platformFeeRate * 100) / 100;
    const totalAmount = Math.round((subtotal + platformFee) * 100) / 100;

    res.json({
      cartId,
      items,
      subtotal,
      isBulk,
      platformFeeRate,
      platformFee,
      totalAmount
    });
  } catch (err) {
    next(err);
  }
});

// ADD OR UPDATE ITEM IN CART
router.post('/items', authenticateUser, requireRole('customer'), validateCartItemInput, async (req, res, next) => {
  const { productId, quantity } = req.body;
  const numQty = Number(quantity);

  try {
    // Validate product exists and has stock
    const productResult = await db.query('SELECT id, name, price, quantity, status FROM products WHERE id = $1', [productId]);
    if (!productResult.rows.length || productResult.rows[0].status === 'inactive') {
      return res.status(404).json({ error: 'Product not found or unavailable.' });
    }

    const product = productResult.rows[0];
    if (numQty > Number(product.quantity)) {
      return res.status(400).json({ 
        error: `Insufficient stock available. Only ${product.quantity} kg in stock.` 
      });
    }

    const cartId = await getOrCreateCartId(req.user.id);
    const itemId = 'CI_' + Date.now() + Math.random().toString(36).substring(2, 5);

    await db.query(
      `INSERT INTO cart_items (id, cart_id, product_id, quantity)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = CURRENT_TIMESTAMP`,
      [itemId, cartId, productId, numQty]
    );

    res.status(201).json({ message: 'Item added to cart successfully.', cartId });
  } catch (err) {
    next(err);
  }
});

// UPDATE CART ITEM QUANTITY (ENFORCE CART IDOR / BOLA PROTECTION)
router.put('/items/:id', authenticateUser, requireRole('customer'), async (req, res, next) => {
  const { quantity } = req.body;
  const numQty = Number(quantity);

  if (!Number.isFinite(numQty) || numQty <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive number.' });
  }

  try {
    const cartId = await getOrCreateCartId(req.user.id);
    const result = await db.query(
      'UPDATE cart_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND cart_id = $3',
      [numQty, req.params.id, cartId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Cart item not found in your shopping cart.' });
    }

    res.json({ message: 'Cart item updated.' });
  } catch (err) {
    next(err);
  }
});

// REMOVE CART ITEM (ENFORCE CART IDOR / BOLA PROTECTION)
router.delete('/items/:id', authenticateUser, requireRole('customer'), async (req, res, next) => {
  try {
    const cartId = await getOrCreateCartId(req.user.id);
    const result = await db.query('DELETE FROM cart_items WHERE id = $1 AND cart_id = $2', [req.params.id, cartId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Cart item not found in your shopping cart.' });
    }

    res.json({ message: 'Cart item removed.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
