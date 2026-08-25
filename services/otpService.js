const crypto = require('crypto');
const db = require('../db/db');

function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

class OtpService {
  static async generateAndSendOtp({ userId = null, contact, purpose = 'signup', userName = null }) {
    const normalizedContact = String(contact).trim().toLowerCase();

    // 1. Check resend cooldown (60 seconds)
    const recentOtp = await db.query(
      `SELECT created_at FROM otps 
       WHERE contact = $1 AND purpose = $2 AND created_at > (CURRENT_TIMESTAMP - INTERVAL '60 seconds')
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedContact, purpose]
    );

    if (recentOtp.rows.length > 0) {
      const err = new Error('Please wait 60 seconds before requesting another OTP.');
      err.statusCode = 429;
      throw err;
    }

    // 2. Generate secure 6-digit OTP
    const otpCode = String(crypto.randomInt(100000, 999999));
    const otpHash = hashOtp(otpCode);
    const otpId = 'OTP_' + Date.now() + Math.random().toString(36).substring(2, 6);

    // 3. Expiration time: 10 minutes from now
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // 4. Save to database
    await db.query(
      `INSERT INTO otps (id, user_id, contact, otp_hash, purpose, expires_at, attempt_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [otpId, userId, normalizedContact, otpHash, purpose, expiresAt, 0]
    );

    const provider = process.env.EMAIL_OTP_PROVIDER || 'dev';

    // 5. Send via EmailJS API or Development Logging
    if (provider === 'emailjs') {
      await OtpService.sendEmailJsOtp({
        contact: normalizedContact,
        otpCode,
        purpose,
        userName
      });
    } else {
      if (process.env.NODE_ENV === 'production' && provider !== 'dev') {
        const err = new Error('Production email OTP service is not configured.');
        err.statusCode = 500;
        throw err;
      }
      if (process.env.NODE_ENV === 'development' || provider === 'dev') {
        console.log(`\n==================================================`);
        console.log(`[DEV OTP SERVICE] OTP Code for ${normalizedContact} [${purpose.toUpperCase()}]: ${otpCode}`);
        console.log(`==================================================\n`);
      }
    }

    return {
      message: 'Verification OTP sent successfully.',
      expiresInSeconds: 600,
      otp: process.env.NODE_ENV === 'test' ? otpCode : undefined
    };
  }

  static async sendEmailJsOtp({ contact, otpCode, purpose, userName }) {
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const templateId = process.env.EMAILJS_TEMPLATE_ID;

    if (!publicKey || !serviceId || !templateId) {
      if (process.env.NODE_ENV === 'production') {
        const err = new Error('EmailJS integration credentials missing in environment.');
        err.statusCode = 500;
        throw err;
      }
      console.warn('[OTP SERVICE WARNING] Missing EmailJS env variables in dev. Logging to console.');
      console.log(`[DEV OTP SERVICE] OTP Code for ${contact} [${purpose.toUpperCase()}]: ${otpCode}`);
      return;
    }

    const payload = {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
        to_email: contact,
        email: contact,
        recipient_email: contact,
        to_name: userName || contact.split('@')[0] || 'Valued User',
        user_name: userName || contact.split('@')[0] || 'Valued User',
        name: userName || contact.split('@')[0] || 'Valued User',
        otp: otpCode,
        otp_code: otpCode,
        code: otpCode,
        verification_code: otpCode,
        purpose: String(purpose).replace('_', ' ').toUpperCase(),
        expires_in: '10 minutes',
        app_name: 'KrishiSetu'
      }
    };

    const accessToken = process.env.EMAILJS_PRIVATE_KEY || process.env.EMAILJS_ACCESS_TOKEN;
    if (accessToken) {
      payload.accessToken = accessToken;
    }

    const originUrl = process.env.APP_URL || 'http://localhost:3000';

    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': originUrl,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[EMAILJS ERROR]', response.status, errorText);
        const err = new Error(`Failed to send email OTP (${response.status}). Please check recipient email.`);
        err.statusCode = 502;
        throw err;
      }

      console.log(`[OTP SERVICE] Successfully dispatched EmailJS OTP to ${contact}`);
    } catch (err) {
      if (err.statusCode) throw err;
      console.error('[EMAILJS FETCH ERROR]', err.message);
      const deliveryErr = new Error('Unable to reach email delivery service. Please try again later.');
      deliveryErr.statusCode = 502;
      throw deliveryErr;
    }
  }

  static async verifyOtp({ contact, purpose, otp }) {
    const normalizedContact = String(contact).trim().toLowerCase();
    const inputHash = hashOtp(otp);

    // 1. Fetch latest unverified OTP for contact and purpose
    const otpRes = await db.query(
      `SELECT * FROM otps 
       WHERE contact = $1 AND purpose = $2 AND verified_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedContact, purpose]
    );

    if (!otpRes.rows.length) {
      const err = new Error('No OTP request found for this contact. Please request a new OTP.');
      err.statusCode = 400;
      throw err;
    }

    const otpRecord = otpRes.rows[0];

    // 2. Check expiration
    if (new Date(otpRecord.expires_at) < new Date()) {
      const err = new Error('OTP has expired. Please request a new OTP.');
      err.statusCode = 400;
      throw err;
    }

    // 3. Check attempt limit
    const attempts = Number(otpRecord.attempt_count || 0) + 1;
    await db.query('UPDATE otps SET attempt_count = $1 WHERE id = $2', [attempts, otpRecord.id]);

    if (attempts > 3) {
      const err = new Error('Too many failed attempts. This OTP has been invalidated. Please request a new OTP.');
      err.statusCode = 429;
      throw err;
    }

    // 4. Verify OTP hash
    if (otpRecord.otp_hash !== inputHash) {
      const err = new Error('Invalid OTP code. Please check and try again.');
      err.statusCode = 400;
      throw err;
    }

    // 5. Mark as verified
    await db.query('UPDATE otps SET verified_at = CURRENT_TIMESTAMP WHERE id = $1', [otpRecord.id]);

    return { valid: true, userId: otpRecord.user_id };
  }
}

module.exports = OtpService;
