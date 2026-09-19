const express = require('express');
const db = require('../db/db');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

// GET USER NOTIFICATIONS
router.get('/', authenticateUser, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );

    res.json({ notifications: result.rows });
  } catch (err) {
    next(err);
  }
});

// MARK ALL NOTIFICATIONS AS READ (BATCH)
router.put('/read-all', authenticateUser, async (req, res, next) => {
  try {
    await db.query(
      `UPDATE notifications SET read = true WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
});

// MARK NOTIFICATION AS READ
router.put('/:id/read', authenticateUser, async (req, res, next) => {
  try {
    const notifId = req.params.id;
    await db.query(
      `UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`,
      [notifId, req.user.id]
    );

    res.json({ message: 'Notification marked as read.', id: notifId });
  } catch (err) {
    next(err);
  }
});

// TRIGGER TEST ALERT NOTIFICATION (FOR BACKGROUND & LIVE SYSTEM TESTING)
router.post('/test', authenticateUser, async (req, res, next) => {
  try {
    const notifId = 'NOTIF_TEST_' + Date.now() + Math.random().toString(36).substring(2, 6);
    const title = req.body.title || '🔔 KrishiSetu Background Alert';
    const message = req.body.message || 'Background system notifications are active and delivering real-time alerts!';
    const type = req.body.type || 'alert';

    const insertResult = await db.query(
      `INSERT INTO notifications (id, user_id, type, title, message, read, order_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [notifId, req.user.id, type, title, message, false, null]
    );

    const notification = (insertResult.rows && insertResult.rows[0]) || {
      id: notifId,
      user_id: req.user.id,
      type,
      title,
      message,
      read: false,
      created_at: new Date().toISOString()
    };

    res.status(201).json({
      message: 'Test notification generated successfully.',
      notification
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

