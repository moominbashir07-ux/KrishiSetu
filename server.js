const express = require('express');
const path = require('path');
require('dotenv').config();

// Production environment defaults for Render service
if (!process.env.APP_URL) {
  process.env.APP_URL = process.env.RENDER_EXTERNAL_URL || 'https://krishisetu-dj4j.onrender.com';
}
if (!process.env.STORAGE_PROVIDER) {
  process.env.STORAGE_PROVIDER = 'lambda';
}
if (!process.env.AWS_LAMBDA_STORAGE_URL) {
  process.env.AWS_LAMBDA_STORAGE_URL = 'https://rwaiukrlq3cnacgkybwrbrtmoa0bljdm.lambda-url.ap-south-1.on.aws/';
}
if (!process.env.AWS_S3_MEDIA_BUCKET) {
  process.env.AWS_S3_MEDIA_BUCKET = 'krishisetu-evidence-2026';
}
if (!process.env.AWS_REGION) {
  process.env.AWS_REGION = 'ap-south-1';
}

const db = require('./db/db');
const { initDb } = db;
const { apiLimiter, securityHeaders, corsOptions, errorHandler, requestIdMiddleware, requestLogger } = require('./middleware/security');

const authRouter = require('./routes/auth');
const productsRouter = require('./routes/products');
const cartRouter = require('./routes/cart');
const ordersRouter = require('./routes/orders');
const sellerVerificationRouter = require('./routes/sellerVerification');
const adminRouter = require('./routes/admin');
const reviewsRouter = require('./routes/reviews');
const feedbackRouter = require('./routes/feedback');
const notificationsRouter = require('./routes/notifications');
const { storageRouter } = require('./routes/storage');
const { disputesRouter } = require('./routes/disputes');
const { aiRouter } = require('./routes/ai');

const app = express();
// Enable single-hop reverse proxy trust for AWS App Runner, CloudFront, and ALB
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.DATA_GOV_IN_API_KEY || '';
const RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070';
const API_BASE = `https://api.data.gov.in/resource/${RESOURCE_ID}`;

// Apply security middleware, correlation ID, logging & parsers
app.use(requestIdMiddleware);
app.use(requestLogger);
app.use(securityHeaders);
app.use(corsOptions);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Apply rate limiter to API routes
app.use('/api', apiLimiter);

// Protect against serving sensitive backend files and directories
const SENSITIVE_STATIC_PATTERNS = [
  /^\/(db|routes|middleware|config|services|tests|scratch|\.git|node_modules)(\/|$)/i,
  /^\/(server\.js|package\.json|package-lock\.json|tsconfig\.json)$/i,
  /\.(sql|env|env\..*|json|ts|md|log)$/i
];

app.use((req, res, next) => {
  if (SENSITIVE_STATIC_PATTERNS.some(pattern => pattern.test(req.path))) {
    return res.status(404).send('Not Found');
  }
  next();
});

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const { validateEnv } = require('./config/env');
const envStatus = validateEnv({ silent: process.env.NODE_ENV === 'test' });
if (process.env.NODE_ENV === 'production' && !envStatus.valid) {
  console.error('[FATAL STARTUP ERROR] Production environment validation failed:');
  envStatus.missing.forEach(m => console.error(`  - ${m}`));
  process.exit(1);
}

// Production Health Check Endpoint (Liveness Probe)
app.get(['/api/health', '/health'], async (req, res) => {
  try {
    const isConnected = db.isPgConnected();
    const isProduction = process.env.NODE_ENV === 'production';
    let dbStatus = isConnected ? 'connected' : (isProduction ? 'disconnected' : 'connected (fallback)');

    if (isConnected) {
      const ping = await db.pingDb();
      if (!ping.connected) {
        dbStatus = isProduction ? 'disconnected' : 'connected (fallback)';
      }
    }

    const isDegraded = isProduction && dbStatus === 'disconnected';
    const statusCode = isDegraded ? 503 : 200;

    let dbUser = null;
    let dbHost = null;
    if (process.env.DATABASE_URL) {
      try {
        const u = new URL(process.env.DATABASE_URL);
        dbUser = u.username;
        dbHost = u.host;
      } catch (e) {
        dbUser = 'malformed';
      }
    }

    res.status(statusCode).json({
      status: isDegraded ? 'degraded' : 'ok',
      database: dbStatus,
      hasDbUrl: Boolean(process.env.DATABASE_URL),
      dbUser,
      dbHost,
      dbError: db.getLastPgError ? db.getLastPgError() : null,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      requestId: req.id || req.headers['x-request-id'] || null
    });
  } catch (e) {
    res.status(503).json({
      status: 'degraded',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      requestId: req.id || req.headers['x-request-id'] || null
    });
  }
});

