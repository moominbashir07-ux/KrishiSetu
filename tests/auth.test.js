const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/db');
const { JWT_SECRET } = require('../middleware/auth');

test('Auth Layer - User Signup & Authentication', async (t) => {
  await db.initDb();

  const testUser = {
    id: 'U_TEST_' + Date.now(),
    name: 'Ramesh Farmer',
    contact: 'ramesh_' + Date.now() + '@farm.org',
    password: 'securepassword123',
    role: 'seller'
  };

  await t.test('creates user with hashed password', async () => {
    const passwordHash = await bcrypt.hash(testUser.password, 10);
    await db.query(
      'INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
      [testUser.id, testUser.name, testUser.contact, passwordHash, testUser.role]
    );

    const res = await db.query('SELECT * FROM users WHERE id = $1', [testUser.id]);
    assert.equal(res.rows.length, 1);
    const user = res.rows[0];
    assert.equal(user.name, testUser.name);
    assert.notEqual(user.password_hash, testUser.password, 'Password must be hashed');

    const isValid = await bcrypt.compare(testUser.password, user.password_hash);
    assert.ok(isValid, 'Password hash should match original password');
  });

  await t.test('generates valid JWT token', async () => {
    const token = jwt.sign({ id: testUser.id, role: testUser.role }, JWT_SECRET);
    assert.ok(token);

    const decoded = jwt.verify(token, JWT_SECRET);
    assert.equal(decoded.id, testUser.id);
    assert.equal(decoded.role, testUser.role);
  });

  await t.test('validates email formats correctly', () => {
    const { isValidEmail } = require('../middleware/validate');
    assert.equal(isValidEmail('farmer@gmail.com'), true);
    assert.equal(isValidEmail('test.user@domain.org'), true);
    assert.equal(isValidEmail('abc'), false);
    assert.equal(isValidEmail('abc@'), false);
    assert.equal(isValidEmail('abc@gmail'), false);
    assert.equal(isValidEmail('@gmail.com'), false);
    assert.equal(isValidEmail('test..user@gmail.com'), false);
  });
});
