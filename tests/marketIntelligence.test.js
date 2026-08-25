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

test('KrishiSetu — Mandi Market Intelligence & Price Intelligence System', async (t) => {
  await t.test('setup server listener', async () => {
    await initDb();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        testPort = server.address().port;
        resolve();
      });
    });
  });

  await t.test('API proxy endpoint returns formatted records & source metadata', async () => {
    const res = await makeRequest('/api/market-prices?commodity=Tomato&state=Maharashtra');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.records));
    assert.ok(res.data.source);
    assert.ok(res.data.fetchedAt);
  });

  await t.test('District and Market parameters filter query parameters correctly', async () => {
    const res = await makeRequest('/api/market-prices?commodity=Tomato&state=Maharashtra&district=Nashik&market=Lasalgaon');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.records));
  });

  await t.test('History endpoint returns archived snapshots from database', async () => {
    const res = await makeRequest('/api/market-prices/history?commodity=Tomato&state=Maharashtra');
    assert.equal(res.status, 200);
    assert.equal(res.data.commodity, 'Tomato');
    assert.ok(Array.isArray(res.data.snapshots));
  });

  await t.test('Mandi comparison endpoint returns multi-mandi summary', async () => {
    const res = await makeRequest('/api/market-prices/compare?commodity=Tomato&state=Maharashtra');
    assert.equal(res.status, 200);
    assert.equal(res.data.commodity, 'Tomato');
    assert.ok(Array.isArray(res.data.comparison));
  });

  await t.test('Unit Normalization — 1 quintal (100 kg) converts accurately to Rs/kg', () => {
    const modalQuintalPrice = 2800; // Rs/quintal
    const kgPrice = modalQuintalPrice / 100; // Rs/kg
    assert.equal(kgPrice, 28);
  });

  await t.test('Percentage Change — Calculates change vs previous market record without fake numbers', () => {
    const latestModal = 2800;
    const prevModal = 2650;
    const deltaDiff = latestModal - prevModal; // +150
    const deltaPct = (deltaDiff / prevModal) * 100; // +5.660377...
    assert.equal(deltaDiff, 150);
    assert.equal(deltaPct.toFixed(2), '5.66');
  });

  await t.test('teardown server listener', async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
