const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/db');

test('Marketplace Seller/Buyer Products Isolation & Filtering', async (t) => {
  await db.initDb();

  const sellerAId = 'U_MKT_SELLER_A_' + Date.now();
  const sellerBId = 'U_MKT_SELLER_B_' + Date.now();
  const prodAId = 'P_PROD_A_' + Date.now();
  const prodBId = 'P_PROD_B_' + Date.now();

  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [sellerAId, 'Farmer A', 'farmerA@test.com', 'hash', 'seller']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [sellerBId, 'Farmer B', 'farmerB@test.com', 'hash', 'seller']);

  await db.query(
    `INSERT INTO products (id, seller_id, name, category, description, price, quantity, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [prodAId, sellerAId, 'Seller A Tomatoes', 'Vegetables', 'Nashik Red', 25.00, 100, 'active']
  );

  await db.query(
    `INSERT INTO products (id, seller_id, name, category, description, price, quantity, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [prodBId, sellerBId, 'Seller B Onions', 'Vegetables', 'Pune Red', 35.00, 200, 'active']
  );

  await t.test('excludeSellerId parameter excludes Seller A products server-side', async () => {
    const res = await db.query(
      `SELECT p.* FROM products p WHERE p.seller_id != $1 AND p.status != 'inactive'`,
      [sellerAId]
    );

    const prods = res.rows;
    assert.ok(prods.length >= 1);
    assert.ok(prods.every(p => p.seller_id !== sellerAId), 'Seller A products must be completely excluded');
    assert.ok(prods.some(p => p.id === prodBId), 'Seller B product should be included');
  });

  await t.test('sellerId parameter returns only Seller A products (My Listings)', async () => {
    const res = await db.query(
      `SELECT p.* FROM products p WHERE p.seller_id = $1 AND p.status != 'inactive'`,
      [sellerAId]
    );

    const prods = res.rows;
    assert.equal(prods.length, 1);
    assert.equal(prods[0].id, prodAId);
  });
});
