// notifications.js — powers the bell icon: admin broadcasts (announcements
// to every user) and, for admins only, a live count of listings waiting on
// their review. There's no per-broadcast read tracking; instead each user
// has a single notifications_seen_at timestamp (see db.js) that moves
// forward every time they open the bell, and "unread" just means "posted
// after that".
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const RECENT_LIMIT = 20;

function toApiBroadcast(row) {
  return { id: row.id, message: row.message, createdAt: row.created_at };
}

// GET /api/notifications — the last 20 broadcasts, how many of those are
// unread, and (admin only) how many listings are pending review right now.
// pendingCount is always "live" (not tied to seen/unread) since it's
// outstanding work, not a message to dismiss.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = await db.prepare('SELECT is_admin, notifications_seen_at FROM users WHERE id = ?').get(req.user.id);
    const rows = await db.prepare('SELECT * FROM broadcasts ORDER BY created_at DESC, id DESC LIMIT ?').all(RECENT_LIMIT);
    const seenAt = user?.notifications_seen_at || null;
    const unreadBroadcasts = seenAt ? rows.filter((r) => r.created_at > seenAt).length : rows.length;

    let pendingCount = 0;
    if (user?.is_admin) {
      const [{ n: pendingEvents }, { n: pendingVenues }] = await Promise.all([
        db.prepare("SELECT COUNT(*) AS n FROM events WHERE approval_status = 'pending'").get(),
        db.prepare("SELECT COUNT(*) AS n FROM venues WHERE approval_status = 'pending'").get(),
      ]);
      pendingCount = Number(pendingEvents) + Number(pendingVenues);
    }

    res.json({
      broadcasts: rows.map(toApiBroadcast),
      unreadBroadcasts,
      pendingCount,
      badgeCount: unreadBroadcasts + pendingCount,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/seen — call when the bell is opened. Marks every
// broadcast up to now as read; doesn't touch pendingCount, which only goes
// down as an admin actually approves or rejects things.
router.post('/seen', requireAuth, async (req, res, next) => {
  try {
    // Written the same way created_at columns are (SQL's own datetime('now'),
    // "YYYY-MM-DD HH:MM:SS") rather than a JS ISO string, so the plain string
    // comparison against broadcasts.created_at above sorts correctly — the
    // two formats don't compare reliably against each other.
    await db.prepare("UPDATE users SET notifications_seen_at = strftime('%Y-%m-%d %H:%M:%f','now') WHERE id = ?").run(req.user.id);
    const row = await db.prepare('SELECT notifications_seen_at FROM users WHERE id = ?').get(req.user.id);
    res.json({ seenAt: row.notifications_seen_at });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/broadcast — admin-only. Sends an announcement to
// every user (it just appears in everyone's bell next time they check).
router.post('/broadcast', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const message = String(req.body.message || '').trim().slice(0, 500);
    if (message.length < 3) return res.status(400).json({ error: 'Write a short message first.' });
    const result = await db.prepare('INSERT INTO broadcasts (message, created_by) VALUES (?, ?)').run(message, req.user.id);
    const row = await db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ broadcast: toApiBroadcast(row) });
  } catch (err) {
    next(err);
  }
});

// GET /api/notifications/admin/all — every broadcast ever sent, for the
// admin panel's history list (the bell itself only shows the most recent 20).
router.get('/admin/all', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const rows = await db.prepare('SELECT * FROM broadcasts ORDER BY created_at DESC, id DESC').all();
    res.json({ broadcasts: rows.map(toApiBroadcast) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/notifications/admin/:id — remove a broadcast that was sent by
// mistake. Doesn't affect anyone's unread count for other broadcasts.
router.delete('/admin/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await db.prepare('DELETE FROM broadcasts WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Broadcast not found.' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
