// venues.js — bars, lounges, clubs and fine-dining restaurants that pay R50 per
// 30 days (VENUE_PLAN_CENTS). While a venue's plan is active it is listed in the
// Bars & Lounges or Fine Dining tab (GET /api/venues), and any event whose venue
// name matches (case-insensitive, same city) is highlighted in Discover and
// search and ranked higher — see the LEFT JOIN on venues in routes/events.js.
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { matchCity } = require('../utils/cities');
const { geocodeVenue } = require('../utils/geocode');
const {
  MAX_VENUE_PHOTOS, imageBody, checkUpload, imageUrl, isAdmin, overQuota, storeImage, deleteImage,
} = require('../utils/images');
const { initializeTransaction, VENUE_PLAN_CENTS, VENUE_PLAN_DAYS } = require('../utils/paystack');

const router = express.Router();
const KINDS = ['Bar', 'Lounge', 'Club', 'Fine Dining', 'Other'];
// Which Discover tab a venue is listed under. 'Restaurant' is the old name for
// Fine Dining, kept so venues registered in the first release still land right.
const DINING_KINDS = ['Fine Dining', 'Restaurant'];
const sectionOf = (kind) => (DINING_KINDS.includes(kind) ? 'dining' : 'bars');

// Optional listing details, shared by create and edit. Returns { error } or the cleaned values.
function cleanDetails(body) {
  const description = String(body.description || '').trim().slice(0, 500) || null;
  const address = String(body.address || '').trim().slice(0, 200) || null;
  const link = String(body.link || '').trim() || null;
  if (link && !/^https?:\/\//i.test(link)) return { error: 'Website link must start with http:// or https://' };
  if (link && link.length > 300) return { error: 'That link is too long.' };
  let cleanLink = null;
  if (link) {
    // Re-serialising through URL percent-encodes quotes, spaces and angle
    // brackets, so a stored link can never break out of an HTML attribute.
    try { cleanLink = new URL(link).href; } catch (e) { return { error: "That website link doesn't look valid." }; }
  }
  return { description, address, link: cleanLink };
}

function toApiVenue(row, photos = []) {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    kind: row.kind,
    section: sectionOf(row.kind),
    description: row.description,
    address: row.address,
    link: row.link_url,
    lat: row.lat,
    lng: row.lng,
    photos,   // gallery, cover first: [{ id, url }]
    planExpiresAt: row.plan_expires_at,
    active: !!(row.plan_expires_at && row.plan_expires_at >= new Date().toISOString()),
  };
}

// Turns venue rows into API venues with their galleries attached, using one query
// for all the photos (ids only — never the picture data itself).
async function toApiVenues(rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const photoRows = await db
    .prepare(`SELECT id, venue_id FROM images WHERE venue_id IN (${ids.map(() => '?').join(',')}) ORDER BY position ASC, id ASC`)
    .all(...ids);
  const byVenue = new Map();
  for (const p of photoRows) {
    if (!byVenue.has(p.venue_id)) byVenue.set(p.venue_id, []);
    byVenue.get(p.venue_id).push({ id: p.id, url: imageUrl(p.id) });
  }
  return rows.map((r) => toApiVenue(r, byVenue.get(r.id) || []));
}

const oneApiVenue = async (id) => (await toApiVenues([await db.prepare('SELECT * FROM venues WHERE id = ?').get(id)]))[0];

// GET /api/venues?city=Johannesburg&section=bars|dining — the venues listed in
// a city's Bars & Lounges / Fine Dining tabs. Public. Only venues whose plan is
// active are listed, so lapsing means dropping off the tab. Newest first.
router.get('/', async (req, res, next) => {
  try {
    const city = matchCity(req.query.city);
    if (!city) return res.json({ city: null, venues: [] });
    const rows = await db
      .prepare('SELECT * FROM venues WHERE city = ? AND plan_expires_at IS NOT NULL AND plan_expires_at >= ? ORDER BY created_at DESC, id DESC')
      .all(city, new Date().toISOString());
    let venues = await toApiVenues(rows);
    if (req.query.section === 'bars' || req.query.section === 'dining') {
      venues = venues.filter((x) => x.section === req.query.section);
    }
    res.json({ city, venues });
  } catch (err) {
    next(err);
  }
});

