const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const db = require('../db/db');
const { generateToken } = require('../middleware/auth');
const reviewsRouter = require('../routes/reviews');

function createReviewsTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/reviews', reviewsRouter);
  return app;
}

test('KrishiSetu Phase 2 — Reviews Integrity and Quality Assurance Suite', async (t) => {
  await db.initDb();

  const buyerAId = 'U_BUYER_A_' + Date.now();
  const buyerBId = 'U_BUYER_B_' + Date.now();
  const sellerId = 'U_SELLER_' + Date.now();
  const adminId = 'U_ADMIN_' + Date.now();

  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [buyerAId, 'Buyer Alice', 'alice@test.com', 'hash', 'customer']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [buyerBId, 'Buyer Bob', 'bob@test.com', 'hash', 'customer']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [sellerId, 'Farmer Dave', 'dave@test.com', 'hash', 'seller']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [adminId, 'Admin Mod', 'admin@test.com', 'hash', 'admin']);

  const buyerAToken = generateToken({ id: buyerAId, name: 'Buyer Alice', email: 'alice@test.com', role: 'customer' });
  const buyerBToken = generateToken({ id: buyerBId, name: 'Buyer Bob', email: 'bob@test.com', role: 'customer' });
  const sellerToken = generateToken({ id: sellerId, name: 'Farmer Dave', email: 'dave@test.com', role: 'seller' });
  const adminToken = generateToken({ id: adminId, name: 'Admin Mod', email: 'admin@test.com', role: 'admin' });

  const productId = 'PROD_REV_' + Date.now();
  await db.query(
    `INSERT INTO products (id, seller_id, name, category, description, price, quantity, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [productId, sellerId, 'Organic Shimla Apples', 'Fruits', 'Fresh crunchy apples', 150.00, 100, 'active']
  );

  const orderAId = 'ORD_REV_A_' + Date.now();
  await db.query(
    `INSERT INTO orders (id, order_number, customer_id, seller_id, status, total_amount, platform_fee, payment_method, payment_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [orderAId, 'ORD_A_101', buyerAId, sellerId, 'Completed', 300.00, 6.00, 'cod', 'cod']
  );

  await db.query(
    `INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, quantity, unit_price_snapshot, subtotal)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    ['OI_' + Date.now(), orderAId, productId, 'Organic Shimla Apples', 2, 150.00, 300.00]
  );

  let server;
  let baseUrl;
  let createdReviewId;

  await t.test('setup server listener', async () => {
    const app = createReviewsTestApp();
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  await t.test('1. Unauthenticated user cannot submit review (401)', async () => {
    const res = await fetch(`${baseUrl}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, orderId: orderAId, rating: 5, comment: 'Great product' })
    });
    assert.equal(res.status, 401);
  });

  await t.test('2. Buyer cannot review another buyer\'s order (403)', async () => {
    const res = await fetch(`${baseUrl}/api/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${buyerBToken}`
      },
      body: JSON.stringify({ productId, orderId: orderAId, rating: 5, comment: 'Not my order!' })
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.ok(data.error.includes('purchased') || data.error.includes('verified'));
  });

  await t.test('3. Buyer cannot review a product not contained in the order (403)', async () => {
    const unpurchasedProdId = 'PROD_UNPURCHASED_' + Date.now();
    await db.query(
      `INSERT INTO products (id, seller_id, name, category, description, price, quantity, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [unpurchasedProdId, sellerId, 'Unpurchased Mangoes', 'Fruits', 'Desc', 200.00, 50, 'active']
    );

    const res = await fetch(`${baseUrl}/api/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${buyerAToken}`
      },
      body: JSON.stringify({ productId: unpurchasedProdId, orderId: orderAId, rating: 5, comment: 'Did not buy this' })
    });
    assert.equal(res.status, 403);
  });

  await t.test('4. Rejects invalid rating bounds (<1 or >5 or decimal) with 400', async () => {
    for (const invalidRating of [0, 6, -1, 3.5, 'five', null]) {
      const res = await fetch(`${baseUrl}/api/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${buyerAToken}`
        },
        body: JSON.stringify({ productId, orderId: orderAId, rating: invalidRating, comment: 'Apples were sweet' })
      });
      assert.equal(res.status, 400, `Expected 400 for rating ${invalidRating}`);
    }
  });

  await t.test('5. Rejects short (<5 chars) or empty review comments with 400', async () => {
    const res = await fetch(`${baseUrl}/api/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${buyerAToken}`
      },
      body: JSON.stringify({ productId, orderId: orderAId, rating: 5, comment: 'good' })
    });
    assert.equal(res.status, 400);
  });

  await t.test('6. Rejects malformed product ID or order ID with 400', async () => {
    const res = await fetch(`${baseUrl}/api/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${buyerAToken}`
      },
      body: JSON.stringify({ productId: '', orderId: orderAId, rating: 5, comment: 'Fresh and crisp apples' })
    });
    assert.equal(res.status, 400);
  });

  await t.test('7. Authenticated buyer can successfully submit verified review (201)', async () => {
    const res = await fetch(`${baseUrl}/api/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${buyerAToken}`
      },
      body: JSON.stringify({
        productId,
        orderId: orderAId,
        rating: 5,
        comment: 'Super fresh, crunchy apples direct from farm!'
      })
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.review);
    assert.equal(data.review.rating, 5);
    createdReviewId = data.review.id;
    assert.ok(createdReviewId);
  });

  await t.test('8. Duplicate review for same order and product upserts seamlessly without duplication', async () => {
    const res = await fetch(`${baseUrl}/api/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${buyerAToken}`
      },
      body: JSON.stringify({
        productId,
        orderId: orderAId,
        rating: 4,
        comment: 'Updated review: Mostly great apples, one had minor blemish.'
      })
    });
    assert.equal(res.status, 201);

    const getRes = await fetch(`${baseUrl}/api/reviews/products/${productId}`);
    const getData = await getRes.json();
    assert.equal(getData.reviews.length, 1);
    assert.equal(getData.reviews[0].rating, 4);
  });

  await t.test('9. GET /api/reviews/products/:productId retrieves verified reviews with verifiedPurchase badge', async () => {
    const res = await fetch(`${baseUrl}/api/reviews/products/${productId}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.reviews));
    assert.equal(data.reviews.length, 1);
    assert.equal(data.reviews[0].verifiedPurchase, true);
    assert.equal(data.reviews[0].buyerName, 'Buyer Alice');
  });

  await t.test('10. GET /api/reviews/seller retrieves seller\'s product reviews', async () => {
    const res = await fetch(`${baseUrl}/api/reviews/seller`, {
      headers: { 'Authorization': `Bearer ${sellerToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.reviews));
    assert.equal(data.reviews.length, 1);
    assert.equal(data.reviews[0].productId, productId);
  });

  await t.test('11. Another buyer cannot delete author\'s review (403)', async () => {
    const res = await fetch(`${baseUrl}/api/reviews/${createdReviewId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${buyerBToken}` }
    });
    assert.equal(res.status, 403);
  });

  await t.test('12. Seller cannot delete buyer\'s review (403 seller isolation)', async () => {
    const res = await fetch(`${baseUrl}/api/reviews/${createdReviewId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${sellerToken}` }
    });
    assert.equal(res.status, 403);
  });

  await t.test('13. Author can delete their own review (200)', async () => {
    const res = await fetch(`${baseUrl}/api/reviews/${createdReviewId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${buyerAToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);

    const checkRes = await fetch(`${baseUrl}/api/reviews/products/${productId}`);
    const checkData = await checkRes.json();
    assert.equal(checkData.reviews.length, 0);
  });

  await t.test('14. Admin can moderate and delete reviews (200)', async () => {
    // Recreate a review for admin deletion
    const postRes = await fetch(`${baseUrl}/api/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${buyerAToken}`
      },
      body: JSON.stringify({
        productId,
        orderId: orderAId,
        rating: 5,
        comment: 'Re-reviewed after replacement, delicious!'
      })
    });
    assert.equal(postRes.status, 201);
    const postData = await postRes.json();
    const newRevId = postData.review.id;

    // Admin deletes it
    const delRes = await fetch(`${baseUrl}/api/reviews/${newRevId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(delRes.status, 200);
    const delData = await delRes.json();
    assert.equal(delData.success, true);
  });

  await t.test('teardown server listener', async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });
});
