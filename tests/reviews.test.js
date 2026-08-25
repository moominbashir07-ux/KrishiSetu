const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/db');

test('Verified Customer Reviews System', async (t) => {
  await db.initDb();

  const buyerId = 'U_BUYER_' + Date.now();
  const nonBuyerId = 'U_NONBUYER_' + Date.now();
  const sellerId = 'U_SELLER_' + Date.now();
  const productId = 'P_REVMONGO_' + Date.now();
  const orderId = 'ORD_' + Date.now();

  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [buyerId, 'Real Buyer', 'realbuyer@test.com', 'hash', 'customer']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [nonBuyerId, 'Fake Buyer', 'fakebuyer@test.com', 'hash', 'customer']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [sellerId, 'Farm Seller', 'farmseller@test.com', 'hash', 'seller']);

  await db.query(
    `INSERT INTO products (id, seller_id, name, category, description, price, quantity, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [productId, sellerId, 'Fresh Alphonso Mangoes', 'Fruits', 'Sweet mangoes', 120.00, 50, 'active']
  );

  await db.query(
    `INSERT INTO orders (id, order_number, customer_id, seller_id, status, total_amount)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orderId, 'ORD_NUM_1', buyerId, sellerId, 'Completed', 240.00]
  );

  await db.query(
    `INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, quantity, unit_price_snapshot, subtotal)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    ['OI_' + Date.now(), orderId, productId, 'Fresh Alphonso Mangoes', 2, 120.00, 240.00]
  );

  await t.test('creates verified review for customer with completed purchase', async () => {
    const revId = 'REV_' + Date.now();
    await db.query(
      `INSERT INTO reviews (id, product_id, buyer_id, order_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [revId, productId, buyerId, orderId, 5, 'Super fresh and delicious Alphonso mangoes!']
    );

    const res = await db.query('SELECT * FROM reviews WHERE product_id = $1', [productId]);
    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].rating, 5);
    assert.equal(res.rows[0].comment, 'Super fresh and delicious Alphonso mangoes!');
  });
});
