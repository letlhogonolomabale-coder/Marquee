const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { geocodeVenue } = require('../utils/geocode');
const { toApiEvent } = require('../utils/serializeEvent');
const { fetchLiveEvents } = require('../utils/ticketmaster');
const { parseEventDateText } = require('../utils/eventDate');

const router = express.Router();

const KNOWN_CITIES = [
  'Johannesburg', 'Cape Town', 'Durban', 'Pretoria',
  'Bloemfontein', 'Gqeberha', 'East London', 'Nelspruit',
  'Polokwane', 'Kimberley', 'George', 'Stellenbosch',
];
const CITY_ALIASES = {
  jhb: 'Johannesburg', joburg: 'Johannesburg', joeys: 'Johannesburg',
  cpt: 'Cape Town', capetown: 'Cape Town',
  dbn: 'Durban', pta: 'Pretoria', tshwane: 'Pretoria',
  bloem: 'Bloemfontein', mangaung: 'Bloemfontein',
  pe: 'Gqeberha', 'portelizabeth': 'Gqeberha', gqeberha: 'Gqeberha',
  el: 'East London', eastlondon: 'East London',
  mbombela: 'Nelspruit', nelspruit: 'Nelspruit',
  polokwane: 'Polokwane', pietersburg: 'Polokwane',
  kimberley: 'Kimberley',
  george: 'George',
  stellenbosch: 'Stellenbosch',
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
  INSERT INTO events (tm_id, title, venue, cat, price, date_text, event_date, description, city, lat, lng, photo_url, color, source_url)
  VALUES (@tmId, @title, @venue, @cat, @price, @date, @eventDate, @description, @city, @lat, @lng, @photoUrl, '#FFB454', @sourceUrl)
  ON CONFLICT(tm_id) DO UPDATE SET
    price = excluded.price,
    date_text = excluded.date_text,
    event_date = excluded.event_date,
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
router.get('/', async (req, res, next) => {
  try {
    const city = matchCity(req.query.city);
    if (!city) {
      return res.json({ city: null, events: [], message: `No coverage for "${req.query.city}" yet — try a major South African city like Johannesburg, Cape Town, Durban or Pretoria.` });
    }

    const liveRows = await fetchLiveEvents(city);
    if (liveRows.length > 0) {
      // Skip anything an admin has explicitly deleted (see DELETE
      // /admin/:id below) — otherwise a deleted live event just comes
      // right back the next time this city is fetched.
      const removedTmIds = new Set(
        (await db.prepare('SELECT tm_id FROM removed_events WHERE tm_id IS NOT NULL').all()).map((r) => r.tm_id)
      );
      for (const row of liveRows) {
        if (removedTmIds.has(row.tmId)) continue;
        await upsertLiveEvent.run(row);
      }
    }

    // is_main DESC first — the admin-picked (or auto-defaulted) featured
    // event always sorts to row 0. After that, freshly-pulled live events
    // sort just ahead of the original demo/editorial listings via
    // `(tm_id IS NULL)`, but — unlike before — demo events are never hidden
    // once live data exists for a city; everything for the city shows
    // together. Admin-hidden events (is_hidden = 1) are left out entirely,
    // and so is anything whose date has already passed — those move to
    // GET /past instead (see below). An event with no parseable event_date
    // is treated as always-upcoming rather than guessed into either bucket.
    const rows = await db.prepare(`
      SELECT * FROM events
      WHERE city = ? AND is_hidden = 0 AND (event_date IS NULL OR event_date >= datetime('now'))
      ORDER BY is_main DESC, (tm_id IS NULL), created_at DESC
    `).all(city);

    const message = rows.length === 0
      ? `No live events found for ${city} right now — check back soon.`
      : undefined;

    // Every city always has a main event once it has any events at all: if
    // the admin hasn't picked one for this city, the soonest row (rows[0] —
    // already first because of the is_main DESC ordering above) is treated
    // as main automatically. This is display-only and never written to the
    // DB, so it changes on its own as events come and go until an admin
    // makes an explicit pick, which always wins from then on.
    const adminPickId = rows.find((r) => r.is_main)?.id ?? null;
    const effectiveMainId = adminPickId ?? rows[0]?.id ?? null;
    const events = rows.map((r) => ({ ...toApiEvent(r), isMain: r.id === effectiveMainId }));

    res.json({ city, events, message });
  } catch (err) {
    next(err);
  }
});

// GET /api/events/past?city=Johannesburg — events for this city whose
// event_date has already gone by, most-recently-past first. Feeds the
// Past page. An event with no parseable event_date never appears here
// (see GET / above) since we can't know it's actually over.
router.get('/past', async (req, res, next) => {
  try {
    const city = matchCity(req.query.city);
    if (!city) {
      return res.json({ city: null, events: [], message: `No coverage for "${req.query.city}" yet — try a major South African city like Johannesburg, Cape Town, Durban or Pretoria.` });
    }

    const rows = await db.prepare(`
      SELECT * FROM events
      WHERE city = ? AND is_hidden = 0 AND event_date IS NOT NULL AND event_date < datetime('now')
      ORDER BY event_date DESC
    `).all(city);

    res.json({ city, events: rows.map(toApiEvent) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Event not found.' });
    res.json({ event: toApiEvent(row) });
  } catch (err) {
    next(err);
  }
});

// POST /api/events — only verified hosts can post.
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
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

    const result = await db
      .prepare(`
        INSERT INTO events (host_user_id, title, venue, cat, price, date_text, event_date, description, city, lat, lng, color, source_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        user.id,
        title.trim(),
        venue.trim(),
        cat || 'Music',
        price?.trim() || 'Free',
        date.trim(),
        parseEventDateText(date.trim())?.toISOString() ?? null,
        description?.trim() || null,
        resolvedCity,
        coords?.lat ?? null,
        coords?.lng ?? null,
        '#FFB454',
        url?.trim() || null
      );

    const row = await db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ event: toApiEvent(row) });
  } catch (err) {
    next(err);
  }
});

// GET /api/events/mine/hosted — events the logged-in user has posted.
router.get('/mine/hosted', requireAuth, async (req, res, next) => {
  try {
    const rows = await db.prepare('SELECT * FROM events WHERE host_user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ events: rows.map(toApiEvent) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/events/mine/:id — lets a host add or update the link on an
// event they posted (e.g. if they skipped it originally, or the listing
// moved). Scoped to their own events only, and only touches the link —
// other fields go through the admin panel to avoid two different "edit"
// paths drifting apart.
router.patch('/mine/:id', requireAuth, async (req, res, next) => {
  try {
    const row = await db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
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

    await db.prepare('UPDATE events SET source_url = ?, lat = ?, lng = ? WHERE id = ?').run(
      url?.trim() || null,
      lat,
      lng,
      row.id
    );
    const updated = await db.prepare('SELECT * FROM events WHERE id = ?').get(row.id);
    res.json({ event: toApiEvent(updated) });
  } catch (err) {
    next(err);
  }
});

// ---- admin-only: full control over price, date and photo for any event ----

// GET /api/events/admin/all — every event, across every city, for the admin panel.
router.get('/admin/all', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const rows = await db.prepare('SELECT * FROM events ORDER BY is_main DESC, created_at DESC').all();
    res.json({ events: rows.map(toApiEvent) });
  } catch (err) {
    next(err);
  }
});

// POST /api/events/admin/:id/main — toggle this event as the main/featured
// event FOR ITS CITY. Every city always shows a main event (falling back
// automatically to the soonest one — see GET / above) until an admin picks
// one explicitly; picking a new one here only replaces the previous
// explicit pick in that same city, leaving every other city untouched.
// Calling this again on the event that's already main un-sets it, handing
// that city back to the automatic soonest-event default.
router.post('/admin/:id/main', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const row = await db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Event not found.' });

    const makeMain = !row.is_main;
    // Both updates happen inside one real transaction, so a crash between
    // them can't leave a city with either zero or two main events.
    await db.transaction(async (tx) => {
      await tx('UPDATE events SET is_main = 0 WHERE is_main = 1 AND city = ?').run(row.city);
      if (makeMain) {
        await tx('UPDATE events SET is_main = 1 WHERE id = ?').run(row.id);
      }
    });

    const updated = await db.prepare('SELECT * FROM events WHERE id = ?').get(row.id);
    res.json({ event: toApiEvent(updated) });
  } catch (err) {
    next(err);
  }
});

// POST /api/events/admin/:id/visibility — toggle whether this event shows
// up in the public Discover list. Hiding an event doesn't delete it or
// touch its main-event status — a hidden event just never appears in the
// GET / results above, so unhiding it later brings it straight back
// exactly as it was (including main-event status, if it had it).
router.post('/admin/:id/visibility', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const row = await db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Event not found.' });

    const hide = !row.is_hidden;
    await db.prepare('UPDATE events SET is_hidden = ? WHERE id = ?').run(hide ? 1 : 0, row.id);

    const updated = await db.prepare('SELECT * FROM events WHERE id = ?').get(row.id);
    res.json({ event: toApiEvent(updated) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/events/admin/:id — update price, date, photo, website link,
// venue name and/or location on any event. Deliberately narrow (not a
// general-purpose edit endpoint) to match what the admin panel exposes.
// `address`, if given, is re-geocoded the same way a host's own listing
// is (see PATCH /mine/:id above) so moving an event's pin is just typing
// a new address rather than hand-editing lat/lng.
router.patch('/admin/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const row = await db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Event not found.' });

    const { price, date, photoUrl, sourceUrl, venue, address } = req.body;
    if (photoUrl && !/^https?:\/\//i.test(photoUrl.trim())) {
      return res.status(400).json({ error: 'Photo link must start with http:// or https://' });
    }
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl.trim())) {
      return res.status(400).json({ error: 'Event website link must start with http:// or https://' });
    }

    let lat = row.lat;
    let lng = row.lng;
    if (address?.trim()) {
      const coords = await geocodeVenue(venue?.trim() || row.venue, row.city, address.trim());
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      }
    }

    const newDateText = date?.trim() || row.date_text;
    // Only re-parse when the date text actually changed — avoids silently
    // shifting event_date (and therefore Discover/Past placement) on saves
    // that don't touch the date at all.
    const newEventDate = newDateText === row.date_text
      ? row.event_date
      : (parseEventDateText(newDateText)?.toISOString() ?? null);

    await db.prepare('UPDATE events SET price = ?, date_text = ?, event_date = ?, photo_url = ?, source_url = ?, venue = ?, lat = ?, lng = ? WHERE id = ?').run(
      price?.trim() || row.price,
      newDateText,
      newEventDate,
      photoUrl !== undefined ? (photoUrl.trim() || null) : row.photo_url,
      sourceUrl !== undefined ? (sourceUrl.trim() || null) : row.source_url,
      venue?.trim() || row.venue,
      lat,
      lng,
      row.id
    );

    const updated = await db.prepare('SELECT * FROM events WHERE id = ?').get(row.id);
    res.json({ event: toApiEvent(updated) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/events/admin/:id — permanently remove an event. Unlike
// /admin/:id/visibility (which just hides it from Discover but keeps the
// row), this actually deletes it from the database, so it stops coming
// back — including on the next Ticketmaster sync for events pulled from
// there, since a deleted tm_id simply isn't in the table to match against
// anymore and gets re-inserted as a fresh row next fetch. Anyone who had
// it favorited loses that favorite too (ON DELETE CASCADE).
router.delete('/admin/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const row = await db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Event not found.' });

    // Record a tombstone first so this event can't silently come back on
    // the next Ticketmaster sync (matched by tm_id) or app restart
    // (matched by title+venue+city, same as the seed step uses).
    await db.prepare('INSERT INTO removed_events (tm_id, fingerprint) VALUES (?, ?)').run(
      row.tm_id || null,
      db.fingerprintEvent(row.title, row.venue, row.city)
    );
    await db.prepare('DELETE FROM events WHERE id = ?').run(row.id);
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