// GET /api/venues/mine — venues the caller has registered.
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const rows = await db.prepare('SELECT * FROM venues WHERE owner_user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ venues: await toApiVenues(rows), planPriceCents: VENUE_PLAN_CENTS, planDays: VENUE_PLAN_DAYS, maxPhotos: MAX_VENUE_PHOTOS });
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

    const details = cleanDetails(req.body);
    if (details.error) return res.status(400).json({ error: details.error });

    const nameKey = name.toLowerCase();
    const existing = await db.prepare('SELECT * FROM venues WHERE name_key = ? AND city = ?').get(nameKey, city);
    if (existing) {
      if (existing.owner_user_id !== req.user.id) {
        return res.status(409).json({ error: 'That venue is already registered by another account. Contact support if it\'s yours.' });
      }
      return res.json({ venue: await oneApiVenue(existing.id) });
    }

    // Best-effort map pin, same approach as hosted events: null if it can't be found.
    const coords = await geocodeVenue(name, city, details.address);
    const result = await db
      .prepare('INSERT INTO venues (owner_user_id, name, name_key, city, kind, description, address, link_url, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, name, nameKey, city, kind, details.description, details.address, details.link, coords?.lat ?? null, coords?.lng ?? null);
    res.status(201).json({ venue: await oneApiVenue(result.lastInsertRowid) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/venues/:id — the owner edits the listing details. Name, type and
// city are fixed once registered (they decide which events get highlighted).
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const venue = await db.prepare('SELECT * FROM venues WHERE id = ?').get(req.params.id);
    if (!venue) return res.status(404).json({ error: 'Venue not found.' });
    if (venue.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: "You can only edit venues you've registered." });
    }
    const details = cleanDetails(req.body);
    if (details.error) return res.status(400).json({ error: details.error });

    let { lat, lng } = venue;
    if (details.address && details.address !== venue.address) {
      const coords = await geocodeVenue(venue.name, venue.city, details.address);
      if (coords) { lat = coords.lat; lng = coords.lng; }
    }
    await db
      .prepare('UPDATE venues SET description = ?, address = ?, link_url = ?, lat = ?, lng = ? WHERE id = ?')
      .run(details.description, details.address, details.link, lat, lng, venue.id);
    res.json({ venue: await oneApiVenue(venue.id) });
  } catch (err) {
    next(err);
  }
});

// GET /api/venues/admin/all — every registered venue in every city (paid or not),
// so an admin can manage any listing's photos.
router.get('/admin/all', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const rows = await db.prepare('SELECT * FROM venues ORDER BY city, name').all();
    res.json({ venues: await toApiVenues(rows), maxPhotos: MAX_VENUE_PHOTOS });
  } catch (err) {
    next(err);
  }
});

// Loads a venue the caller may manage photos for — its owner, or any admin.
// Sends the 404/403 itself and returns null when they may not.
async function manageableVenue(req, res) {
  const venue = await db.prepare('SELECT * FROM venues WHERE id = ?').get(req.params.id);
  if (!venue) { res.status(404).json({ error: 'Venue not found.' }); return null; }
  if (venue.owner_user_id !== req.user.id && !(await isAdmin(req.user.id))) {
    res.status(403).json({ error: "You can only change photos on venues you've registered." });
    return null;
  }
  return venue;
}

// POST /api/venues/:id/photos — add one picture to the gallery. The body is the
// raw image (Content-Type image/jpeg | png | webp). Returns the updated venue.
router.post('/:id/photos', requireAuth, imageBody, async (req, res, next) => {
  try {
    const venue = await manageableVenue(req, res);
    if (!venue) return;
    const check = checkUpload(req.body);
    if (check.error) return res.status(400).json({ error: check.error });

    const count = await db.prepare('SELECT COUNT(*) AS n FROM images WHERE venue_id = ?').get(venue.id);
    if (Number(count.n) >= MAX_VENUE_PHOTOS) {
      return res.status(400).json({ error: `A listing can have up to ${MAX_VENUE_PHOTOS} photos. Remove one to add another.` });
    }
    if (await overQuota(req.user.id)) {
      return res.status(400).json({ error: "You've reached the upload limit for this account. Remove some old photos first." });
    }

    const last = await db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM images WHERE venue_id = ?').get(venue.id);
    await storeImage({ buffer: req.body, mime: check.mime, userId: req.user.id, venueId: venue.id, position: Number(last.p) + 1 });
    res.status(201).json({ venue: await oneApiVenue(venue.id) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/venues/:id/photos/:imageId — remove one picture from the gallery.
router.delete('/:id/photos/:imageId', requireAuth, async (req, res, next) => {
  try {
    const venue = await manageableVenue(req, res);
    if (!venue) return;
    const photo = await db.prepare('SELECT id FROM images WHERE id = ? AND venue_id = ?').get(req.params.imageId, venue.id);
    if (!photo) return res.status(404).json({ error: 'Photo not found.' });
    await deleteImage(photo.id);
    res.json({ venue: await oneApiVenue(venue.id) });
  } catch (err) {
    next(err);
  }
});

// POST /api/venues/:id/photos/:imageId/cover — make this picture the first one
// shown (the cover of the gallery).
router.post('/:id/photos/:imageId/cover', requireAuth, async (req, res, next) => {
  try {
    const venue = await manageableVenue(req, res);
    if (!venue) return;
    const photo = await db.prepare('SELECT id FROM images WHERE id = ? AND venue_id = ?').get(req.params.imageId, venue.id);
    if (!photo) return res.status(404).json({ error: 'Photo not found.' });
    const first = await db.prepare('SELECT MIN(position) AS p FROM images WHERE venue_id = ?').get(venue.id);
    await db.prepare('UPDATE images SET position = ? WHERE id = ?').run(Number(first.p) - 1, photo.id);
    res.json({ venue: await oneApiVenue(venue.id) });
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
