const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/db');

function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 8) return false;
  const weakList = ['password', 'password123', '12345678', 'qwerty', 'abcdefgh', 'admin123', 'krishisetu'];
  if (weakList.includes(password.toLowerCase())) return false;
  
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[@$!%*?&_\-#.]/.test(password);

  return hasUpper && hasLower && hasDigit && hasSpecial;
}

test('Strong Password Policy & Platform Feedback Submission System', async (t) => {
  await db.initDb();

  await t.test('rejects obvious weak and short passwords', () => {
    assert.equal(isStrongPassword('password123'), false, 'password123 must be rejected');
    assert.equal(isStrongPassword('qwerty'), false, 'qwerty must be rejected');
    assert.equal(isStrongPassword('12345678'), false, '12345678 must be rejected');
    assert.equal(isStrongPassword('Short1!'), false, 'Short1! (6 chars) must be rejected');
    assert.equal(isStrongPassword('nouppercase1!'), false, 'Missing uppercase must be rejected');
    assert.equal(isStrongPassword('NOLOWERCASE1!'), false, 'Missing lowercase must be rejected');
    assert.equal(isStrongPassword('NoSpecialNumber'), false, 'Missing special char must be rejected');
  });

  await t.test('accepts strong compliant passwords', () => {
    assert.equal(isStrongPassword('P@ssword123!'), true, 'P@ssword123! must be accepted');
    assert.equal(isStrongPassword('KrishiSetu#2026'), true, 'KrishiSetu#2026 must be accepted');
  });

  await t.test('persists platform feedback submissions cleanly in database', async () => {
    const feedbackId = 'FB_TEST_' + Date.now();
    const userId = 'U_FB_' + Date.now();
    const message = 'The Mandi Rates charts and direct checkout are extremely useful!';

    await db.query(
      `INSERT INTO feedback (id, user_id, user_name, user_email, rating, category, message, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')`,
      [feedbackId, userId, 'Ramesh Farmer', 'ramesh@test.com', 5, 'Website', message]
    );

    const res = await db.query('SELECT * FROM feedback WHERE id = $1', [feedbackId]);
    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].rating, 5);
    assert.equal(res.rows[0].category, 'Website');
    assert.equal(res.rows[0].message, message);
  });
});
