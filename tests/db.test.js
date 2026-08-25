const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/db');

test('Database Layer - Initialization and Queries', async (t) => {
  await t.test('initializes database engine cleanly', async () => {
    await db.initDb();
    // Test basic query
    const res = await db.query('SELECT 1 as val');
    assert.ok(res.rows, 'Query result should contain rows array');
  });

  await t.test('executes transaction with rollback safety', async () => {
    try {
      await db.withTransaction(async (client) => {
        await client.query('SELECT 1');
        throw new Error('Simulated transaction failure');
      });
      assert.fail('Transaction should have thrown error');
    } catch (err) {
      assert.equal(err.message, 'Simulated transaction failure');
    }
  });
});
