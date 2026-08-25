const express = require('express');
const path = require('path');
require('dotenv').config();

const db = require('./db/db');
const { initDb } = db;
const { apiLimiter, securityHeaders, corsOptions, errorHandler } = require('./middleware/security');

const authRouter = require('./routes/auth');
const productsRouter = require('./routes/products');
const cartRouter = require('./routes/cart');
const ordersRouter = require('./routes/orders');
const sellerVerificationRouter = require('./routes/sellerVerification');
const adminRouter = require('./routes/admin');
const reviewsRouter = require('./routes/reviews');
const feedbackRouter = require('./routes/feedback');
const notificationsRouter = require('./routes/notifications');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.DATA_GOV_IN_API_KEY || '';
const RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070';
const API_BASE = `https://api.data.gov.in/resource/${RESOURCE_ID}`;

// Apply security middleware & parsers
app.use(securityHeaders);
app.use(corsOptions);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Apply rate limiter to API routes
app.use('/api', apiLimiter);

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Production Health Check Endpoint (Task 15)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    database: db.isPgConnected() ? 'connected (postgresql)' : 'connected (fallback)'
  });
});

// Register production backend API routes
app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/cart', cartRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/seller/verification', sellerVerificationRouter);
app.use('/api/admin', adminRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/notifications', notificationsRouter);

// Helper functions for Mandi price and date normalization
function parseMandiPrice(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return (Number.isFinite(val) && val > 0) ? val : null;
  }
  if (typeof val === 'string') {
    const clean = val.trim().replace(/[^0-9.]/g, '');
    if (!clean || clean === '0') return null;
    const num = parseFloat(clean);
    return (Number.isFinite(num) && num > 0) ? num : null;
  }
  return null;
}

