// venues.js — bars, lounges and clubs that pay R50 per 30 days (VENUE_PLAN_CENTS)
// to stand out. While a venue's plan is active, any event whose venue name
// matches (case-insensitive, same city) is highlighted in Discover and search
// and ranked higher — see the LEFT JOIN on venues in routes/events.js.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { matchCity } = require('../utils/cities');
const { initializeTransaction, VENUE_PLAN_CENTS, VENUE_PLAN_DAYS } = require('../utils/paystack');

const router = express.Router();
const KINDS = ['Bar', 'Lounge', 'Club', 'Restaurant', 'Other'];

function toApiVenue(row) {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    kind: row.kind,
    planExpiresAt: row.plan_expires_at,
    active: !!(row.plan_expires_at && row.plan_expires_at >= new Date().toISOString()),
  };
}

// GET /api/venues/mine — venues the caller has registered.
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const rows = await db.prepare('SELECT * FROM venues WHERE owner_user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ venues: rows.map(toApiVenue), planPriceCents: VENUE_PLAN_CENTS, planDays: VENUE_PLAN_DAYS });
  } catch (err) {
    next(err);
  }
});

// POST /api/venues — register a venue (no plan yet; pay via POST /:id/pay).
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const cityRaw = String(req.body.city || '').trim();
    const kind = KINDS.includes(req.body.kind) ? req.body.kind : 'Bar';
    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ error: 'Venue name must be between 2 and 80 characters.' });
    }
    const city = cityRaw ? matchCity(cityRaw) : null;
    if (!city) return res.status(400).json({ error: 'Pick one of the cities Marquee covers.' });

    const nameKey = name.toLowerCase();
    const existing = await db.prepare('SELECT * FROM venues WHERE name_key = ? AND city = ?').get(nameKey, city);
    if (existing) {
      if (existing.owner_user_id !== req.user.id) {
        return res.status(409).json({ error: 'That venue is already registered by another account. Contact support if it\'s yours.' });
      }
      return res.json({ venue: toApiVenue(existing) });
    }

    const result = await db
      .prepare('INSERT INTO venues (owner_user_id, name, name_key, city, kind) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, name, nameKey, city, kind);
    const row = await db.prepare('SELECT * FROM venues WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ venue: toApiVenue(row) });
  } catch (err) {
    next(err);
  }
});

// POST /api/venues/:id/pay — start a Paystack checkout for one plan period.
// Works for the first activation and for renewals (time stacks on top).
router.post('/:id/pay', requireAuth, async (req, res, next) => {
  try {
    const venue = await db.prepare('SELECT * FROM venues WHERE id = ?').get(req.params.id);
    if (!venue) return res.status(404).json({ error: 'Venue not found.' });
    if (venue.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: "You can only pay for venues you've registered." });
    }

    const owner = await db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
    const baseUrl = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const reference = `venue_${venue.id}_${Date.now()}`;

    const { authorization_url } = await initializeTransaction({
      email: owner.email,
      amountCents: VENUE_PLAN_CENTS,
      reference,
      metadata: { kind: 'venue_plan', venueId: venue.id, userId: req.user.id },
      callbackUrl: `${baseUrl}/`,
    });

    res.json({ url: authorization_url });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
