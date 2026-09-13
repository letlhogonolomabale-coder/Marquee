const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function toApiEvent(row) {
  return {
    id: row.id,
    title: row.title,
    venue: row.venue,
    cat: row.cat,
    price: row.price,
    date: row.date_text,
    city: row.city,
    lat: row.lat,
    lng: row.lng,
    photoKey: row.photo_key,
    color: row.color,
    hosted: row.host_user_id !== null,
  };
}

router.get('/', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT e.* FROM favorites f
       JOIN events e ON e.id = f.event_id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`
    )
    .all(req.user.id);
  res.json({ favorites: rows.map(toApiEvent) });
});

router.post('/:eventId', requireAuth, (req, res) => {
  const event = db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  db.prepare('INSERT OR IGNORE INTO favorites (user_id, event_id) VALUES (?, ?)').run(req.user.id, event.id);
  res.status(201).json({ saved: true });
});

router.delete('/:eventId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND event_id = ?').run(req.user.id, req.params.eventId);
  res.json({ saved: false });
});

module.exports = router;