// Production Readiness Endpoint (Readiness Probe with Dependency Checks)
app.get(['/api/ready', '/ready'], async (req, res) => {
  try {
    const isConnected = db.isPgConnected();
    const isProduction = process.env.NODE_ENV === 'production';
    let dbStatus = isConnected ? 'ok' : (isProduction ? 'disconnected' : 'ok (fallback)');
    if (isConnected) {
      const ping = await db.pingDb();
      if (!ping.connected) {
        dbStatus = isProduction ? 'disconnected' : 'ok (fallback)';
      }
    }

    // Storage check
    const storageProvider = (process.env.STORAGE_PROVIDER || '').toLowerCase();
    const storageStatus = storageProvider === 's3'
      ? (process.env.AWS_S3_MEDIA_BUCKET ? 'ok' : 'unconfigured')
      : 'ok';

    // AI advisor check
    let aiStatus = 'configured';
    try {
      const { BedrockAdvisorService } = require('./services/ai/bedrockAdvisorService');
      const aiService = new BedrockAdvisorService();
      const status = aiService.getProviderStatus();
      if (status.activeProvider === 'aws' && !status.available) {
        aiStatus = 'degraded';
      } else if (status.activeProvider === 'unavailable') {
        aiStatus = 'unconfigured';
      }
    } catch {
      aiStatus = 'unconfigured';
    }

    // Market data check
    let marketDataStatus = 'available';
    try {
      const { MandiIntelligenceService } = require('./services/market/mandiIntelligenceService');
      const mandiService = new MandiIntelligenceService();
      const status = mandiService.getProviderStatus();
      marketDataStatus = status.activeProvider ? 'available' : 'unavailable';
    } catch {
      marketDataStatus = 'unavailable';
    }

    const checks = {
      database: dbStatus,
      storage: storageStatus,
      ai: aiStatus,
      marketData: marketDataStatus
    };

    const isNotReady = isProduction && dbStatus === 'disconnected';
    const statusCode = isNotReady ? 503 : 200;

    res.status(statusCode).json({
      status: isNotReady ? 'not_ready' : 'ready',
      checks,
      timestamp: new Date().toISOString(),
      requestId: req.id || req.headers['x-request-id'] || null
    });
  } catch (err) {
    res.status(503).json({
      status: 'not_ready',
      checks: {
        database: 'error',
        storage: 'unknown',
        ai: 'unknown',
        marketData: 'unknown'
      },
      error: 'Readiness probe failed',
      timestamp: new Date().toISOString(),
      requestId: req.id || req.headers['x-request-id'] || null
    });
  }
});