function parseMandiDate(val) {
  if (!val) return new Date().toISOString().split('T')[0];
  const str = String(val).trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      return `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return str;
}

function getDemoMarketRecords(commodity = 'Onion', state = 'Maharashtra') {
  const basePrice = { Onion: 5760, Tomato: 2600, Potato: 2200, Wheat: 2900, Rice: 3200, Soybean: 5700, Cotton: 7200, Apple: 8500, Chilli: 6800 }[commodity] || 3000;
  const demoMarkets = ['Azadpur APMC', 'Lasalgaon APMC', 'Pune APMC', 'Nashik APMC', 'Ahmednagar APMC', 'Vashi APMC'];
  return demoMarkets.map((m, i) => ({
    market: m,
    district: m.split(' ')[0],
    state,
    commodity,
    variety: 'Local',
    grade: 'FAQ',
    arrival_date: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
    min_price: basePrice - 300 + i * 80,
    modal_price: basePrice + i * 120,
    max_price: basePrice + 350 + i * 100,
    unit: 'quintal'
  }));
}

app.get('/api/market-prices', async (req, res) => {
  const commodity = String(req.query.commodity || 'Onion');
  const state = String(req.query.state || 'Maharashtra');
  const district = req.query.district ? String(req.query.district) : null;
  const market = req.query.market ? String(req.query.market) : null;
  const limit = Math.min(Number(req.query.limit || 1000), 1000);

  if (API_KEY && API_KEY !== 'test_mock_api_key') {
    const queryObj = {
      'api-key': API_KEY,
      format: 'json',
      limit: String(limit),
      offset: '0',
      'filters[state]': state,
      'filters[commodity]': commodity,
      'sort[arrival_date]': 'desc'
    };

    if (district) queryObj['filters[district]'] = district;
    if (market) queryObj['filters[market]'] = market;

    const params = new URLSearchParams(queryObj);

    try {
      const response = await fetch(`${API_BASE}?${params.toString()}`);
      if (response.ok) {
        const body = await response.text();
        const json = JSON.parse(body);
        const rawRecords = Array.isArray(json.records) ? json.records : [];
        if (rawRecords.length > 0) {
          const normalizedRecords = rawRecords.map(r => {
            const minP = parseMandiPrice(r.min_price);
            const modalP = parseMandiPrice(r.modal_price);
            const maxP = parseMandiPrice(r.max_price);
            const arrDate = parseMandiDate(r.arrival_date);
            return {
              state: r.state || state,
              district: r.district || r.market || '',
              market: r.market || 'APMC Market',
              commodity: r.commodity || commodity,
              variety: r.variety || 'Local',
              grade: r.grade || 'FAQ',
              arrival_date: arrDate,
              min_price: minP,
              modal_price: modalP,
              max_price: maxP,
              unit: r.unit || 'quintal'
            };
          }).filter(r => r.market && r.modal_price !== null);

          if (normalizedRecords.length > 0) {
            for (const r of normalizedRecords) {
              const snapId = `SNAP_${r.state}_${r.market}_${r.commodity}_${r.arrival_date}`;
              db.query(
                `INSERT INTO market_price_snapshots (id, state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price, unit)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [snapId, r.state, r.district || null, r.market, r.commodity, r.variety, r.grade, r.arrival_date, r.min_price, r.max_price, r.modal_price, r.unit]
              ).catch(() => {});
            }

            return res.json({
              records: normalizedRecords,
              total: normalizedRecords.length,
              sourceUpdatedAt: json.updated_date || json.updated || new Date().toISOString(),
              fetchedAt: new Date().toISOString(),
              source: 'data.gov.in / AGMARKNET'
            });
          }
        }
      } else {
        console.warn(`[MANDI PROXY WARNING] data.gov.in returned HTTP ${response.status}. Using local market fallback.`);
      }
    } catch (e) {
      console.warn('[MANDI PROXY FETCH WARNING]', e.message);
    }
  }

  // Fallback: DB Archive
  try {
    let sql = 'SELECT * FROM market_price_snapshots WHERE LOWER(commodity) = LOWER($1) AND LOWER(state) = LOWER($2)';
    const queryParams = [commodity, state];

    if (district) {
      queryParams.push(district);
      sql += ` AND LOWER(district) = LOWER($${queryParams.length})`;
    }
    if (market) {
      queryParams.push(market);
      sql += ` AND LOWER(market) = LOWER($${queryParams.length})`;
    }
    sql += ' ORDER BY arrival_date DESC';

    const dbRes = await db.query(sql, queryParams);
    if (dbRes.rows && dbRes.rows.length > 0) {
      return res.json({
        records: dbRes.rows,
        total: dbRes.rows.length,
        sourceUpdatedAt: dbRes.rows[0].fetched_at || new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        source: 'KrishiSetu Market Archive'
      });
    }
  } catch (err) {
    console.warn('[DB ARCHIVE FALLBACK ERROR]', err.message);
  }

  // Final Demo Fallback
  const fallbackRecords = getDemoMarketRecords(commodity, state);
  // Asynchronously seed fallback records into snapshots so history endpoints work
  for (const r of fallbackRecords) {
    const snapId = `SNAP_${r.state}_${r.market}_${r.commodity}_${r.arrival_date}`;
    db.query(
      `INSERT INTO market_price_snapshots (id, state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price, unit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [snapId, r.state, r.district, r.market, r.commodity, r.variety, r.grade, r.arrival_date, r.min_price, r.max_price, r.modal_price, r.unit]
    ).catch(() => {});
  }

  return res.json({
    records: fallbackRecords,
    total: fallbackRecords.length,
    sourceUpdatedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    source: 'KrishiSetu Market Engine (Development Fallback)'
  });
});

// HISTORICAL PRICE TIME-SERIES ENDPOINT
app.get('/api/market-prices/history', async (req, res) => {
  const { commodity = 'Onion', market, state = 'Maharashtra' } = req.query;

  try {
    let sql = 'SELECT * FROM market_price_snapshots WHERE LOWER(commodity) = LOWER($1)';
    const params = [commodity];

    if (market) {
      params.push(market);
      sql += ` AND LOWER(market) = LOWER($${params.length})`;
    } else if (state) {
      params.push(state);
      sql += ` AND LOWER(state) = LOWER($${params.length})`;
    }

    sql += ' ORDER BY arrival_date ASC, fetched_at ASC';

    let result = await db.query(sql, params);
    let rows = result.rows || [];

    if (!rows.length) {
      rows = getDemoMarketRecords(commodity, state);
    }

    res.json({
      commodity,
      market: market || 'All Mandis',
      state,
      snapshots: rows
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to retrieve historical snapshots', detail: e.message });
  }
});

// MULTI-MANDI COMPARISON ENDPOINT
app.get('/api/market-prices/compare', async (req, res) => {
  const { commodity = 'Onion', state = 'Maharashtra' } = req.query;

  try {
    const sql = `SELECT * FROM market_price_snapshots 
                 WHERE LOWER(commodity) = LOWER($1) AND LOWER(state) = LOWER($2)
                 ORDER BY arrival_date DESC`;
    const result = await db.query(sql, [commodity, state]);
    
    let rows = result.rows || [];
    if (!rows.length) {
      rows = getDemoMarketRecords(commodity, state);
    }

    const marketMap = {};
    for (const r of rows) {
      if (!marketMap[r.market]) {
        marketMap[r.market] = r;
      }
    }

    res.json({
      commodity,
      state,
      comparison: Object.values(marketMap)
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to retrieve mandi comparison data', detail: e.message });
  }
});

// Centralized safe error handler
app.use(errorHandler);

module.exports = app;

if (require.main === module) {
  initDb().then(() => {
    app.listen(PORT, () => {
      console.log(`KrishiSetu Secure Server running at http://localhost:${PORT}`);
    });
  }).catch(err => {
    console.error('Failed to initialize database:', err);
    app.listen(PORT, () => {
      console.log(`KrishiSetu Server running with fallback at http://localhost:${PORT}`);
    });
  });
}
