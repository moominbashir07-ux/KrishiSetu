const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../server');
const { initDb } = require('../db/db');

let server = null;
let testPort = 0;

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${testPort}${path}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    }).on('error', reject);
  });
}

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

function normalizePriceToKg(priceInQuintal, unit = 'quintal') {
  const price = parseMandiPrice(priceInQuintal);
  if (price === null) return null;
  const u = String(unit || 'quintal').toLowerCase();
  if (u.includes('kg') || u.includes('kilogram')) return price;
  if (u.includes('quintal') || u.includes('100 kg') || u.includes('qtl')) return price / 100;
  if (u.includes('ton') || u.includes('tonne')) return price / 1000;
  return price / 100;
}

test('KrishiSetu — Mandi State/District Filtering & Price Accuracy Suite', async (t) => {
  await t.test('setup test server listener', async () => {
    await initDb();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        testPort = server.address().port;
        resolve();
      });
    });
  });

  await t.test('safely parses string and numeric Mandi prices', () => {
    assert.equal(parseMandiPrice('2500'), 2500);
    assert.equal(parseMandiPrice('₹2200.50'), 2200.50);
    assert.equal(parseMandiPrice(1800), 1800);
    assert.equal(parseMandiPrice('0'), null);
    assert.equal(parseMandiPrice('NA'), null);
    assert.equal(parseMandiPrice(null), null);
    assert.equal(parseMandiPrice(undefined), null);
  });

  await t.test('normalizes AGMARKNET ₹/quintal price to ₹/kg correctly once', () => {
    assert.equal(normalizePriceToKg('2200', 'quintal'), 22);
    assert.equal(normalizePriceToKg(3500, 'quintal'), 35);
    assert.equal(normalizePriceToKg('15', 'kg'), 15);
    assert.equal(normalizePriceToKg('0', 'quintal'), null);
  });

  await t.test('GET /api/market-prices returns state-specific mandi records for Maharashtra', async () => {
    const res = await makeRequest('/api/market-prices?commodity=Onion&state=Maharashtra');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.records));
    assert.ok(res.data.records.length > 0);
    assert.equal(res.data.records[0].state, 'Maharashtra');
    assert.ok(res.data.records.every(r => r.state === 'Maharashtra'), 'All records must belong to Maharashtra');
  });

  await t.test('GET /api/market-prices returns state-specific mandi records for Delhi without cross-state data', async () => {
    const res = await makeRequest('/api/market-prices?commodity=Onion&state=Delhi');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.records));
    assert.ok(res.data.records.length > 0);
    assert.equal(res.data.records[0].state, 'Delhi');
    assert.ok(res.data.records.every(r => r.state === 'Delhi'), 'All records must belong to Delhi');
    assert.ok(!res.data.records.some(r => r.market.includes('Lasalgaon')), 'Maharashtra mandis must NOT appear in Delhi');
  });

  await t.test('GET /api/market-prices with district filter returns district-specific records', async () => {
    const res = await makeRequest('/api/market-prices?commodity=Onion&state=Maharashtra&district=Nashik');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.records));
    assert.ok(res.data.records.length > 0);
    assert.ok(res.data.records.every(r => r.district === 'Nashik'), 'All records must belong to Nashik district');
  });

  await t.test('GET /api/market-prices returns clear empty state message for unsupported state', async () => {
    const res = await makeRequest('/api/market-prices?commodity=Onion&state=Goa');
    assert.equal(res.status, 200);
    assert.equal(res.data.records.length, 0);
    assert.ok(res.data.message.includes('No mandi price data available for Goa'), 'Must return clean error message');
  });

  await t.test('Calculates 3 distinguishable price series (min, modal, max) in ₹/kg', () => {
    const records = [
      { min_price: 2000, modal_price: 2500, max_price: 3000, arrival_date: '2026-08-20' },
      { min_price: 2200, modal_price: 2700, max_price: 3200, arrival_date: '2026-08-21' }
    ];

    const series = records.map(r => ({
      minKg: r.min_price / 100,
      modalKg: r.modal_price / 100,
      maxKg: r.max_price / 100
    }));

    assert.equal(series[0].minKg, 20);
    assert.equal(series[0].modalKg, 25);
    assert.equal(series[0].maxKg, 30);
    assert.ok(series[0].minKg < series[0].modalKg && series[0].modalKg < series[0].maxKg);
  });

  await t.test('teardown test server listener', async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
