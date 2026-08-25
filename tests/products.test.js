const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/db');

test('Product Layer - Product CRUD & Ownership', async (t) => {
  await db.initDb();

  const sellerId = 'U_SELLER_' + Date.now();
  const productId = 'P_TEST_' + Date.now();

  await db.query(
    'INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
    [sellerId, 'Suresh Farmer', 'suresh_' + Date.now() + '@farm.org', 'hash', 'seller']
  );

  await t.test('creates product associated with seller', async () => {
    const res = await db.query(
      `INSERT INTO products 
       (id, seller_id, name, category, description, price, quantity, grade, status, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [productId, sellerId, 'Fresh Tomato', 'Vegetables', 'Organic tomatoes', 35.00, 100, 'Grade A', 'active', 'Nashik']
    );

    assert.equal(res.rows.length, 1);
    const prod = res.rows[0];
    assert.equal(prod.name, 'Fresh Tomato');
    assert.equal(Number(prod.price), 35.00);
    assert.equal(Number(prod.quantity), 100);
    assert.equal(prod.seller_id, sellerId);
  });

  await t.test('fetches active products list', async () => {
    const res = await db.query('SELECT * FROM products WHERE status != \'inactive\'');
    assert.ok(res.rows.length > 0);
  });

  await t.test('updates product stock and detail', async () => {
    await db.query(
      'UPDATE products SET quantity = $1, price = $2 WHERE id = $3',
      [80, 38.00, productId]
    );

    const res = await db.query('SELECT * FROM products WHERE id = $1', [productId]);
    assert.equal(Number(res.rows[0].quantity), 80);
    assert.equal(Number(res.rows[0].price), 38.00);
  });
});
