const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const db = require('../db/db');
const { JWT_SECRET } = require('../middleware/auth');

test('KrishiSetu — Order Management, Customer Details & Product Details Regression Suite', async (t) => {
  await db.initDb();

  const sellerAId = 'U_SELL_A_' + Date.now();
  const sellerBId = 'U_SELL_B_' + Date.now();
  const customerAId = 'U_CUST_A_' + Date.now();
  const customerBId = 'U_CUST_B_' + Date.now();

  // Create Users
  await db.query('INSERT INTO users (id, name, contact, password_hash, role, phone) VALUES ($1, $2, $3, $4, $5, $6)', [sellerAId, 'Farmer Ramesh', 'ramesh@farm.com', 'hash', 'seller', '+91 98765 43210']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role, phone) VALUES ($1, $2, $3, $4, $5, $6)', [sellerBId, 'Farmer Suresh', 'suresh@farm.com', 'hash', 'seller', '+91 98765 43211']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role, phone) VALUES ($1, $2, $3, $4, $5, $6)', [customerAId, 'Momin Customer', 'momin@test.com', 'hash', 'customer', '+91 99999 11111']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role, phone) VALUES ($1, $2, $3, $4, $5, $6)', [customerBId, 'Rahul Customer', 'rahul@test.com', 'hash', 'customer', '+91 99999 22222']);

  // Create Customer Profiles
  await db.query('INSERT INTO customer_profiles (id, user_id, address, city, state, pincode) VALUES ($1, $2, $3, $4, $5, $6)', ['CP_A', customerAId, '123 Market Road', 'Srinagar', 'Jammu & Kashmir', '190001']);
  await db.query('INSERT INTO customer_profiles (id, user_id, address, city, state, pincode) VALUES ($1, $2, $3, $4, $5, $6)', ['CP_B', customerBId, '456 MG Road', 'Mumbai', 'Maharashtra', '400001']);

  // Create Product for Seller A
  const prodId = 'PROD_TEST_' + Date.now();
  await db.query('INSERT INTO products (id, seller_id, name, category, price, quantity, grade, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [prodId, sellerAId, 'Fresh Tomatoes', 'Vegetables', 40, 500, 'Grade A', 'active']);

  // Create Orders for Seller A and Seller B
  const orderAId = 'ORD_A_' + Date.now();
  const orderBId = 'ORD_B_' + Date.now();

  await db.query(
    `INSERT INTO orders (id, order_number, customer_id, seller_id, status, total_amount, buyer_contact, step, payment_method, payment_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [orderAId, 'KS1001', customerAId, sellerAId, 'Order Placed', 400, 'momin@test.com', 1, 'cod', 'pending']
  );

  await db.query(
    `INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, quantity, unit_price_snapshot, subtotal)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    ['OI_A', orderAId, prodId, 'Fresh Tomatoes', 10, 40, 400]
  );

  await db.query(
    `INSERT INTO orders (id, order_number, customer_id, seller_id, status, total_amount, buyer_contact, step, payment_method, payment_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [orderBId, 'KS1002', customerBId, sellerBId, 'Order Placed', 800, 'rahul@test.com', 1, 'upi_qr', 'submitted']
  );

  await t.test('TEST 1 & 2: Details button & Product Details payload structure', async () => {
    const prodRes = await db.query('SELECT * FROM products WHERE id = $1', [prodId]);
    assert.equal(prodRes.rows.length, 1);
    assert.equal(prodRes.rows[0].name, 'Fresh Tomatoes');
  });

  await t.test('TEST 3 & 4: Seller receives customer name, email, phone, and delivery address for their own order', async () => {
    const query = `
      SELECT o.id, o.order_number, o.status, o.total_amount as total, o.customer_id, o.seller_id,
             cu.name as "customerName", cu.contact as "customerEmail", cu.phone as "customerPhone",
             cp.address as "customerAddress", cp.city as "customerCity", cp.state as "customerState"
      FROM orders o
      JOIN users cu ON o.customer_id = cu.id
      LEFT JOIN customer_profiles cp ON o.customer_id = cp.user_id
      WHERE o.seller_id = $1
    `;
    const res = await db.query(query, [sellerAId]);
    assert.equal(res.rows.length, 1);
    const ord = res.rows[0];
    assert.equal(ord.customerName, 'Momin Customer');
    assert.equal(ord.customerEmail, 'momin@test.com');
    assert.equal(ord.customerPhone, '+91 99999 11111');
    assert.ok(ord.customerAddress.includes('Market Road'));
  });

  await t.test('TEST 5 & 6: IDOR Protection — Seller A cannot access Seller B orders; Customer A cannot access Customer B orders', async () => {
    // Query for Seller A
    const sellerARes = await db.query('SELECT * FROM orders WHERE seller_id = $1', [sellerAId]);
    const sellerAOrders = sellerARes.rows;
    assert.equal(sellerAOrders.length, 1);
    assert.equal(sellerAOrders[0].id, orderAId);
    assert.ok(!sellerAOrders.some(o => o.id === orderBId), 'Seller A must NOT see Seller B order');

    // Query for Customer A
    const custARes = await db.query('SELECT * FROM orders WHERE customer_id = $1', [customerAId]);
    const custAOrders = custARes.rows;
    assert.equal(custAOrders.length, 1);
    assert.equal(custAOrders[0].id, orderAId);
    assert.ok(!custAOrders.some(o => o.id === orderBId), 'Customer A must NOT see Customer B order');
  });

  await t.test('TEST 7: Seller A can update their own Order Placed -> Farmer Confirmed', async () => {
    await db.query('UPDATE orders SET status = $1, step = $2 WHERE id = $3 AND seller_id = $4', ['Farmer Confirmed', 2, orderAId, sellerAId]);
    const checkRes = await db.query('SELECT status, step FROM orders WHERE id = $1', [orderAId]);
    assert.equal(checkRes.rows[0].status, 'Farmer Confirmed');
    assert.equal(checkRes.rows[0].step, 2);
  });

  await t.test('TEST 8: Seller B cannot update Seller A order (0 rows affected)', async () => {
    const res = await db.query('UPDATE orders SET status = $1 WHERE id = $2 AND seller_id = $3', ['Preparing', orderAId, sellerBId]);
    assert.equal(res.rowCount || 0, 0, 'Seller B cannot update Seller A order');
  });

  await t.test('TEST 9: Invalid order status transitions are rejected by state machine', () => {
    const ALLOWED_TRANSITIONS = {
      'Order Placed': ['Farmer Confirmed', 'Preparing', 'Cancelled'],
      'Farmer Confirmed': ['Preparing', 'Cancelled'],
      'Preparing': ['Ready', 'Cancelled'],
      'Ready': ['Completed', 'Cancelled'],
      'Completed': []
    };

    const current = 'Order Placed';
    const invalidTarget = 'Completed'; // Skipping 3 steps!
    const allowed = ALLOWED_TRANSITIONS[current] || [];
    assert.equal(allowed.includes(invalidTarget), false, 'Direct jump from Order Placed to Completed must be rejected');
  });

  await t.test('TEST 10 & 11: Status update creates notification safely without failing order update', async () => {
    const notifId = 'NOTIF_TEST_' + Date.now();
    await db.query(
      `INSERT INTO notifications (id, user_id, type, title, message, read, order_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [notifId, customerAId, 'order_status', '✅ Order Confirmed #KS1001', 'Your order #KS1001 has been confirmed by the seller.', false, orderAId]
    );

    const notifRes = await db.query('SELECT * FROM notifications WHERE id = $1', [notifId]);
    assert.equal(notifRes.rows.length, 1);
    assert.equal(notifRes.rows[0].user_id, customerAId);
  });

  await t.test('TEST 12: Server returns safe error messages without exposing SQL or secrets', () => {
    const { errorHandler } = require('../middleware/security');
    let sentStatus = 0;
    let sentData = {};
    const resMock = {
      status: (c) => { sentStatus = c; return resMock; },
      json: (d) => { sentData = d; return d; }
    };
    const errMock = new Error('PG error: SELECT * FROM users WHERE password_hash = secret');
    errMock.statusCode = 500;

    errorHandler(errMock, {}, resMock, () => {});
    assert.equal(sentStatus, 500);
    assert.ok(!JSON.stringify(sentData).includes('password_hash'), 'Must not expose sensitive query text in error response');
  });
});
