const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/db');
const { JWT_SECRET, authenticateUser } = require('../middleware/auth');
const { validateAuthInput } = require('../middleware/validate');
const { otpLimiter } = require('../middleware/security');
const OtpService = require('../services/otpService');

const router = express.Router();

// SIGN UP ROUTE
router.post('/signup', validateAuthInput, async (req, res, next) => {
  const { name, contact, password, role = 'seller' } = req.body;
  const normalizedContact = contact.trim().toLowerCase();

  try {
    const existing = await db.query('SELECT id FROM users WHERE contact = $1', [normalizedContact]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ 
        error: 'An account with this phone/email already exists. Please Sign In instead.' 
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = 'U' + Date.now() + Math.random().toString(36).substring(2, 6);

    await db.withTransaction(async (client) => {
      await client.query(
        'INSERT INTO users (id, name, contact, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
        [userId, name.trim(), normalizedContact, passwordHash, role]
      );

      if (role === 'seller') {
        const sellerProfileId = 'SP' + Date.now();
        await client.query(
          'INSERT INTO seller_profiles (id, user_id, business_name, verification_status) VALUES ($1, $2, $3, $4)',
          [sellerProfileId, userId, `${name.trim()}'s Farm`, 'verified']
        );
      } else {
        const customerProfileId = 'CP' + Date.now();
        await client.query(
          'INSERT INTO customer_profiles (id, user_id) VALUES ($1, $2)',
          [customerProfileId, userId]
        );
      }
    });

    const userPayload = { id: userId, name: name.trim(), contact: normalizedContact, role };
    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: userPayload
    });
  } catch (err) {
    next(err);
  }
});

// SIGN IN ROUTE
router.post('/signin', async (req, res, next) => {
  const { contact, password } = req.body;
  if (!contact || !password) {
    return res.status(400).json({ error: 'Please enter your phone/email and password.' });
  }

  const normalizedContact = contact.trim().toLowerCase();

  try {
    const result = await db.query(
      'SELECT id, name, contact, password_hash, role FROM users WHERE contact = $1',
      [normalizedContact]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: 'No account found with these details. Please click Create Account to register.' 
      });
    }

    const user = result.rows[0];
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    const userPayload = { id: user.id, name: user.name, contact: user.contact, role: user.role };
    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Signed in successfully.',
      token,
      user: userPayload
    });
  } catch (err) {
    next(err);
  }
});

