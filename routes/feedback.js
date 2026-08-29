const express = require('express');
const db = require('../db/db');
const { authenticateUser, requireRole } = require('../middleware/auth');

const router = express.Router();

// SUBMIT PLATFORM FEEDBACK (AUTHENTICATED OR GUEST)
router.post('/', async (req, res, next) => {
  const { rating = 5, category = 'General', message, userName, userEmail } = req.body;

  const numRating = Number(rating);
  if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
    return res.status(400).json({ error: 'Feedback rating must be between 1 and 5 stars.' });
  }

  if (!message || typeof message !== 'string' || !message.trim() || message.trim().length < 5) {
    return res.status(400).json({ error: 'Feedback message must be at least 5 characters long.' });
  }

  const validCategories = ['Website', 'Seller', 'Buyer', 'Delivery', 'Payment', 'Mandi Rates', 'Bug', 'Other'];
  const catStr = validCategories.includes(category) ? category : 'Website';

  const feedbackId = 'FB_' + Date.now() + Math.random().toString(36).substring(2, 5);

  let userId = null;
  let name = userName || 'KrishiSetu User';
  let email = userEmail || '';

  // Extract auth user if header provided
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken');
      const { JWT_SECRET } = require('../middleware/auth');
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.id;
      const uRes = await db.query('SELECT name, contact FROM users WHERE id = $1', [userId]);
      if (uRes.rows.length) {
        name = uRes.rows[0].name;
        email = uRes.rows[0].contact;
      }
    } catch (e) {}
  }

  try {
    await db.query(
      `INSERT INTO feedback (id, user_id, user_name, user_email, rating, category, message, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')`,
      [feedbackId, userId, name, email, numRating, catStr, message.trim()]
    );

    res.status(201).json({
      message: 'Thank you for your feedback! The KrishiSetu team has received your submission.',
      feedbackId
    });
  } catch (err) {
    next(err);
  }
});

// GET ALL FEEDBACK (ADMIN ONLY)
router.get('/', authenticateUser, requireRole('admin'), async (req, res, next) => {
  const { status } = req.query;

  try {
    let sql = 'SELECT * FROM feedback';
    const params = [];
    if (status && ['new', 'reviewed', 'resolved'].includes(status)) {
      params.push(status);
      sql += ` WHERE status = $${params.length}`;
    }
    sql += ' ORDER BY created_at DESC';
    const result = await db.query(sql, params);
    res.json({ feedback: result.rows });
  } catch (err) {
    next(err);
  }
});

// UPDATE FEEDBACK STATUS (ADMIN ONLY)
router.put('/:id/status', authenticateUser, requireRole('admin'), async (req, res, next) => {
  const { status } = req.body;
  if (!['new', 'reviewed', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'Status must be one of: new, reviewed, resolved.' });
  }

  try {
    await db.query('UPDATE feedback SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, req.params.id]);
    res.json({ message: `Feedback status updated to '${status}'.`, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
