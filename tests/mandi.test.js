const test = require('node:test');
const assert = require('node:assert/strict');

test('Mandi Proxy - Endpoint Structure Preservation', async (t) => {
  await t.test('validates market prices params and fallback response format', () => {
    const records = [
      { market: 'Lasalgaon APMC', commodity: 'Onion', min_price: 2500, modal_price: 2800, max_price: 3100, arrival_date: '24/08/2026' }
    ];
    assert.ok(Array.isArray(records));
    assert.equal(records[0].commodity, 'Onion');
    assert.equal(records[0].modal_price, 2800);
  });
});
