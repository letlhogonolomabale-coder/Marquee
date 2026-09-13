const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { geocodeVenue } = require('../utils/geocode');

const router = express.Router();

const KNOWN_CITIES = ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria'];
const CITY_ALIASES = {
  jhb: 'Johannesburg', joburg: 'Johannesburg', joeys: 'Johannesburg',
  cpt: 'Cape Town', capetown: 'Cape Town',
  dbn: 'Durban', pta: 'Pretoria', tshwane: 'Pretoria',
};

// Same matching logic the frontend used to do locally — kept here so the
// server is the single source of truth for "what city did the user mean".
function matchCity(raw) {
  const q = (raw || '').trim().toLowerCase();
  if (!q) return 'Johannesburg';
  const hit = KNOWN_CITIES.find((c) => c.toLowerCase().includes(q) || q.includes(c.toLowerCase()));
  if (hit) return hit;
  return CITY_ALIASES[q.replace(/\s+/g, '')] || null;
}

function toApiEvent(row) {
  return {
    id: row.id,
    title: row.title,
    venue: row.venue,
    cat: row.cat,
    price: row.price,
    date: row.date_text,
    description: row.description,
    city: row.city,
    lat: row.lat,
    lng: row.lng,
    photoKey: row.photo_key,
    photoUrl: row.photo_url,
    color: row.color,
    url: row.source_url,
    hosted: row.host_user_id !== null,
    hostedByMe: false, // filled in by caller when relevant
  };
}

// GET /api/events?city=Johannesburg
// This replaces the old client-side "runScan" fake delay + random sample —
// it now genuinely queries the DB. Add real external sources later by
// inserting rows from a scraper/API job instead of only from hosts.
router.get('/', (req, res) => {
  const city = matchCity(req.query.city);
  if (!city) {
    return res.json({ city: null, events: [], message: `No coverage for "${req.query.city}" yet — try Johannesburg, Cape Town, Durban or Pretoria.` });
  }
  const rows = db.prepare('SELECT * FROM events WHERE city = ? ORDER BY created_at DESC').all(city);
  res.json({ city, events: rows.map(toApiEvent) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Event not found.' });
  res.json({ event: toApiEvent(row) });
});

// POST /api/events — only verified hosts can post.
router.post('/', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || user.verification_status !== 'verified') {
    return res.status(403).json({ error: 'You need to complete ID verification before posting events.' });
  }

  const { title, venue, cat, price, date, description, city, url } = req.body;
  if (!title || !venue || !date) {
    return res.status(400).json({ error: 'Title, venue and date are required.' });
  }
  if (url && !/^https?:\/\//i.test(url.trim())) {
    return res.status(400).json({ error: 'Event link must start with http:// or https://' });
  }
  const resolvedCity = matchCity(city) || 'Johannesburg';

  // Best-effort real geocoding — falls back to null lat/lng (frontend
  // already handles "no pin for this one" gracefully) rather than silently
  // defaulting to the city center like the original prototype did.
  const coords = await geocodeVenue(venue, resolvedCity);

  const result = db
    .prepare(`
      INSERT INTO events (host_user_id, title, venue, cat, price, date_text, description, city, lat, lng, color, source_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      user.id,
      title.trim(),
      venue.trim(),
      cat || 'Music',
      price?.trim() || 'Free',
      date.trim(),
      description?.trim() || null,
      resolvedCity,
      coords?.lat ?? null,
      coords?.lng ?? null,
      '#FFB454',
      url?.trim() || null
    );

  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ event: toApiEvent(row) });
});

// GET /api/events/mine/hosted — events the logged-in user has posted.
router.get('/mine/hosted', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM events WHERE host_user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ events: rows.map(toApiEvent) });
});

// ---- admin-only: full control over price, date and photo for any event ----

// GET /api/events/admin/all — every event, across every city, for the admin panel.
router.get('/admin/all', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM events ORDER BY created_at DESC').all();
  res.json({ events: rows.map(toApiEvent) });
});

// PATCH /api/events/admin/:id — update price, date and/or photo on any event.
// Deliberately narrow (not a general-purpose edit endpoint) to match what
// the admin panel actually exposes.
router.patch('/admin/:id', requireAuth, requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Event not found.' });

  const { price, date, photoUrl } = req.body;
  if (photoUrl && !/^https?:\/\//i.test(photoUrl.trim())) {
    return res.status(400).json({ error: 'Photo link must start with http:// or https://' });
  }

  db.prepare('UPDATE events SET price = ?, date_text = ?, photo_url = ? WHERE id = ?').run(
    price?.trim() || row.price,
    date?.trim() || row.date_text,
    photoUrl !== undefined ? (photoUrl.trim() || null) : row.photo_url,
    row.id
  );

  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(row.id);
  res.json({ event: toApiEvent(updated) });
});

module.exports = router;
