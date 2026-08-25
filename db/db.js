const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

let pool = null;
let isPgConnected = false;

// Fallback in-memory relational store (Phase 5B)
class LocalFallbackDB {
  constructor() {
    this.tables = {
      users: [],
      seller_profiles: [],
      customer_profiles: [],
      seller_locations: [],
      products: [],
      product_images: [],
      carts: [],
      cart_items: [],
      orders: [],
      order_items: [],
      seller_verifications: [],
      otps: [],
      order_status_history: [],
      market_price_snapshots: []
    };
  }

  async query(text, params = []) {
    const q = text.trim();

    // 1. SELECT USERS
    if (q.includes('FROM users')) {
      if (q.includes('contact =')) {
        const contact = params[0];
        const found = this.tables.users.find(u => u.contact === contact);
        return { rows: found ? [{ ...found }] : [] };
      }
      if (q.includes('id =')) {
        const id = params[0];
        const found = this.tables.users.find(u => u.id === id);
        return { rows: found ? [{ ...found }] : [] };
      }
      if (q.includes("role = 'seller'")) {
        const sellers = this.tables.users.filter(u => u.role === 'seller');
        return { rows: sellers };
      }
      return { rows: [...this.tables.users] };
    }

    // 2. INSERT USERS
    if (q.startsWith('INSERT INTO users')) {
      const user = {
        id: params[0],
        name: params[1],
        contact: params[2],
        password_hash: params[3],
        role: params[4],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.tables.users.push(user);
      return { rows: [{ ...user }] };
    }

    // 2B. UPDATE USERS (PASSWORD RESET)
    if (q.startsWith('UPDATE users SET password_hash =')) {
      const newHash = params[0];
      const contact = params[1];
      const user = this.tables.users.find(u => u.contact === contact);
      if (user) {
        user.password_hash = newHash;
        user.updated_at = new Date().toISOString();
      }
      return { rows: user ? [{ ...user }] : [] };
    }

    // 3. INSERT SELLER / CUSTOMER PROFILES
    if (q.startsWith('INSERT INTO seller_profiles')) {
      const sp = {
        id: params[0], user_id: params[1], business_name: params[2] || null,
        description: params[3] || null, verification_status: params[4] || 'pending',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      };
      this.tables.seller_profiles.push(sp);
      return { rows: [{ ...sp }] };
    }
    if (q.startsWith('INSERT INTO customer_profiles')) {
      const cp = {
        id: params[0], user_id: params[1], address: params[2] || null, city: params[3] || null,
        state: params[4] || null, pincode: params[5] || null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      };
      this.tables.customer_profiles.push(cp);
      return { rows: [{ ...cp }] };
    }

    // 3B. UPDATE SELLER PROFILE VERIFICATION STATUS
    if (q.startsWith('UPDATE seller_profiles SET verification_status =')) {
      const newStatus = params[0];
      const sellerId = params[1];
      const sp = this.tables.seller_profiles.find(x => x.user_id === sellerId);
      if (sp) {
        sp.verification_status = newStatus;
        sp.updated_at = new Date().toISOString();
      }
      return { rows: sp ? [{ ...sp }] : [] };
    }

    // 4. SELECT PRODUCTS (JOIN SELLER_PROFILES FOR VERIFICATION STATUS)
    if (q.includes('FROM products')) {
      let result = [...this.tables.products].filter(p => p.status !== 'inactive');
      
      // Enrich products with sellerName, sellerContact, and sellerVerificationStatus
      result = result.map(p => {
        const seller = this.tables.users.find(u => u.id === p.seller_id) || {};
        const sp = this.tables.seller_profiles.find(x => x.user_id === p.seller_id) || {};
        return {
          ...p,
          sellerName: seller.name || 'Local Farmer',
          sellerContact: seller.contact || 'Contact not provided',
          sellerVerificationStatus: sp.verification_status || 'pending'
        };
      });

      if (q.includes('WHERE p.id = $1') || q.includes('WHERE id = $1')) {
        const id = params[0];
        const p = result.find(x => x.id === id);
        return { rows: p ? [{ ...p }] : [] };
      }
      if (q.includes('p.seller_id = $') || q.includes('seller_id = $')) {
        const sellerId = params[0];
        result = result.filter(p => p.seller_id === sellerId);
      }
      if (q.includes('LOWER(p.category) = LOWER($')) {
        const cat = params[params.length - 1];
        result = result.filter(p => p.category.toLowerCase() === String(cat).toLowerCase());
      }
      return { rows: result };
    }

    // 5. INSERT PRODUCTS
    if (q.startsWith('INSERT INTO products')) {
      let product = {};
      if (params.length >= 15) {
        product = {
          id: params[0], seller_id: params[1], name: params[2], category: params[3],
          description: params[4], price: Number(params[5]), price_unit: params[6] || 'kg',
          quantity: Number(params[7]), quantity_unit: params[8] || 'kg', grade: params[9] || 'Standard',
          status: params[10] || 'active', available_date: params[11] || null, location: params[12] || 'Location pending',
          latitude: params[13], longitude: params[14], image_url: params[15] || null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        };
      } else {
        product = {
          id: params[0], seller_id: params[1], name: params[2], category: params[3],
          description: params[4], price: Number(params[5]), price_unit: 'kg',
          quantity: Number(params[6]), quantity_unit: 'kg', grade: params[7] || 'Standard',
          status: params[8] || 'active', available_date: null, location: params[9] || 'Location pending',
          latitude: null, longitude: null, image_url: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        };
      }
      this.tables.products.unshift(product);
      return { rows: [{ ...product }] };
    }

    // 6. UPDATE PRODUCTS
    if (q.startsWith('UPDATE products')) {
      const id = params[params.length - 1];
      const p = this.tables.products.find(x => x.id === id);
      if (p) {
        if (q.includes('quantity = $1, status = $2')) {
          p.quantity = Number(params[0]);
          p.status = params[1];
        } else if (q.includes('quantity = $1, price = $2')) {
          p.quantity = Number(params[0]);
          p.price = Number(params[1]);
        } else if (q.includes('quantity = $1')) {
          p.quantity = Number(params[0]);
        } else if (q.includes('status = \'inactive\'')) {
          p.status = 'inactive';
        } else if (params.length >= 8) {
          p.name = params[0]; p.category = params[1]; p.description = params[2];
          p.price = Number(params[3]); p.quantity = Number(params[4]); p.grade = params[5];
          p.available_date = params[6]; p.location = params[7]; if (params[8]) p.status = params[8];
          if (params[9]) p.image_url = params[9];
        }
        p.updated_at = new Date().toISOString();
      }
      return { rows: p ? [{ ...p }] : [] };
    }

    // 7. CARTS & CART ITEMS
    if (q.includes('FROM carts')) {
      const custId = params[0];
      let cart = this.tables.carts.find(c => c.customer_id === custId);
      if (!cart) {
        cart = { id: 'CART_' + custId, customer_id: custId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        this.tables.carts.push(cart);
      }
      return { rows: [{ ...cart }] };
    }
    if (q.includes('FROM seller_profiles')) {
      const uid = params[0];
      const sp = this.tables.seller_profiles.find(x => x.user_id === uid || x.id === uid);
      return { rows: sp ? [{ ...sp }] : [] };
    }

    if (q.includes('FROM customer_profiles')) {
      const uid = params[0];
      const cp = this.tables.customer_profiles.find(x => x.user_id === uid || x.id === uid);
      return { rows: cp ? [{ ...cp }] : [] };
    }

    if (q.includes('FROM cart_items')) {
      const cartId = params[0];
      const items = this.tables.cart_items.filter(ci => ci.cart_id === cartId).map(ci => {
        const product = this.tables.products.find(p => p.id === ci.product_id) || {};
        return {
          ...ci,
          productId: ci.product_id,
          product_name: product.name,
          unit_price: product.price,
          seller_id: product.seller_id,
          image_url: product.image_url,
          subtotal: Number(ci.quantity) * Number(product.price || 0)
        };
      });
      return { rows: items };
    }
    if (q.startsWith('INSERT INTO cart_items')) {
      const existingIdx = this.tables.cart_items.findIndex(ci => ci.cart_id === params[1] && ci.product_id === params[2]);
      if (existingIdx !== -1) {
        this.tables.cart_items[existingIdx].quantity = Number(params[3]);
        return { rows: [{ ...this.tables.cart_items[existingIdx] }] };
      }
      const ci = {
        id: params[0], cart_id: params[1], product_id: params[2], quantity: Number(params[3]),
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      };
      this.tables.cart_items.push(ci);
      return { rows: [{ ...ci }] };
    }
    if (q.startsWith('DELETE FROM cart_items')) {
      const id = params[0];
      if (q.includes('cart_id =')) {
        this.tables.cart_items = this.tables.cart_items.filter(ci => ci.cart_id !== id);
      } else {
        this.tables.cart_items = this.tables.cart_items.filter(ci => ci.id !== id);
      }
      return { rows: [] };
    }

    // 8. ORDERS
    if (q.startsWith('INSERT INTO orders')) {
      const order = {
        id: params[0], order_number: params[1], customer_id: params[2], seller_id: params[3],
        status: params[4] || 'Order Placed', total_amount: Number(params[5]), buyer_contact: params[6] || '',
        step: Number(params[7] || 1), created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      };
      this.tables.orders.unshift(order);
      return { rows: [{ ...order }] };
    }
    if (q.includes('FROM orders')) {
      const userId = params[0];
      let found = [];
      if (q.includes('seller_id = $1')) {
        found = this.tables.orders.filter(o => o.seller_id === userId);
      } else if (q.includes('customer_id = $1')) {
        found = this.tables.orders.filter(o => o.customer_id === userId);
      } else if (q.includes('id = $1') || q.includes('order_number = $1')) {
        found = this.tables.orders.filter(o => o.id === userId || o.order_number === userId);
      } else {
        found = [...this.tables.orders];
      }

      const enriched = found.map(o => {
        const items = this.tables.order_items.filter(oi => oi.order_id === o.id);
        const seller = this.tables.users.find(u => u.id === o.seller_id) || {};
        const sp = this.tables.seller_profiles.find(x => x.user_id === o.seller_id) || {};
        const firstItem = items[0] || {};
        return {
          ...o, items, product: firstItem.product_name_snapshot || 'Produce', qty: firstItem.quantity || 1,
          price: firstItem.unit_price_snapshot || o.total_amount, total: o.total_amount,
          sellerName: seller.name || 'Local Farmer', sellerContact: seller.contact || 'Contact not provided',
          sellerVerificationStatus: sp.verification_status || 'pending',
          sellerLocation: 'Location pending'
        };
      });
      return { rows: enriched };
    }
    if (q.startsWith('UPDATE orders')) {
      const newStatus = params[0];
      const newStep = Number(params[1]);
      const orderId = params[2];
      const o = this.tables.orders.find(x => x.id === orderId || x.order_number === orderId);
      if (o) {
        o.status = newStatus; o.step = newStep; o.updated_at = new Date().toISOString();
      }
      return { rows: o ? [{ ...o }] : [] };
    }

    // 9. ORDER ITEMS
    if (q.startsWith('INSERT INTO order_items')) {
      const oi = {
        id: params[0], order_id: params[1], product_id: params[2], product_name_snapshot: params[3],
        quantity: Number(params[4]), unit_price_snapshot: Number(params[5]),
        unit: params[6] || 'kg', subtotal: Number(params[7] || (params[4] * params[5])),
        created_at: new Date().toISOString()
      };
      this.tables.order_items.push(oi);
      return { rows: [{ ...oi }] };
    }
    if (q.includes('FROM order_items')) {
      const orderId = params[0];
      const items = this.tables.order_items.filter(oi => oi.order_id === orderId);
      return { rows: items.map(x => ({ ...x })) };
    }

    // 10. SELLER VERIFICATIONS (PHASE 5B)
    if (q.startsWith('INSERT INTO seller_verifications')) {
      const sv = {
        id: params[0], seller_id: params[1], document_type: params[2],
        document_reference: params[3], document_url: params[4] || null,
        status: params[5] || 'pending', admin_id: null, rejection_reason: null,
        submitted_at: new Date().toISOString(), reviewed_at: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      };
      this.tables.seller_verifications.unshift(sv);
      return { rows: [{ ...sv }] };
    }

    if (q.includes('FROM seller_verifications')) {
      let verifs = [...this.tables.seller_verifications];
      if (q.includes('seller_id = $1')) {
        const sellerId = params[0];
        verifs = verifs.filter(sv => sv.seller_id === sellerId);
      }
      if (q.includes('sv.id = $1') || q.includes('id = $1')) {
        const id = params[0];
        verifs = verifs.filter(sv => sv.id === id);
      }

      // Enrich with seller details
      const enriched = verifs.map(sv => {
        const seller = this.tables.users.find(u => u.id === sv.seller_id) || {};
        const sp = this.tables.seller_profiles.find(x => x.user_id === sv.seller_id) || {};
        return {
          ...sv,
          sellerName: seller.name || 'Seller',
          sellerContact: seller.contact || '',
          businessName: sp.business_name || `${seller.name}'s Farm`
        };
      });
      return { rows: enriched };
    }

    if (q.startsWith('UPDATE seller_verifications')) {
      const id = params[params.length - 1];
      const sv = this.tables.seller_verifications.find(x => x.id === id);
      if (sv) {
        sv.status = params[0];
        sv.admin_id = params[1];
        sv.rejection_reason = params[2] || null;
        sv.reviewed_at = new Date().toISOString();
        sv.updated_at = new Date().toISOString();
      }
      return { rows: sv ? [{ ...sv }] : [] };
    }

    // 11. OTPS (PHASE 5B)
    if (q.startsWith('INSERT INTO otps')) {
      const otpRec = {
        id: params[0], user_id: params[1], contact: params[2],
        otp_hash: params[3], purpose: params[4], expires_at: params[5],
        attempt_count: Number(params[6] || 0), verified_at: null,
        created_at: new Date().toISOString()
      };
      this.tables.otps.unshift(otpRec);
      return { rows: [{ ...otpRec }] };
    }

    if (q.includes('FROM otps')) {
      const contact = params[0];
      const purpose = params[1];
      let matches = this.tables.otps.filter(o => o.contact === contact);
      if (purpose) {
        matches = matches.filter(o => o.purpose === purpose);
      }
      if (q.includes('created_at >')) {
        matches = matches.filter(o => new Date(o.created_at) > new Date(Date.now() - 60000));
      }
      if (q.includes('verified_at IS NULL')) {
        matches = matches.filter(o => !o.verified_at);
      }
      return { rows: matches.map(x => ({ ...x })) };
    }

    if (q.startsWith('UPDATE otps')) {
      const id = params[params.length - 1];
      const otpRec = this.tables.otps.find(x => x.id === id);
      if (otpRec) {
        if (q.includes('attempt_count =')) {
          otpRec.attempt_count = Number(params[0]);
        }
        if (q.includes('verified_at =')) {
          otpRec.verified_at = new Date().toISOString();
        }
      }
      return { rows: otpRec ? [{ ...otpRec }] : [] };
    }

    // 12. ORDER STATUS HISTORY (PHASE 5B)
    if (q.startsWith('INSERT INTO order_status_history')) {
      const hist = {
        id: params[0], order_id: params[1], previous_status: params[2],
        new_status: params[3], changed_by: params[4], changed_at: new Date().toISOString()
      };
      this.tables.order_status_history.unshift(hist);
      return { rows: [{ ...hist }] };
    }

    if (q.includes('FROM order_status_history')) {
      const orderId = params[0];
      const history = this.tables.order_status_history.filter(h => h.order_id === orderId);
      return { rows: history.map(x => ({ ...x })) };
    }

    // 14. MARKET PRICE SNAPSHOTS
    if (q.startsWith('INSERT INTO market_price_snapshots')) {
      const snap = {
        id: params[0],
        state: params[1],
        district: params[2] || null,
        market: params[3],
        commodity: params[4],
        variety: params[5] || 'Local',
        grade: params[6] || 'FAQ',
        arrival_date: params[7] || new Date().toISOString().split('T')[0],
        min_price: Number(params[8]),
        max_price: Number(params[9]),
        modal_price: Number(params[10]),
        unit: params[11] || 'quintal',
        fetched_at: new Date().toISOString()
      };
      
      const existingIdx = this.tables.market_price_snapshots.findIndex(
        x => x.id === snap.id || (x.commodity === snap.commodity && x.market === snap.market && x.arrival_date === snap.arrival_date)
      );

      if (existingIdx !== -1) {
        this.tables.market_price_snapshots[existingIdx] = snap;
      } else {
        this.tables.market_price_snapshots.unshift(snap);
      }
      return { rows: [{ ...snap }] };
    }

    if (q.includes('FROM market_price_snapshots')) {
      let results = [...this.tables.market_price_snapshots];

      if (params.length > 0) {
        const commodity = params[0];
        if (commodity) {
          results = results.filter(x => x.commodity.toLowerCase() === String(commodity).toLowerCase());
        }
      }

      if (q.includes('market =') && params.length > 1) {
        const market = params[1];
        if (market) {
          results = results.filter(x => x.market.toLowerCase() === String(market).toLowerCase());
        }
      }

      if (q.includes('state =') && params.length > 1) {
        const state = params[params.length - 1];
        if (state) {
          results = results.filter(x => x.state.toLowerCase() === String(state).toLowerCase());
        }
      }

      return { rows: results };
    }

    // 13. ADMIN METRICS
    if (q.includes('COUNT(')) {
      const sellersCount = this.tables.users.filter(u => u.role === 'seller').length;
      const pendingVerifs = this.tables.seller_verifications.filter(sv => sv.status === 'pending').length;
      const verifiedSellers = this.tables.seller_verifications.filter(sv => sv.status === 'verified').length;
      const rejectedVerifs = this.tables.seller_verifications.filter(sv => sv.status === 'rejected').length;
      const totalOrders = this.tables.orders.length;

      return {
        rows: [{
          totalSellers: sellersCount,
          pendingVerifications: pendingVerifs,
          verifiedSellers,
          rejectedVerifications: rejectedVerifs,
          totalOrders
        }]
      };
    }

    return { rows: [] };
  }
}

const fallbackDb = new LocalFallbackDB();

async function initDb() {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    try {
      pool = new Pool({
        connectionString,
        connectionTimeoutMillis: 3000,
        idleTimeoutMillis: 10000,
        max: 10
      });

      const client = await pool.connect();
      const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
      await client.query(schemaSql);
      client.release();
      isPgConnected = true;
      console.log('Successfully connected to PostgreSQL production database.');
      return;
    } catch (err) {
      console.warn('PostgreSQL connection attempt failed:', err.message);
      console.warn('Using embedded database fallback engine for local operation.');
    }
  } else {
    console.warn('No DATABASE_URL configured. Using embedded database fallback engine.');
  }

  isPgConnected = false;
}

async function query(text, params) {
  if (isPgConnected && pool) {
    return pool.query(text, params);
  }
  return fallbackDb.query(text, params);
}

async function getClient() {
  if (isPgConnected && pool) {
    return pool.connect();
  }
  return {
    query: (text, params) => fallbackDb.query(text, params),
    release: () => {}
  };
}

async function withTransaction(callback) {
  if (isPgConnected && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    return callback(fallbackDb);
  }
}

module.exports = {
  initDb,
  query,
  getClient,
  withTransaction,
  isPgConnected: () => isPgConnected
};
