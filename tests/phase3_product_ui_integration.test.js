/**
 * KrishiSetu 2.0 — Phase 3 Product & UI Integration Automated Test Suite
 */

process.env.TEST_LIVE_DB = 'true';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const bcrypt = require('bcryptjs');

const app = require('../server');
const db = require('../db/db');
const { generateToken } = require('../middleware/auth');

let server;
let baseUrl;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOpts = {
      method: options.method || 'GET',
      headers: { ...(options.headers || {}) }
    };

    let bodyData = null;
    if (options.body) {
      bodyData = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      reqOpts.headers['Content-Type'] = 'application/json';
      reqOpts.headers['Content-Length'] = Buffer.byteLength(bodyData);
    }

    const req = http.request(url, reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

test('Phase 3 — Product & UI Integration Suite', async (t) => {
  let customerUser;
  let sellerUser;
  let customerToken;
  let sellerToken;
  let testProductId;

  await t.test('Server Setup and Test Fixtures Initialization', async () => {
    await db.initDb();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    const hash = await bcrypt.hash('TestPass123!', 10);

    // 1. Create test customer
    const custId = 'U_CUST_' + Date.now() + Math.random().toString(36).substring(2, 5);
    const custContact = `aarav_${Date.now()}@krishisetu.in`;
    await db.query(
      `INSERT INTO users (id, name, contact, password_hash, role) 
       VALUES ($1, $2, $3, $4, 'customer')`,
      [custId, 'Aarav Sharma', custContact, hash]
    );
    await db.query(
      `INSERT INTO customer_profiles (id, user_id) 
       VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
      ['CP_' + custId, custId]
    );
    customerUser = { id: custId, name: 'Aarav Sharma', contact: custContact, role: 'customer' };
    customerToken = generateToken(customerUser);

    // 2. Create test seller
    const sellerId = 'U_SELLER_' + Date.now() + Math.random().toString(36).substring(2, 5);
    const sellerContact = `ramesh_${Date.now()}@krishisetu.in`;
    await db.query(
      `INSERT INTO users (id, name, contact, password_hash, role) 
       VALUES ($1, $2, $3, $4, 'seller')`,
      [sellerId, 'Ramesh Kisan', sellerContact, hash]
    );
    await db.query(
      `INSERT INTO seller_profiles (id, user_id, business_name, verification_status)
       VALUES ($1, $2, 'Kisan Organic Farm', 'verified')
       ON CONFLICT (user_id) DO UPDATE SET verification_status = 'verified'`,
      ['SP_' + sellerId, sellerId]
    );
    sellerUser = { id: sellerId, name: 'Ramesh Kisan', contact: sellerContact, role: 'seller' };
    sellerToken = generateToken(sellerUser);

    // 3. Create a fresh test product
    testProductId = 'P_TEST_' + Date.now() + Math.random().toString(36).substring(2, 5);
    await db.query(
      `INSERT INTO products 
       (id, seller_id, name, category, description, price, price_unit, quantity, quantity_unit, grade, status, location)
       VALUES ($1, $2, 'Organic Red Onions', 'Vegetables', 'Farm fresh red onions direct from Nashik farm.', 28, 'kg', 500, 'kg', 'Grade A', 'active', 'Nashik, Maharashtra')`,
      [testProductId, sellerId]
    );
    assert.ok(testProductId, 'Test product should be created');
  });

  await t.test('1. Frontend Static Assets & Screen Integration', async () => {
    const res = await makeRequest('/');
    assert.strictEqual(res.status, 200, 'Landing page should return HTTP 200');
    const html = res.raw || '';
    
    // Verify core Phase 3 components exist in the HTML DOM
    assert.ok(html.includes('id="customer-dashboard"'), 'HTML must include #customer-dashboard screen');
    assert.ok(html.includes('id="seller-dashboard"'), 'HTML must include #seller-dashboard screen');
    assert.ok(html.includes('id="dashboardNavBtn"'), 'Navbar must include #dashboardNavBtn');
    assert.ok(html.includes('id="marketSearchInput"'), 'Marketplace must include #marketSearchInput search bar');
    assert.ok(html.includes('id="marketSortFilter"'), 'Marketplace must include #marketSortFilter');
    assert.ok(html.includes('id="mandiTimeframeButtonGroup"'), 'Mandi screen must include timeframe button group');
    assert.ok(html.includes('AGMARKNET LIVE'), 'Mandi screen must display AGMARKNET LIVE status');
  });

  await t.test('2. Product Marketplace & Catalog API', async () => {
    // Test public products query
    const res = await makeRequest('/api/products');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.products), 'Should return products array');
    assert.ok(res.body.products.length > 0, 'Products array should have items');

    // Test category filter
    const vegRes = await makeRequest('/api/products?category=Vegetables');
    assert.strictEqual(vegRes.status, 200);
    const vegProds = vegRes.body.products || [];
    assert.ok(vegProds.every(p => p.category.toLowerCase() === 'vegetables'), 'All returned products must match category filter');

    // Test single product details
    const detailRes = await makeRequest(`/api/products/${testProductId}`);
    assert.strictEqual(detailRes.status, 200);
    assert.strictEqual(detailRes.body.product.id, testProductId);
    assert.strictEqual(detailRes.body.product.name, 'Organic Red Onions');
    assert.strictEqual(Number(detailRes.body.product.price), 28);
  });

  await t.test('3. Mandi Market Intelligence Prices API', async () => {
    const res = await makeRequest('/api/market-prices?commodity=Onion&state=Maharashtra');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.records, 'Should return records');
    assert.ok(Array.isArray(res.body.records), 'Records should be an array');
    if (res.body.records.length > 0) {
      const rec = res.body.records[0];
      assert.ok(rec.modal_price != null, 'Record should have modal_price');
    }
  });

  await t.test('4. Seller Verification Status Endpoint', async () => {
    const res = await makeRequest('/api/seller/verification/status', {
      headers: { Authorization: `Bearer ${sellerToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'verified', 'Seller status should be verified');
  });

  await t.test('5. Cart Management (Optimistic & Quantity Support)', async () => {
    // Add item to cart with quantity 5
    const addRes = await makeRequest('/api/cart/items', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { productId: testProductId, quantity: 5 }
    });
    assert.strictEqual(addRes.status, 201, 'Should add item to cart with 201 Created');

    // Fetch cart
    const getRes = await makeRequest('/api/cart', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert.strictEqual(getRes.status, 200);
    assert.ok(Array.isArray(getRes.body.items));
    const cartItem = getRes.body.items.find(i => i.product_id === testProductId);
    assert.ok(cartItem, 'Added item should exist in cart');
    assert.strictEqual(Number(cartItem.quantity), 5, 'Quantity in cart should match 5');
  });

  await t.test('6. Order Fulfillment Lifecycle: Customer Checkout to Seller Dispatch', async () => {
    // 1. Customer creates order from direct or cart checkout
    const orderPayload = {
      productId: testProductId,
      quantity: 10,
      payment_method: 'cod',
      customer_name: 'Aarav Sharma',
      customer_phone: '9876543210',
      delivery_address: 'Flat 402, Green Meadows',
      delivery_city: 'Pune',
      delivery_state: 'Maharashtra',
      delivery_pincode: '411001'
    };

    const createRes = await makeRequest('/api/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: orderPayload
    });

    assert.strictEqual(createRes.status, 201, 'Order creation should return 201');
    assert.ok(createRes.body.orders && createRes.body.orders.length > 0);
    const createdOrder = createRes.body.orders[0];
    const orderId = createdOrder.internalId;
    assert.strictEqual(createdOrder.status, 'Order Placed');

    // 2. Customer retrieves their active orders (for customer dashboard)
    const custOrdersRes = await makeRequest('/api/orders', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert.strictEqual(custOrdersRes.status, 200);
    const foundCustOrder = custOrdersRes.body.orders.find(o => o.dbId === orderId || o.id === createdOrder.order_number || o.orderNumber === createdOrder.order_number);
    assert.ok(foundCustOrder, 'Created order must be visible to customer');
    assert.strictEqual(foundCustOrder.status, 'Order Placed');

    // 3. Seller retrieves incoming orders (for seller dashboard)
    const sellerOrdersRes = await makeRequest('/api/orders', {
      headers: { Authorization: `Bearer ${sellerToken}` }
    });
    assert.strictEqual(sellerOrdersRes.status, 200);
    const foundSellerOrder = sellerOrdersRes.body.orders.find(o => o.dbId === orderId || o.id === createdOrder.order_number || o.orderNumber === createdOrder.order_number);
    assert.ok(foundSellerOrder, 'Created order must be visible to seller');

    // 4. Advance status: 'Order Placed' -> 'Farmer Confirmed'
    const step1Res = await makeRequest(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: { status: 'Farmer Confirmed' }
    });
    assert.strictEqual(step1Res.status, 200);
    assert.strictEqual(step1Res.body.status, 'Farmer Confirmed');

    // 5. Advance status: 'Farmer Confirmed' -> 'Preparing'
    const step2Res = await makeRequest(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: { status: 'Preparing' }
    });
    assert.strictEqual(step2Res.status, 200);
    assert.strictEqual(step2Res.body.status, 'Preparing');

    // 6. Advance status: 'Preparing' -> 'Ready'
    const step3Res = await makeRequest(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: { status: 'Ready' }
    });
    assert.strictEqual(step3Res.status, 200);
    assert.strictEqual(step3Res.body.status, 'Ready');

    // 7. Advance status: 'Ready' -> 'Completed'
    const step4Res = await makeRequest(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: { status: 'Completed' }
    });
    assert.strictEqual(step4Res.status, 200);
    assert.strictEqual(step4Res.body.status, 'Completed');
  });

  await t.test('Teardown test server and database connections', async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
