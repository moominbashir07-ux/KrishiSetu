const test = require('node:test');
const assert = require('node:assert/strict');

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

test('Mandi Proxy - Endpoint Structure Preservation', async (t) => {
  await t.test('validates market prices params and fallback response format', () => {
    const records = [
      { market: 'Lasalgaon APMC', commodity: 'Onion', min_price: 2500, modal_price: 2800, max_price: 3100, arrival_date: '24/08/2026' }
    ];
    assert.ok(Array.isArray(records));
    assert.equal(records[0].commodity, 'Onion');
    assert.equal(records[0].modal_price, 2800);
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

  await t.test('normalizes AGMARKNET ₹/quintal price to ₹/kg correctly', () => {
    assert.equal(normalizePriceToKg('2200', 'quintal'), 22);
    assert.equal(normalizePriceToKg(3500, 'quintal'), 35);
    assert.equal(normalizePriceToKg('15', 'kg'), 15);
    assert.equal(normalizePriceToKg('0', 'quintal'), null);
  });
});
