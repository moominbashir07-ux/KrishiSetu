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

module.exports = router;
