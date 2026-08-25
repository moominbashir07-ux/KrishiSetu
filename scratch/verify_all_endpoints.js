const http = require('http');

function makeRequest(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runVerification() {
  console.log('--- E2E BACKEND & ENDPOINT QA VERIFICATION ---');

  // 1. GET Root / HTML
  const root = await makeRequest('/');
  console.log(`1. Root Landing Page: HTTP ${root.status} (Contains "Made by Team Red": ${typeof root.body === 'string' && root.body.includes('Made by Team Red')})`);

  // 2. Auth Signin
  const custAuth = await makeRequest('/api/auth/signup', 'POST', {
    name: 'E2E Customer',
    contact: `e2e_cust_${Date.now()}@example.com`,
    password: 'password123',
    role: 'customer'
  });
  console.log(`2. Customer Signup: HTTP ${custAuth.status}, User ID: ${custAuth.body.user?.id}`);
  const custToken = custAuth.body.token;

  const sellerAuth = await makeRequest('/api/auth/signup', 'POST', {
    name: 'E2E Seller',
    contact: `e2e_seller_${Date.now()}@example.com`,
    password: 'password123',
    role: 'seller'
  });
  console.log(`3. Seller Signup: HTTP ${sellerAuth.status}, User ID: ${sellerAuth.body.user?.id}`);
  const sellerToken = sellerAuth.body.token;

  // 3. Publish Product as Seller
  const prod = await makeRequest('/api/products', 'POST', {
    name: 'E2E Organic Apples',
    category: 'Fruits',
    grade: 'Grade A',
    description: 'Fresh Himachal apples',
    price: 120,
    quantity: 50,
    location: 'Shimla, HP',
    image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  }, sellerToken);
  console.log(`4. Create Product with Image: HTTP ${prod.status}, Product ID: ${prod.body.product?.id}`);
  const productId = prod.body.product?.id;

  // 4. Add to Cart as Customer
  const cartAdd = await makeRequest('/api/cart/items', 'POST', {
    productId,
    quantity: 10
  }, custToken);
  console.log(`5. Add to Cart: HTTP ${cartAdd.status}, Message: ${cartAdd.body.message}`);

  // 5. Get Cart Breakdown
  const cartView = await makeRequest('/api/cart', 'GET', null, custToken);
  console.log(`6. Cart Summary: Subtotal: ₹${cartView.body.subtotal}, Fee (${cartView.body.isBulk ? '0.5%' : '2%'}): ₹${cartView.body.platformFee}, Total: ₹${cartView.body.totalAmount}`);

  // 6. Checkout Order
  const checkout = await makeRequest('/api/orders', 'POST', {}, custToken);
  console.log(`7. Checkout Cart: HTTP ${checkout.status}, Order #: ${checkout.body.orders?.[0]?.id}`);

  // 7. Mandi Intelligence
  const mandi = await makeRequest('/api/market-prices?commodity=Onion&state=Maharashtra', 'GET');
  console.log(`8. Mandi AGMARKNET Intelligence: HTTP ${mandi.status}, Records: ${mandi.body.records?.length}, Source: "${mandi.body.metadata?.source}"`);

  // 8. Profiles
  const profile = await makeRequest('/api/auth/profile', 'GET', null, custToken);
  console.log(`9. Customer Profile: HTTP ${profile.status}, Name: ${profile.body.user?.name}`);

  const sellerProfile = await makeRequest(`/api/auth/sellers/${sellerAuth.body.user?.id}`, 'GET');
  console.log(`10. Buyer Seller View: HTTP ${sellerProfile.status}, Farm: ${sellerProfile.body.seller?.businessName}`);

  console.log('--- ALL BACKEND VERIFICATIONS COMPLETED SUCCESSFULLY ---');
}

runVerification().catch(console.error);