// Register production backend API routes
app.use('/api/auth', authRouter);
app.get('/api/sellers/:id', (req, res, next) => {
  req.url = '/sellers/' + req.params.id;
  authRouter(req, res, next);
});
app.use('/api/products', productsRouter);
app.use('/api/cart', cartRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/seller/verification', sellerVerificationRouter);
app.use('/api/admin', adminRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/storage', storageRouter);
app.use('/api/disputes', disputesRouter);
app.use('/api/ai', aiRouter);

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

const STATE_DISTRICT_MARKETS = {
  'Maharashtra': {
    'Nashik': ['Lasalgaon APMC', 'Pimpalgaon APMC', 'Nashik Main APMC'],
    'Pune': ['Pune APMC', 'Manchar APMC', 'Junagarh APMC'],
    'Ahmednagar': ['Ahmednagar APMC', 'Rahuri APMC', 'Kopargaon APMC'],
    'Mumbai': ['Vashi APMC', 'Mumbai Central Mandi'],
    'Solapur': ['Solapur APMC', 'Barshi APMC'],
    'Nagpur': ['Nagpur APMC', 'Kalamna APMC']
  },
  'Delhi': {
    'Azadpur': ['Azadpur APMC', 'Azadpur Fruit & Veg Market'],
    'Ghazipur': ['Ghazipur Flower & Produce Mandi', 'Ghazipur APMC'],
    'Okhla': ['Okhla APMC Mandi'],
    'Najafgarh': ['Najafgarh APMC Mandi']
  },
  'Uttar Pradesh': {
    'Agra': ['Agra APMC', 'Fatehpur Sikri Mandi'],
    'Kanpur': ['Kanpur APMC', 'Chakeri Mandi'],
    'Lucknow': ['Lucknow APMC', 'Dubagga Mandi'],
    'Varanasi': ['Varanasi APMC', 'Rajatalab Mandi']
  },
  'Madhya Pradesh': {
    'Indore': ['Indore APMC', 'Choithram Mandi'],
    'Bhopal': ['Bhopal APMC', 'Karond Mandi'],
    'Ujjain': ['Ujjain APMC', 'Mahidpur Mandi'],
    'Neemuch': ['Neemuch APMC Mandi']
  },
  'Gujarat': {
    'Ahmedabad': ['Ahmedabad APMC', 'Vasna Mandi'],
    'Surat': ['Surat APMC', 'Navsari Mandi'],
    'Rajkot': ['Rajkot APMC', 'Gondal APMC'],
    'Vadodara': ['Sayajiganj APMC', 'Vadodara Mandi']
  },
  'Punjab': {
    'Ludhiana': ['Ludhiana APMC', 'Khanna Grain Market'],
    'Amritsar': ['Amritsar APMC', 'Bhagtanwala Mandi'],
    'Jalandhar': ['Jalandhar APMC', 'Maqsudan Mandi']
  },
  'Haryana': {
    'Karnal': ['Karnal APMC', 'Gharaunda Mandi'],
    'Ambala': ['Ambala City APMC', 'Ambala Cantt Mandi'],
    'Gurugram': ['Gurugram APMC', 'Farrukhnagar Mandi']
  },
  'Rajasthan': {
    'Jaipur': ['Jaipur APMC', 'Muhana Mandi'],
    'Jodhpur': ['Jodhpur APMC', 'Mandore Mandi'],
    'Kota': ['Kota Grain Mandi', 'Bunde APMC']
  },
  'Jammu & Kashmir': {
    'Srinagar': ['Parimpora APMC', 'Fruit Mandi Srinagar'],
    'Anantnag': ['Anantnag Fruit Mandi', 'Bijbehara Mandi'],
    'Baramulla': ['Sopore Fruit Mandi', 'Baramulla APMC']
  },
  'Karnataka': {
    'Bengaluru': ['Yeshwanthpur APMC', 'Binny Mill Mandi'],
    'Mysuru': ['Bandipalya APMC', 'Mysuru Mandi'],
    'Hubballi': ['Hubballi APMC Mandi']
  },
  'Tamil Nadu': {
    'Chennai': ['Koyambedu Wholesale Market', 'Madhavaram Mandi'],
    'Coimbatore': ['MGR Wholesale Market', 'Coimbatore APMC'],
    'Madurai': ['Mattuthavani Wholesale Market']
  },
  'Andhra Pradesh': {
    'Guntur': ['Guntur Mirchi Yard APMC', 'Tenali Mandi'],
    'Vijayawada': ['Kaleswara Rao Market', 'Vijayawada APMC']
  },
  'West Bengal': {
    'Kolkata': ['Koley Market Wholesale', 'Sealdah Mandi'],
    'Hooghly': ['Sheoraphuli APMC', 'Singur Mandi']
  }
};

const STATE_PRICE_FACTORS = {
  'Maharashtra': 1.0,
  'Delhi': 1.15,
  'Uttar Pradesh': 0.92,
  'Madhya Pradesh': 0.88,
  'Gujarat': 0.96,
  'Punjab': 0.90,
  'Haryana': 0.93,
  'Rajasthan': 0.95,
  'Jammu & Kashmir': 1.25,
  'Karnataka': 1.04,
  'Tamil Nadu': 1.08,
  'Andhra Pradesh': 0.97,
  'West Bengal': 1.02
};

function getDemoMarketRecords(commodity = 'Onion', state = 'Maharashtra', district = null) {
  const baseCommodityPrice = { Onion: 5760, Tomato: 2600, Potato: 2200, Wheat: 2900, Rice: 3200, Soybean: 5700, Cotton: 7200, Apple: 8500, Chilli: 6800 }[commodity] || 3000;
  
  const normStateKey = Object.keys(STATE_DISTRICT_MARKETS).find(s => s.toLowerCase() === String(state).toLowerCase());
  if (!normStateKey) return [];

  const stateFactor = STATE_PRICE_FACTORS[normStateKey] || 1.0;
  const basePrice = Math.round(baseCommodityPrice * stateFactor);
  const districtMap = STATE_DISTRICT_MARKETS[normStateKey];

  let targetEntries = [];
  if (district && String(district).trim()) {
    const normDistKey = Object.keys(districtMap).find(d => d.toLowerCase() === String(district).trim().toLowerCase());
    if (!normDistKey) return [];
    targetEntries = [[normDistKey, districtMap[normDistKey]]];
  } else {
    targetEntries = Object.entries(districtMap);
  }

  const records = [];
  for (const [distName, markets] of targetEntries) {
    for (let mIdx = 0; mIdx < markets.length; mIdx++) {
      const mName = markets[mIdx];
      for (let day = 0; day < 5; day++) {
        const arrDate = new Date(Date.now() - (day * 86400000)).toISOString().split('T')[0];
        const modalP = Math.round(basePrice + (mIdx * 110) - (day * 45));
        const minP = Math.round(modalP * 0.88);
        const maxP = Math.round(modalP * 1.12);

        records.push({
          market: mName,
          district: distName,
          state: normStateKey,
          commodity,
          variety: 'Standard Local',
          grade: 'Standard Quality',
          arrival_date: arrDate,
          min_price: minP,
          modal_price: modalP,
          max_price: maxP,
          unit: 'quintal'
        });
      }
    }
  }

  return records;
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
              district: r.district || r.market || district || '',
              market: r.market || 'APMC Market',
              commodity: r.commodity || commodity,
              variety: r.variety || 'Local',
              grade: r.grade || 'Standard Quality',
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
      }
    } catch (e) {
      console.warn('[MANDI PROXY FETCH WARNING]', e.message);
    }
  }

  // Fallback DB Archive
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

  // Realistic Demo Engine (STRICTLY ISOLATED IN-MEMORY — NO DB CONTAMINATION)
  const fallbackRecords = getDemoMarketRecords(commodity, state, district).map(r => {
    const now = new Date();
    const obs = new Date(r.arrival_date || now);
    const diffHours = (now.getTime() - obs.getTime()) / (1000 * 60 * 60);
    const freshnessStatus = diffHours <= 24 ? 'LIVE' : (diffHours <= 48 ? 'RECENT' : 'STALE');
    return {
      ...r,
      mandi: r.market,
      source: 'MOCK DATA — DEVELOPMENT ONLY',
      sourceResourceId: 'DEV_MOCK_ADAPTER',
      fetchedAt: now.toISOString(),
      freshnessStatus,
      dataFreshness: freshnessStatus,
      isMock: true
    };
  });

  if (!fallbackRecords.length) {
    return res.json({
      records: [],
      total: 0,
      sourceUpdatedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      message: district 
        ? `No mandi price data available for ${district} district in ${state}.`
        : `No mandi price data available for ${state}.`,
      source: 'MOCK DATA — DEVELOPMENT ONLY',
      isMock: true
    });
  }

  // NOTE: CONTAMINATION FIX — mock data is NEVER inserted into market_price_snapshots

  return res.json({
    records: fallbackRecords,
    total: fallbackRecords.length,
    sourceUpdatedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    source: 'MOCK DATA — DEVELOPMENT ONLY',
    isMock: true,
    warning: 'DEVELOPMENT MOCK DATA — NOT VERIFIED BY GOVERNMENT MANDI'
  });
});

