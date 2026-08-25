const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const db = require('../db/db');
const OtpService = require('../services/otpService');

test('EmailJS OTP Integration & Password Reset Flow', async (t) => {
  await db.initDb();

  process.env.EMAIL_OTP_PROVIDER = 'emailjs';
  process.env.EMAILJS_PUBLIC_KEY = 'czyv3jAfR0Ie75oKe';
  process.env.EMAILJS_SERVICE_ID = 'service_9kbwben';
  process.env.EMAILJS_TEMPLATE_ID = 'template_2xxvycw';

  const testEmail = 'emailjs_test_' + Date.now() + '@example.com';
  let generatedOtpCode = null;

  await t.test('generates, hashes, and prepares EmailJS OTP payload', async () => {
    const originalFetch = global.fetch;
    let emailJsPayload = null;

    global.fetch = async (url, options) => {
      if (url.includes('api.emailjs.com')) {
        emailJsPayload = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          text: async () => 'OK'
        };
      }
      return originalFetch(url, options);
    };

    try {
      const res = await OtpService.generateAndSendOtp({
        contact: testEmail,
        purpose: 'email_verification',
        userName: 'Test Farmer'
      });

      assert.equal(res.message, 'Verification OTP sent successfully.');
      assert.equal(res.expiresInSeconds, 600);

      // Verify DB snapshot
      const dbRes = await db.query(
        'SELECT * FROM otps WHERE contact = $1 ORDER BY created_at DESC LIMIT 1',
        [testEmail]
      );
      assert.equal(dbRes.rows.length, 1);
      const record = dbRes.rows[0];
      assert.ok(record.otp_hash, 'OTP hash must be stored');
      assert.notEqual(record.otp_hash.length, 6, 'Plain text OTP must never be stored in DB');

      // Verify intercepted EmailJS payload
      assert.ok(emailJsPayload);
      assert.equal(emailJsPayload.service_id, 'service_9kbwben');
      assert.equal(emailJsPayload.template_id, 'template_2xxvycw');
      assert.equal(emailJsPayload.user_id, 'czyv3jAfR0Ie75oKe');
      assert.equal(emailJsPayload.template_params.to_email, testEmail);
      assert.ok(emailJsPayload.template_params.otp);
      assert.equal(emailJsPayload.template_params.otp.length, 6);

      generatedOtpCode = emailJsPayload.template_params.otp;
    } finally {
      global.fetch = originalFetch;
    }
  });

  await t.test('enforces 60-second cooldown rate limit on resend', async () => {
    await assert.rejects(
      async () => {
        await OtpService.generateAndSendOtp({
          contact: testEmail,
          purpose: 'email_verification'
        });
      },
      (err) => {
        assert.equal(err.statusCode, 429);
        assert.ok(err.message.includes('60 seconds'));
        return true;
      }
    );
  });

  await t.test('verifies valid EmailJS OTP code', async () => {
    assert.ok(generatedOtpCode);
    const res = await OtpService.verifyOtp({
      contact: testEmail,
      purpose: 'email_verification',
      otp: generatedOtpCode
    });
    assert.equal(res.valid, true);
  });

  await t.test('prevents reuse of already verified OTP code', async () => {
    await assert.rejects(
      async () => {
        await OtpService.verifyOtp({
          contact: testEmail,
          purpose: 'email_verification',
          otp: generatedOtpCode
        });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });
});
