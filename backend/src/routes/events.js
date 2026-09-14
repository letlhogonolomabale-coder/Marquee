const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { geocodeVenue } = require('../utils/geocode');
const { toApiEvent } = require('../utils/serializeEvent');
const { fetchLiveEvents } = require('../utils/ticketmaster');

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

const upsertLiveEvent = db.prepare(`
  INSERT INTO events (tm_id, title, venue, cat, price, date_text, description, city, lat, lng, photo_url, color, source_url)
  VALUES (@tmId, @title, @venue, @cat, @price, @date, @description, @city, @lat, @lng, @photoUrl, '#FFB454', @sourceUrl)
  ON CONFLICT(tm_id) DO UPDATE SET
    price = excluded.price,
    date_text = excluded.date_text,
    description = excluded.description,
    photo_url = COALESCE(events.photo_url, excluded.photo_url), -- keep an admin's manual photo override
    source_url = excluded.source_url
`);

// GET /api/events?city=Johannesburg
// If TICKETMASTER_API_KEY is set, real live events for the city are pulled
// in and upserted into the DB (see upsertLiveEvent above), so they get a
// normal integer id and everything else — favoriting, admin editing — just
// works on them like any other row. Once real data is available for a city,
// the old fictional seed listings step aside rather than sit next to it.
// Without that key, this falls back to the original DB-only behavior.
router.get('/', async (req, res) => {
  const city = matchCity(req.query.city);
  if (!city) {
    return res.json({ city: null, events: [], message: `No coverage for "${req.query.city}" yet — try Johannesburg, Cape Town, Durban or Pretoria.` });
  }

  const liveRows = await fetchLiveEvents(city);
  liveRows.forEach((row) => upsertLiveEvent.run(row));

  const dbQuery = liveRows.length > 0 || process.env.TICKETMASTER_API_KEY
    ? 'SELECT * FROM events WHERE city = ? AND (host_user_id IS NOT NULL OR tm_id IS NOT NULL) ORDER BY (tm_id IS NULL), created_at DESC'
    : 'SELECT * FROM events WHERE city = ? ORDER BY created_at DESC';
  const rows = db.prepare(dbQuery).all(city);

  const message = rows.length === 0
    ? `No live events found for ${city} right now — check back soon.`
    : undefined;
  res.json({ city, events: rows.map(toApiEvent), message });
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

  const { title, venue, cat, price, date, description, city, url, address } = req.body;
  if (!title || !venue || !date) {
    return res.status(400).json({ error: 'Title, venue and date are required.' });
  }
  if (url && !/^https?:\/\//i.test(url.trim())) {
    return res.status(400).json({ error: 'Event link must start with http:// or https://' });
  }
  const resolvedCity = matchCity(city) || 'Johannesburg';

  // Best-effort real geocoding — falls back to null lat/lng (frontend
  // already handles "no pin for this one" gracefully) rather than silently
  // defaulting to the city center like the original prototype did. An
  // explicit street address (when the host gives one) geocodes far more
  // reliably than a bare venue name, which is often too informal/generic
  // for Nominatim to resolve on its own (e.g. "Rooftop bar downtown").
  const coords = await geocodeVenue(venue, resolvedCity, address?.trim());

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

// PATCH /api/events/mine/:id — lets a host add or update the link on an
// event they posted (e.g. if they skipped it originally, or the listing
// moved). Scoped to their own events only, and only touches the link —
// other fields go through the admin panel to avoid two different "edit"
// paths drifting apart.
router.patch('/mine/:id', requireAuth, async (req, res) => {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Event not found.' });
  if (row.host_user_id !== req.user.id) {
    return res.status(403).json({ error: "You can only edit events you've posted." });
  }

  const { url, address } = req.body;
  if (url && !/^https?:\/\//i.test(url.trim())) {
    return res.status(400).json({ error: 'Event link must start with http:// or https://' });
  }

  let lat = row.lat;
  let lng = row.lng;
  if (address?.trim()) {
    const coords = await geocodeVenue(row.venue, row.city, address.trim());
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    }
  }

  db.prepare('UPDATE events SET source_url = ?, lat = ?, lng = ? WHERE id = ?').run(
    url?.trim() || null,
    lat,
    lng,
    row.id
  );
  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(row.id);
  res.json({ event: toApiEvent(updated) });
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