// HISTORICAL PRICE TIME-SERIES ENDPOINT
app.get('/api/market-prices/history', async (req, res, next) => {
  const { commodity = 'Onion', market, state = 'Maharashtra', district } = req.query;

  try {
    let sql = 'SELECT * FROM market_price_snapshots WHERE LOWER(commodity) = LOWER($1)';
    const params = [commodity];

    if (market) {
      params.push(market);
      sql += ` AND LOWER(market) = LOWER($${params.length})`;
    } else if (state) {
      params.push(state);
      sql += ` AND LOWER(state) = LOWER($${params.length})`;
      if (district) {
        params.push(district);
        sql += ` AND LOWER(district) = LOWER($${params.length})`;
      }
    }

    sql += ' ORDER BY arrival_date ASC, fetched_at ASC';

    let result = await db.query(sql, params);
    let rows = result.rows || [];

    if (!rows.length) {
      rows = getDemoMarketRecords(commodity, state, district);
    }

    res.json({
      commodity,
      market: market || 'All Mandis',
      state,
      district: district || null,
      snapshots: rows
    });
  } catch (e) {
    next(e);
  }
});

// MULTI-MANDI COMPARISON ENDPOINT
app.get('/api/market-prices/compare', async (req, res, next) => {
  const { commodity = 'Onion', state = 'Maharashtra', district } = req.query;

  try {
    const { MandiIntelligenceService } = require('./services/market/mandiIntelligenceService');
    const mandiService = new MandiIntelligenceService();
    const compResult = await mandiService.compareMandis({
      commodity,
      state,
      district: district || null,
      dbClient: db
    });

    res.json({
      commodity: compResult.commodity,
      state: compResult.state,
      district: compResult.district,
      markets: compResult.markets,
      comparison: compResult.markets,
      summary: compResult.summary,
      status: compResult.status,
      message: compResult.message
    });
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: { code: e.code, message: e.message } });
    }
    next(e);
  }
});