// SEND OTP ROUTE (RATE LIMITED)
router.post('/send-otp', otpLimiter, async (req, res, next) => {
  const { contact, name, purpose = 'email_verification' } = req.body;

  if (!contact || typeof contact !== 'string' || !contact.trim()) {
    return res.status(400).json({ error: 'Contact phone or email is required.' });
  }

  try {
    const result = await OtpService.generateAndSendOtp({ contact, purpose, userName: name });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// VERIFY OTP ROUTE
router.post('/verify-otp', async (req, res, next) => {
  const { contact, purpose = 'email_verification', otp } = req.body;

  if (!contact || !otp) {
    return res.status(400).json({ error: 'Contact and OTP code are required.' });
  }

  try {
    const result = await OtpService.verifyOtp({ contact, purpose, otp });
    res.json({ message: 'OTP verified successfully.', verified: result.valid });
  } catch (err) {
    next(err);
  }
});

// FORGOT PASSWORD REQUEST
router.post('/forgot-password', otpLimiter, async (req, res, next) => {
  const { contact } = req.body;
  if (!contact || typeof contact !== 'string' || !contact.trim()) {
    return res.status(400).json({ error: 'Contact phone or email is required.' });
  }

  const normalizedContact = contact.trim().toLowerCase();

  try {
    // Security check: do not reveal whether account exists
    const userRes = await db.query('SELECT id, name FROM users WHERE contact = $1', [normalizedContact]);
    if (userRes.rows.length > 0) {
      await OtpService.generateAndSendOtp({
        userId: userRes.rows[0].id,
        contact: normalizedContact,
        purpose: 'password_reset',
        userName: userRes.rows[0].name
      });
    }

    res.json({
      message: 'If an account exists for this contact, a verification code has been sent.'
    });
  } catch (err) {
    next(err);
  }
});

// RESET PASSWORD WITH VERIFIED OTP
router.post('/reset-password', async (req, res, next) => {
  const { contact, otp, newPassword } = req.body;

  if (!contact || !otp || !newPassword) {
    return res.status(400).json({ error: 'Contact, OTP, and new password are required.' });
  }

  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  const normalizedContact = contact.trim().toLowerCase();

  try {
    // Verify OTP first
    await OtpService.verifyOtp({ contact: normalizedContact, purpose: 'password_reset', otp });

    // Hash new password and update user
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE contact = $2',
      [passwordHash, normalizedContact]
    );

    res.json({ message: 'Password reset successfully. You can now sign in with your new password.' });
  } catch (err) {
    next(err);
  }
});

// SECURE ADMIN SEED / REGISTRATION ROUTE
router.post('/admin-seed', async (req, res, next) => {
  const { name, contact, password, bootstrapKey } = req.body;
  const expectedKey = process.env.ADMIN_BOOTSTRAP_KEY || 'krishisetu_admin_seed_secret_2026';

  if (!bootstrapKey || bootstrapKey !== expectedKey) {
    return res.status(403).json({ error: 'Forbidden. Invalid admin bootstrap authorization key.' });
  }

  if (!name || !contact || !password || password.length < 6) {
    return res.status(400).json({ error: 'Name, contact, and valid password (min 6 chars) are required.' });
  }

  const normalizedContact = contact.trim().toLowerCase();

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const adminId = 'U_ADMIN_' + Date.now();

    await db.query(
      `INSERT INTO users (id, name, contact, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (contact) DO UPDATE SET role = 'admin', password_hash = EXCLUDED.password_hash`,
      [adminId, name.trim(), normalizedContact, passwordHash, 'admin']
    );

    const userPayload = { id: adminId, name: name.trim(), contact: normalizedContact, role: 'admin' };
    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Admin account created successfully.',
      token,
      user: userPayload
    });
  } catch (err) {
    next(err);
  }
});

// GET CURRENT AUTHENTICATED USER
router.get('/me', authenticateUser, (req, res) => {
  res.json({ user: req.user });
});

// GET USER PROFILE
router.get('/profile', authenticateUser, async (req, res, next) => {
  try {
    const userRes = await db.query('SELECT id, name, contact, role, created_at FROM users WHERE id = $1', [req.user.id]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'User not found.' });

    const user = userRes.rows[0];
    let profile = {};

    if (user.role === 'seller') {
      const sp = await db.query('SELECT * FROM seller_profiles WHERE user_id = $1', [user.id]);
      profile = sp.rows[0] || {};
    } else {
      const cp = await db.query('SELECT * FROM customer_profiles WHERE user_id = $1', [user.id]);
      profile = cp.rows[0] || {};
    }

    res.json({ user, profile });
  } catch (err) {
    next(err);
  }
});

// UPDATE USER PROFILE
router.get('/sellers/:id', async (req, res, next) => {
  try {
    const sellerRes = await db.query('SELECT id, name, contact, created_at FROM users WHERE id = $1 AND role = \'seller\'', [req.params.id]);
    if (!sellerRes.rows.length) return res.status(404).json({ error: 'Seller not found.' });

    const seller = sellerRes.rows[0];
    const spRes = await db.query('SELECT * FROM seller_profiles WHERE user_id = $1', [seller.id]);
    const profile = spRes.rows[0] || {};

    const prodRes = await db.query('SELECT * FROM products WHERE seller_id = $1 AND status != \'inactive\'', [seller.id]);

    res.json({
      seller: {
        id: seller.id,
        name: seller.name,
        contact: seller.contact,
        businessName: profile.business_name || `${seller.name}'s Farm`,
        description: profile.description || 'Verified KrishiSetu Local Producer',
        verificationStatus: profile.verification_status || 'verified',
        createdAt: seller.created_at
      },
      products: prodRes.rows
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
