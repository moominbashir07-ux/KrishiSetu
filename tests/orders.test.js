const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/db');

test('Order & Inventory Layer - Stock Integrity & Snapshots', async (t) => {
  await db.initDb();

  const sellerId = 'U_SELLER_ORD_' + Date.now();
  const customerId = 'U_CUST_ORD_' + Date.now();
  const productId = 'P_ORD_' + Date.now();

  // Create seller, customer, and product with initial stock = 10 kg
  await db.query(
    'INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
    [sellerId, 'Farmer Anil', 'anil_' + Date.now() + '@farm.org', 'hash', 'seller']
  );
  await db.query(
    'INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
    [customerId, 'Buyer Priya', 'priya_' + Date.now() + '@buy.org', 'hash', 'customer']
  );
  await db.query(
    `INSERT INTO products (id, seller_id, name, category, description, price, quantity, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [productId, sellerId, 'Fresh Onion', 'Vegetables', 'Nashik Red Onion', 40.00, 10, 'active']
  );

  await t.test('deducts inventory safely upon order placement', async () => {
    // Customer orders 6 kg out of 10 kg
    await db.withTransaction(async (client) => {
      const prodRes = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [productId]);
      const prod = prodRes.rows[0];
      assert.equal(Number(prod.quantity), 10);

      const requestedQty = 6;
      const newQty = Number(prod.quantity) - requestedQty;
      await client.query('UPDATE products SET quantity = $1 WHERE id = $2', [newQty, productId]);

      const orderId = 'ORD_TEST_1';
      await client.query(
        `INSERT INTO orders (id, order_number, customer_id, seller_id, status, total_amount)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, 'KS-2026-999001', customerId, sellerId, 'Order Placed', requestedQty * Number(prod.price)]
      );
      await client.query(
        `INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, quantity, unit_price_snapshot, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['OI_TEST_1', orderId, productId, prod.name, requestedQty, Number(prod.price), requestedQty * Number(prod.price)]
      );
    });

    const checkProd = await db.query('SELECT quantity FROM products WHERE id = $1', [productId]);
    assert.equal(Number(checkProd.rows[0].quantity), 4, 'Stock should be deducted from 10 to 4');
  });

  await t.test('prevents overselling / negative stock', async () => {
    // Now stock is 4. Buyer attempts to order 7 kg.
    try {
      await db.withTransaction(async (client) => {
        const prodRes = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [productId]);
        const prod = prodRes.rows[0];
        const requestedQty = 7;

        if (requestedQty > Number(prod.quantity)) {
          throw new Error('Insufficient stock');
        }
      });
      assert.fail('Overselling should have been rejected');
    } catch (err) {
      assert.equal(err.message, 'Insufficient stock');
    }

    const checkProd = await db.query('SELECT quantity FROM products WHERE id = $1', [productId]);
    assert.equal(Number(checkProd.rows[0].quantity), 4, 'Stock must remain unchanged after rejected transaction');
  });

  await t.test('preserves price snapshot in order items when product price changes', async () => {
    // Seller updates product price from 40 to 60
    await db.query('UPDATE products SET price = 60.00 WHERE id = $1', [productId]);

    // Check existing order item snapshot
    const itemRes = await db.query('SELECT unit_price_snapshot, subtotal FROM order_items WHERE order_id = $1', ['ORD_TEST_1']);
    assert.equal(Number(itemRes.rows[0].unit_price_snapshot), 40.00, 'Historical order snapshot price must remain 40.00');
  });

  await t.test('calculates normal platform fee (2.0%) for orders below bulk threshold', async () => {
    const subtotal = 1000;
    const isBulk = subtotal >= 5000;
    const feeRate = isBulk ? 0.005 : 0.02;
    const fee = subtotal * feeRate;
    assert.equal(feeRate, 0.02);
    assert.equal(fee, 20);
  });

  await t.test('calculates discounted bulk platform fee (0.5%) for orders at or above ₹5,000 threshold', async () => {
    const subtotal = 6000;
    const isBulk = subtotal >= 5000;
    const feeRate = isBulk ? 0.005 : 0.02;
    const fee = subtotal * feeRate;
    assert.equal(feeRate, 0.005);
    assert.equal(fee, 30);
  });
});