// HISTORICAL TREND ANALYSIS ENDPOINT (1D, 7D, 1M, 1Y)
app.get('/api/market-prices/trend', async (req, res, next) => {
  const { commodity = 'Onion', state = 'Maharashtra', market, period = '7D' } = req.query;

  try {
    const { MandiIntelligenceService } = require('./services/market/mandiIntelligenceService');
    const mandiService = new MandiIntelligenceService();
    const trendResult = await mandiService.getTrendAnalysis({
      commodity,
      state,
      market: market || null,
      period,
      dbClient: db
    });

    res.json(trendResult);
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: { code: e.code, message: e.message } });
    }
    next(e);
  }
});

// EXPLICIT PRODUCTION ROUTE FOR /admin frontend dashboard (NO-CACHE FOR IMMEDIATE SPA RENDERING)
app.get(['/admin', '/admin/*'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// WILDCARD SPA FALLBACK FOR NON-API ROUTES
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 404 handler for unmatched API endpoints
app.use('/api/*', (req, res, next) => {
  const err = new Error(`API endpoint not found: ${req.method} ${req.originalUrl}`);
  err.status = 404;
  err.code = 'ENDPOINT_NOT_FOUND';
  next(err);
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
    console.error('Failed to initialize database:', err.message);
    if (process.env.NODE_ENV === 'production') {
      console.error('[FATAL STARTUP ERROR] Production database initialization failed.');
      process.exit(1);
    }
    app.listen(PORT, () => {
      console.log(`KrishiSetu Server running with fallback at http://localhost:${PORT}`);
    });
  });
}
