const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');
const db = require('../db/db');
const authRouter = require('../routes/auth');
const ordersRouter = require('../routes/orders');
const productsRouter = require('../routes/products');
const cartRouter = require('../routes/cart');
const { generateToken } = require('../middleware/auth');

test('KrishiSetu E2E Payment Proof, UPI Flow & Cash on Delivery Master Suite', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/cart', cartRouter);

  let server;
  let baseUrl;

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  t.after(() => {
    if (server && server.close) {
      server.close();
    }
  });

  async function request(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body, headers: res.headers };
  }

  // Setup test users in database
  const sellerA = { id: 'seller_pay_01', contact: 'farmer_a@test.com', role: 'seller', name: 'Farmer Ramesh' };
  const sellerB = { id: 'seller_pay_02', contact: 'farmer_b@test.com', role: 'seller', name: 'Farmer Suresh' };
  const customerA = { id: 'cust_pay_01', contact: 'buyer_a@test.com', role: 'customer', name: 'Buyer Ananya' };

  await db.query(
    'INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
    [sellerA.id, sellerA.name, sellerA.contact, 'hash', sellerA.role]
  );
  await db.query(
    'INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
    [sellerB.id, sellerB.name, sellerB.contact, 'hash', sellerB.role]
  );
  await db.query(
    'INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
    [customerA.id, customerA.name, customerA.contact, 'hash', customerA.role]
  );

  const tokenSellerA = generateToken(sellerA);
  const tokenSellerB = generateToken(sellerB);
  const tokenCustA = generateToken(customerA);

  let testProduct;

  await t.test('1. Seller lists product and buyer adds to cart', async () => {
    const prodRes = await request('/api/products', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSellerA}` },
      body: JSON.stringify({
        name: 'Fresh Alphonso Mangoes',
        category: 'Fruits',
        description: 'Direct farm organic mangoes',
        price: 250,
        quantity: 100,
        unit: 'kg'
      })
    });
    assert.strictEqual(prodRes.status, 201);
    testProduct = prodRes.body.product;
    assert.ok(testProduct && testProduct.id);

    // Customer adds 4 kg to cart
    const cartRes = await request('/api/cart/items', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCustA}` },
      body: JSON.stringify({ productId: testProduct.id, quantity: 4 })
    });
    assert.strictEqual(cartRes.status, 201);
  });

  await t.test('2. Cash on Delivery (COD) Checkout & Order Lifecycle', async () => {
    // Customer places COD order from cart
    const orderRes = await request('/api/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCustA}` },
      body: JSON.stringify({
        payment_method: 'cod',
        payment_status: 'cod'
      })
    });

    assert.strictEqual(orderRes.status, 201);
    const createdOrders = orderRes.body.orders;
    assert.ok(createdOrders && createdOrders.length > 0);
    const codOrder = createdOrders[0];
    assert.strictEqual(codOrder.payment_method, 'cod');
    assert.strictEqual(codOrder.payment_status, 'cod');
    assert.strictEqual(codOrder.status, 'Order Placed');

    // Seller fetches orders and sees the COD order
    const sellerOrdersRes = await request('/api/orders', {
      headers: { Authorization: `Bearer ${tokenSellerA}` }
    });
    assert.strictEqual(sellerOrdersRes.status, 200);
    const foundOrder = sellerOrdersRes.body.orders.find(o => o.id === codOrder.id || o.dbId === codOrder.id);
    assert.ok(foundOrder, 'Seller should see newly placed COD order');
    assert.strictEqual(foundOrder.payment_method, 'cod');

    // Seller confirms COD order
    const confirmRes = await request(`/api/orders/${foundOrder.dbId || foundOrder.id}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenSellerA}` },
      body: JSON.stringify({ status: 'Farmer Confirmed' })
    });
    assert.strictEqual(confirmRes.status, 200);
    assert.strictEqual(confirmRes.body.status, 'Farmer Confirmed');
  });

  let upiOrderId;
  const testUtr = 'UTR2026' + Date.now().toString().slice(-6);

  await t.test('3. UPI QR Checkout with UTR / Transaction ID submission', async () => {
    // Place direct order with UPI QR and UTR
    const upiRes = await request('/api/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCustA}` },
      body: JSON.stringify({
        productId: testProduct.id,
        quantity: 2,
        payment_method: 'upi_qr',
        payment_status: 'submitted',
        transaction_id: testUtr
      })
    });

    assert.strictEqual(upiRes.status, 201);
    const upiOrder = upiRes.body.orders[0];
    assert.strictEqual(upiOrder.payment_method, 'upi_qr');
    assert.strictEqual(upiOrder.payment_status, 'submitted');
    assert.strictEqual(upiOrder.transaction_id, testUtr);
    upiOrderId = upiOrder.id;

    // Verify GET /api/orders returns transaction_id to both buyer and seller
    const getRes = await request('/api/orders', {
      headers: { Authorization: `Bearer ${tokenCustA}` }
    });
    assert.strictEqual(getRes.status, 200);
    const retrievedOrder = getRes.body.orders.find(o => o.id === upiOrderId || o.dbId === upiOrderId);
    assert.ok(retrievedOrder);
    assert.strictEqual(retrievedOrder.transaction_id, testUtr);
  });

  await t.test('4. UPI Duplicate Transaction Replay Attack Prevention', async () => {
    // Attempting to place an order with the same transaction ID must return 409 Conflict
    const replayRes = await request('/api/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCustA}` },
      body: JSON.stringify({
        productId: testProduct.id,
        quantity: 1,
        payment_method: 'upi_qr',
        payment_status: 'submitted',
        transaction_id: testUtr
      })
    });

    assert.strictEqual(replayRes.status, 409);
    assert.ok(replayRes.body.error && replayRes.body.error.includes('already been submitted'));
  });

  await t.test('5. Unauthorized Seller cannot verify another seller payment', async () => {
    // Seller B attempts to verify payment for Seller A's order
    const unauthRes = await request(`/api/orders/${upiOrderId}/seller-verify-payment`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenSellerB}` },
      body: JSON.stringify({ action: 'approve' })
    });
    assert.strictEqual(unauthRes.status, 403);
  });

  await t.test('6. Assigned Seller verifies and approves UPI payment', async () => {
    // Seller A verifies payment
    const approveRes = await request(`/api/orders/${upiOrderId}/seller-verify-payment`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenSellerA}` },
      body: JSON.stringify({ action: 'approve' })
    });
    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.body.paymentStatus, 'verified');
    assert.strictEqual(approveRes.body.status, 'Farmer Confirmed');

    // Re-verification attempt is rejected (409 Conflict)
    const repeatRes = await request(`/api/orders/${upiOrderId}/seller-verify-payment`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenSellerA}` },
      body: JSON.stringify({ action: 'approve' })
    });
    assert.strictEqual(repeatRes.status, 409);
  });

  await t.test('7. Payment Rejection and Buyer Re-submission Flow', async () => {
    const freshUtr1 = 'UTR_REJ_' + Date.now().toString().slice(-5);
    const rejOrderRes = await request('/api/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCustA}` },
      body: JSON.stringify({
        productId: testProduct.id,
        quantity: 1,
        payment_method: 'upi_qr',
        payment_status: 'submitted',
        transaction_id: freshUtr1
      })
    });
    assert.strictEqual(rejOrderRes.status, 201);
    const rejOrderId = rejOrderRes.body.orders[0].id;

    // Seller rejects payment
    const rejectRes = await request(`/api/orders/${rejOrderId}/seller-verify-payment`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenSellerA}` },
      body: JSON.stringify({ action: 'reject', reason: 'Amount mismatch' })
    });
    assert.strictEqual(rejectRes.status, 200);
    assert.strictEqual(rejectRes.body.paymentStatus, 'rejected');

    // Customer re-submits valid UTR
    const freshUtr2 = 'UTR_FIX_' + Date.now().toString().slice(-5);
    const resubmitRes = await request(`/api/orders/${rejOrderId}/verify-payment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCustA}` },
      body: JSON.stringify({ transactionId: freshUtr2 })
    });
    assert.strictEqual(resubmitRes.status, 200);
    assert.strictEqual(resubmitRes.body.paymentStatus, 'submitted');
    assert.strictEqual(resubmitRes.body.transactionId, freshUtr2);
  });

  await t.test('8. Indian Delivery Address checkout retains full coordinates for seller verification', async () => {
    const addrPayload = {
      productId: testProduct.id,
      quantity: 1,
      payment_method: 'cod',
      payment_status: 'cod',
      delivery_address: 'Flat 402, Shivam Heights, MG Road, Hadapsar, Pune, Maharashtra - 411028',
      customer_name: 'Ananya Sharma',
      customer_phone: '9876543210',
      delivery_city: 'Pune',
      delivery_state: 'Maharashtra',
      delivery_pincode: '411028',
      delivery_instructions: 'Deliver morning between 8-11 AM, call gate'
    };

    const res = await request('/api/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCustA}` },
      body: JSON.stringify(addrPayload)
    });

    assert.strictEqual(res.status, 201);
    const createdOrder = res.body.orders[0];
    assert.strictEqual(createdOrder.deliveryAddress, addrPayload.delivery_address);
    assert.strictEqual(createdOrder.deliveryPincode, '411028');

    // Seller fetches orders and sees customer coordinates
    const sellerRes = await request('/api/orders', {
      headers: { Authorization: `Bearer ${tokenSellerA}` }
    });
    assert.strictEqual(sellerRes.status, 200);
    const found = sellerRes.body.orders.find(o => o.id === createdOrder.id || o.dbId === createdOrder.id);
    assert.ok(found);
    assert.strictEqual(found.deliveryAddress, addrPayload.delivery_address);
    assert.strictEqual(found.deliveryPincode, '411028');
    assert.strictEqual(found.deliveryCity, 'Pune');
    assert.strictEqual(found.deliveryState, 'Maharashtra');
    assert.strictEqual(found.deliveryInstructions, addrPayload.delivery_instructions);
  });
});
