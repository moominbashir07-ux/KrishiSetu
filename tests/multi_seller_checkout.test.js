const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/db');

test('Multi-Seller Checkout, Payment Options & Notifications', async (t) => {
  await db.initDb();

  const buyerId = 'U_BUYER_PAY_' + Date.now();
  const sellerAId = 'U_SELL_PAY_A_' + Date.now();
  const sellerBId = 'U_SELL_PAY_B_' + Date.now();

  const prodAId = 'P_PAY_A_' + Date.now();
  const prodBId = 'P_PAY_B_' + Date.now();
  const cartId = 'CART_' + buyerId;

  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [buyerId, 'Customer Momin', 'customer_pay@test.com', 'hash', 'customer']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [sellerAId, 'Seller A Farm', 'sellerA_pay@test.com', 'hash', 'seller']);
  await db.query('INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [sellerBId, 'Seller B Farm', 'sellerB_pay@test.com', 'hash', 'seller']);

  await db.query(
    `INSERT INTO products (id, seller_id, name, category, description, price, quantity, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [prodAId, sellerAId, 'Seller A Wheat', 'Grains', 'Pure Wheat', 40.00, 500, 'active']
  );

  await db.query(
    `INSERT INTO products (id, seller_id, name, category, description, price, quantity, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [prodBId, sellerBId, 'Seller B Rice', 'Grains', 'Basmati Rice', 90.00, 300, 'active']
  );

  // Set up cart with items from both Seller A and Seller B
  await db.query('INSERT INTO carts (id, customer_id) VALUES ($1, $2)', [cartId, buyerId]);
  await db.query('INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES ($1, $2, $3, $4)', ['CI_1_' + Date.now(), cartId, prodAId, 10]);
  await db.query('INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES ($1, $2, $3, $4)', ['CI_2_' + Date.now(), cartId, prodBId, 5]);

  await t.test('creates 2 separate order records for multi-seller cart checkout with payment_method upi_qr', async () => {
    // Process multi-seller checkout logic
    const createdOrders = await db.withTransaction(async (client) => {
      const itemsResult = await client.query('SELECT product_id, quantity FROM cart_items WHERE cart_id = $1', [cartId]);
      const items = itemsResult.rows;

      const sellerGroups = {};
      for (const item of items) {
        const prodRes = await client.query('SELECT id, seller_id, name, price, quantity FROM products WHERE id = $1', [item.product_id]);
        const prod = prodRes.rows[0];
        if (!sellerGroups[prod.seller_id]) sellerGroups[prod.seller_id] = [];
        sellerGroups[prod.seller_id].push({ prod, qty: Number(item.quantity), subtotal: Number(item.quantity) * Number(prod.price) });
      }

      const orderNums = [];
      for (const [sId, sItems] of Object.entries(sellerGroups)) {
        const orderId = 'ORD_MS_' + Date.now() + Math.random().toString(36).substring(2, 5);
        const orderNumber = 'KS-2026-TEST-' + Math.floor(Math.random() * 9000);
        const total = sItems.reduce((sum, i) => sum + i.subtotal, 0);

        await client.query(
          `INSERT INTO orders (id, order_number, customer_id, seller_id, status, total_amount, payment_method, payment_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [orderId, orderNumber, buyerId, sId, 'Order Placed', total, 'upi_qr', 'submitted']
        );

        // Dispatch notification to Seller
        await client.query(
          `INSERT INTO notifications (id, user_id, type, title, message, read, order_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          ['NOTIF_' + Date.now() + Math.random().toString(36).substring(2, 5), sId, 'new_order', `🔔 New Order #${orderNumber}`, `New order received`, false, orderId]
        );

        orderNums.push(orderNumber);
      }
      return orderNums;
    });

    assert.equal(createdOrders.length, 2, 'Should create 2 distinct order records for 2 sellers');

    // Check Seller A order
    const resA = await db.query('SELECT * FROM orders WHERE seller_id = $1 AND customer_id = $2', [sellerAId, buyerId]);
    assert.equal(resA.rows.length, 1);
    assert.equal(resA.rows[0].payment_method, 'upi_qr');
    assert.equal(resA.rows[0].payment_status, 'submitted');

    // Check Seller B order
    const resB = await db.query('SELECT * FROM orders WHERE seller_id = $1 AND customer_id = $2', [sellerBId, buyerId]);
    assert.equal(resB.rows.length, 1);

    // Verify notifications isolation
    const notifA = await db.query('SELECT * FROM notifications WHERE user_id = $1', [sellerAId]);
    assert.equal(notifA.rows.length, 1);
    assert.equal(notifA.rows[0].user_id, sellerAId);

    const notifB = await db.query('SELECT * FROM notifications WHERE user_id = $1', [sellerBId]);
    assert.equal(notifB.rows.length, 1);
    assert.equal(notifB.rows[0].user_id, sellerBId);
  });
});
