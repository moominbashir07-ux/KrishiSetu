/**
 * KrishiSetu 2.0 — Phase 5: Reliability, Real-Time UX, Seller Profile, Orders, Notifications & AI QA
 * Automated Test Suite
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../server');
const db = require('../db/db');
const { generateToken } = require('../middleware/auth');
const otpService = require('../services/otpService');

describe('Phase 5: Reliability, Real-Time UX, Seller Profile & Orders Suite', () => {
  let server;
  let baseUrl;
  let adminToken;
  let seller1Token;
  let seller2Token;
  let buyerToken;
  let testProductId;
  let testProduct2Id;
  const origOtpProvider = process.env.EMAIL_OTP_PROVIDER;

  before(async () => {
    process.env.EMAIL_OTP_PROVIDER = 'dev';
    await db.initDb();

    // Create test users using standard parameterized queries
    await db.query(
      'INSERT INTO users (id, name, contact, password_hash, role, phone, location) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['U_P5_SELLER1', 'Ramesh Farmer', 'ramesh.p5@farm.com', 'hash', 'seller', '9876543210', 'Nashik, Maharashtra']
    );
    await db.query(
      'INSERT INTO users (id, name, contact, password_hash, role, phone, location) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['U_P5_SELLER2', 'Suresh Farmer', 'suresh.p5@farm.com', 'hash', 'seller', '9876543211', 'Nagpur, Maharashtra']
    );
    await db.query(
      'INSERT INTO users (id, name, contact, password_hash, role, phone, location) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['U_P5_BUYER', 'Ananya Buyer', 'ananya.p5@buyer.com', 'hash', 'customer', '9876543212', 'Mumbai, Maharashtra']
    );
    await db.query(
      'INSERT INTO users (id, name, contact, password_hash, role, phone, location) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['U_P5_ADMIN', 'Super Admin', 'admin.p5@krishi.com', 'hash', 'admin', '9876543213', 'Delhi, India']
    );

    // Create seller profiles
    await db.query(
      'INSERT INTO seller_profiles (id, user_id, business_name, verification_status) VALUES ($1, $2, $3, $4)',
      ['SP_P5_1', 'U_P5_SELLER1', 'Ramesh Farmer Farm', 'verified']
    );
    await db.query(
      'INSERT INTO seller_profiles (id, user_id, business_name, verification_status) VALUES ($1, $2, $3, $4)',
      ['SP_P5_2', 'U_P5_SELLER2', 'Suresh Farmer Farm', 'verified']
    );

    adminToken = generateToken({ id: 'U_P5_ADMIN', name: 'Super Admin', role: 'admin' });
    seller1Token = generateToken({ id: 'U_P5_SELLER1', name: 'Ramesh Farmer', role: 'seller' });
    seller2Token = generateToken({ id: 'U_P5_SELLER2', name: 'Suresh Farmer', role: 'seller' });
    buyerToken = generateToken({ id: 'U_P5_BUYER', name: 'Ananya Buyer', role: 'customer' });

    // Seed products for stock depletion and review tests
    testProductId = 'PROD_P5_ONION';
    await db.query(
      'INSERT INTO products (id, seller_id, name, category, description, price, quantity, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [testProductId, 'U_P5_SELLER1', 'Organic Red Onion', 'Vegetables', 'Farm fresh red onions', 35, 50, 'active']
    );

    testProduct2Id = 'PROD_P5_ORANGE';
    await db.query(
      'INSERT INTO products (id, seller_id, name, category, description, price, quantity, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [testProduct2Id, 'U_P5_SELLER2', 'Nagpur Sweet Oranges', 'Fruits', 'Juicy Nagpur oranges', 60, 100, 'active']
    );

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    process.env.EMAIL_OTP_PROVIDER = origOtpProvider;
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers
    });
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, ok: res.ok, data };
  }

  // ---------------------------------------------------------------------------
  // 1. Password Visibility & Confirm-Password Validation
  // ---------------------------------------------------------------------------
  describe('1. Password & Registration Validation', () => {
    test('Rejects registration when confirmPassword does not match password', async () => {
      const res = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Mismatch',
          contact: 'mismatch@test.com',
          password: 'Password123!',
          confirmPassword: 'DifferentPassword456!',
          role: 'customer'
        })
      });

      assert.strictEqual(res.status, 400);
      assert.ok(res.data.error || res.data.message);
      const msg = res.data.error || res.data.message;
      assert.ok(msg.toLowerCase().includes('passwords do not match'), `Expected error message about mismatch, got: ${msg}`);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. OTP Countdown & Policy
  // ---------------------------------------------------------------------------
  describe('2. OTP Countdown & Resend Cooldown Policy', () => {
    test('OTP generation returns resendCooldownSeconds = 60 and expiresInMinutes', async () => {
      const otpRes = await otpService.generateAndSendOtp({
        contact: '9876543299',
        purpose: 'signup'
      });
      assert.strictEqual(otpRes.success, true);
      assert.strictEqual(otpRes.resendCooldownSeconds, 60);
      assert.ok(otpRes.expiresInMinutes >= 5);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Persistent Accounts & Session Rehydration
  // ---------------------------------------------------------------------------
  describe('3. Persistent Accounts & Session Rehydration', () => {
    test('GET /api/auth/me rehydrates session with valid token', async () => {
      const res = await api('/api/auth/me', {
        headers: { Authorization: `Bearer ${buyerToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.user.id, 'U_P5_BUYER');
      assert.strictEqual(res.data.user.role, 'customer');
    });

    test('GET /api/auth/me rejects invalid or expired token gracefully', async () => {
      const res = await api('/api/auth/me', {
        headers: { Authorization: 'Bearer invalid.token.signature' }
      });
      assert.strictEqual(res.status, 401);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Seller Profile & Location Accuracy
  // ---------------------------------------------------------------------------
  describe('4. Seller Profile & Location Contract', () => {
    test('GET /api/sellers/:id returns seller profile with genuine location', async () => {
      const res = await api('/api/sellers/U_P5_SELLER1');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.seller.id, 'U_P5_SELLER1');
      assert.strictEqual(res.data.seller.name, 'Ramesh Farmer');
      assert.strictEqual(res.data.seller.location, 'Nashik, Maharashtra');
    });

    test('GET /api/sellers/:id returns 404 for nonexistent seller', async () => {
      const res = await api('/api/sellers/NON_EXISTENT_SELLER_XYZ');
      assert.strictEqual(res.status, 404);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Automatic Stock Depletion & Overselling Prevention
  // ---------------------------------------------------------------------------
  describe('5. Automatic Stock Depletion & Inventory Management', () => {
    test('Placing an order transactionally decrements inventory', async () => {
      // Get initial stock
      const prodRes1 = await api(`/api/products/${testProductId}`);
      assert.strictEqual(prodRes1.status, 200);
      const initialStock = Number(prodRes1.data.product.quantity);
      assert.ok(initialStock >= 10, `Initial stock should be at least 10, got: ${initialStock}`);

      // Place order for 10 kg
      const orderRes = await api('/api/orders', {
        method: 'POST',
        headers: { Authorization: `Bearer ${buyerToken}` },
        body: JSON.stringify({
          items: [{
            product_id: testProductId,
            quantity: 10,
            price_per_unit: 35
          }],
          delivery_address: 'Flat 402, Sea View Towers, Mumbai',
          payment_method: 'UPI'
        })
      });

      assert.strictEqual(orderRes.status, 201);
      assert.ok(orderRes.data.order || (orderRes.data.orders && orderRes.data.orders[0]));

      // Verify stock was decremented
      const prodRes2 = await api(`/api/products/${testProductId}`);
      const updatedStock = Number(prodRes2.data.product.quantity);
      assert.strictEqual(updatedStock, initialStock - 10, 'Product quantity must be decremented by ordered quantity');
    });

    test('Rejects order when requested quantity exceeds available stock (overselling prevention)', async () => {
      // Try to order 99999 kg
      const orderRes = await api('/api/orders', {
        method: 'POST',
        headers: { Authorization: `Bearer ${buyerToken}` },
        body: JSON.stringify({
          items: [{
            product_id: testProductId,
            quantity: 99999,
            price_per_unit: 35
          }],
          delivery_address: 'Flat 402, Mumbai',
          payment_method: 'UPI'
        })
      });

      assert.strictEqual(orderRes.status, 400);
      const errMsg = orderRes.data.error || orderRes.data.message || '';
      assert.ok(errMsg.toLowerCase().includes('stock') || errMsg.toLowerCase().includes('insufficient'), `Expected stock error, got: ${errMsg}`);
    });

    test('Supports direct { productId, quantity } payload format with stock decrement and order items creation', async () => {
      // Get current stock
      const prodRes1 = await api(`/api/products/${testProductId}`);
      const initialStock = Number(prodRes1.data.product.quantity);

      // Place order using single direct payload format
      const orderRes = await api('/api/orders', {
        method: 'POST',
        headers: { Authorization: `Bearer ${buyerToken}` },
        body: JSON.stringify({
          productId: testProductId,
          quantity: 2,
          delivery_address: '404 Farm Lane, Nashik',
          payment_method: 'cod'
        })
      });

      assert.strictEqual(orderRes.status, 201);
      const orderData = orderRes.data.order || (orderRes.data.orders && orderRes.data.orders[0]);
      assert.ok(orderData, 'Order object must be returned in response');
      assert.strictEqual(Number(orderData.qty), 2);

      // Verify stock was decremented by 2
      const prodRes2 = await api(`/api/products/${testProductId}`);
      const updatedStock = Number(prodRes2.data.product.quantity);
      assert.strictEqual(updatedStock, initialStock - 2);
    });

    test('Rejects orders with invalid quantities (zero, negative, non-numeric)', async () => {
      const invalidQuantities = [0, -5, 'not-a-number'];
      for (const badQty of invalidQuantities) {
        const orderRes1 = await api('/api/orders', {
          method: 'POST',
          headers: { Authorization: `Bearer ${buyerToken}` },
          body: JSON.stringify({
            productId: testProductId,
            quantity: badQty,
            payment_method: 'cod'
          })
        });
        assert.strictEqual(orderRes1.status, 400, `Expected 400 for direct quantity ${badQty}`);

        const orderRes2 = await api('/api/orders', {
          method: 'POST',
          headers: { Authorization: `Bearer ${buyerToken}` },
          body: JSON.stringify({
            items: [{ productId: testProductId, quantity: badQty }],
            payment_method: 'cod'
          })
        });
        assert.strictEqual(orderRes2.status, 400, `Expected 400 for items quantity ${badQty}`);
      }
    });

    test('Prevents duplicate orders with duplicate payment transaction IDs', async () => {
      const uniqueTxn = 'TXN_P5_DUP_' + Date.now();
      const firstRes = await api('/api/orders', {
        method: 'POST',
        headers: { Authorization: `Bearer ${buyerToken}` },
        body: JSON.stringify({
          productId: testProductId,
          quantity: 1,
          payment_method: 'upi_qr',
          transaction_id: uniqueTxn
        })
      });
      assert.strictEqual(firstRes.status, 201);

      // Attempt duplicate order with same transaction ID
      const secondRes = await api('/api/orders', {
        method: 'POST',
        headers: { Authorization: `Bearer ${buyerToken}` },
        body: JSON.stringify({
          productId: testProductId,
          quantity: 1,
          payment_method: 'upi_qr',
          transaction_id: uniqueTxn
        })
      });
      assert.strictEqual(secondRes.status, 409, 'Duplicate transaction ID must be rejected with 409 Conflict');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Buyer Notifications on Order Events
  // ---------------------------------------------------------------------------
  describe('6. In-App Notifications on Order Events', () => {
    test('Buyer receives notification when order is placed and when status changes', async () => {
      // 1. Create a fresh order
      const orderRes = await api('/api/orders', {
        method: 'POST',
        headers: { Authorization: `Bearer ${buyerToken}` },
        body: JSON.stringify({
          productId: testProductId,
          quantity: 5,
          delivery_address: 'Andheri West, Mumbai',
          payment_method: 'cod'
        })
      });

      assert.strictEqual(orderRes.status, 201);
      const orderId = orderRes.data.order ? orderRes.data.order.id : orderRes.data.orders[0].id;

      // 2. Check buyer notifications - should have order_placed notification
      const notifRes1 = await api('/api/notifications', {
        headers: { Authorization: `Bearer ${buyerToken}` }
      });
      assert.strictEqual(notifRes1.status, 200);
      assert.ok(Array.isArray(notifRes1.data.notifications));
      const placedNotif = notifRes1.data.notifications.find(n => n.type === 'order_placed');
      assert.ok(placedNotif, 'Buyer should receive an order_placed notification');

      // 3. Seller updates status to Preparing
      const statusRes = await api(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${seller1Token}` },
        body: JSON.stringify({ status: 'Preparing' })
      });
      assert.strictEqual(statusRes.status, 200);

      // 4. Check buyer notifications - should have order_status_updated notification
      const notifRes2 = await api('/api/notifications', {
        headers: { Authorization: `Bearer ${buyerToken}` }
      });
      const updateNotif = notifRes2.data.notifications.find(n => 
        (n.type === 'order_status' || n.type === 'order_status_updated') &&
        (n.message.includes('prepared') || n.message.includes('Preparing') || (n.title && n.title.includes('Preparing')))
      );
      assert.ok(updateNotif, 'Buyer should receive an order_status notification when status advances');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Order Details & History Filtering
  // ---------------------------------------------------------------------------
  describe('7. Buyer Order Details & History Contract', () => {
    test('GET /api/orders returns orders with line items and status', async () => {
      const res = await api('/api/orders', {
        headers: { Authorization: `Bearer ${buyerToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.orders));
      assert.ok(res.data.orders.length > 0);
      const sample = res.data.orders[0];
      assert.ok(sample.id);
      assert.ok(sample.status);
      assert.ok(sample.items && Array.isArray(sample.items));
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Seller Reviews & IDOR Protection
  // ---------------------------------------------------------------------------
  describe('8. Seller Reviews & IDOR Protection', () => {
    test('GET /api/reviews/seller rejects unauthenticated request with 401', async () => {
      const res = await api('/api/reviews/seller');
      assert.strictEqual(res.status, 401);
    });

    test('GET /api/reviews/seller rejects customer role with 403', async () => {
      const res = await api('/api/reviews/seller', {
        headers: { Authorization: `Bearer ${buyerToken}` }
      });
      assert.strictEqual(res.status, 403);
    });

    test('POST /api/reviews allows buyer to review product, and seller receives it in reviews feed', async () => {
      // 1. Submit review as buyer (who already purchased testProductId above)
      const postReviewRes = await api('/api/reviews', {
        method: 'POST',
        headers: { Authorization: `Bearer ${buyerToken}` },
        body: JSON.stringify({
          product_id: testProductId,
          rating: 5,
          comment: 'Outstanding freshness, crisp and high quality red onions!'
        })
      });
      assert.strictEqual(postReviewRes.status, 201);
      assert.strictEqual(postReviewRes.data.review.rating, 5);

      // 2. Seller 1 fetches reviews - must contain this review
      const seller1Reviews = await api('/api/reviews/seller', {
        headers: { Authorization: `Bearer ${seller1Token}` }
      });
      assert.strictEqual(seller1Reviews.status, 200);
      assert.ok(Array.isArray(seller1Reviews.data.reviews));
      const found = seller1Reviews.data.reviews.find(r => r.productId === testProductId || r.product_id === testProductId);
      assert.ok(found, 'Seller 1 must see review for their product');
      assert.strictEqual(found.rating, 5);
      assert.strictEqual(found.comment, 'Outstanding freshness, crisp and high quality red onions!');

      // 3. IDOR Check: Seller 2 fetches reviews - must NOT see Seller 1 reviews
      const seller2Reviews = await api('/api/reviews/seller', {
        headers: { Authorization: `Bearer ${seller2Token}` }
      });
      assert.strictEqual(seller2Reviews.status, 200);
      const leakage = (seller2Reviews.data.reviews || []).find(r => r.productId === testProductId || r.product_id === testProductId);
      assert.strictEqual(leakage, undefined, 'IDOR violation: Seller 2 must NOT see reviews for Seller 1 products');
    });
  });
});
