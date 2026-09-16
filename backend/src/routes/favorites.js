const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { toApiEvent } = require('../utils/serializeEvent');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const rows = await db
      .prepare(
        `SELECT e.* FROM favorites f
         JOIN events e ON e.id = f.event_id
         WHERE f.user_id = ?
         ORDER BY f.created_at DESC`
      )
      .all(req.user.id);
    res.json({ favorites: rows.map(toApiEvent) });
  } catch (err) {
    next(err);
  }
});

router.post('/:eventId', requireAuth, async (req, res, next) => {
  try {
    const event = await db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });

    await db.prepare('INSERT OR IGNORE INTO favorites (user_id, event_id) VALUES (?, ?)').run(req.user.id, event.id);
    res.status(201).json({ saved: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:eventId', requireAuth, async (req, res, next) => {
  try {
    await db.prepare('DELETE FROM favorites WHERE user_id = ? AND event_id = ?').run(req.user.id, req.params.eventId);
    res.json({ saved: false });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
