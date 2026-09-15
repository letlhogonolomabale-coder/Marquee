// db.js — SQLite database setup, schema, and one-time seed data.
//
// SQLite is used here because it needs zero setup (no separate DB server)
// and is genuinely fine for an app this size. When you outgrow it (heavy
// concurrent writes, multiple app servers), the SQL here is close enough
// to Postgres that migrating is mostly a driver swap, not a rewrite.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || './data/marquee.db';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    name                 TEXT NOT NULL,
    email                TEXT NOT NULL UNIQUE,
    password_hash        TEXT NOT NULL,
    verification_status  TEXT NOT NULL DEFAULT 'none', -- none | pending | verified | rejected
    id_file_path         TEXT,
    is_admin             INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    host_user_id  INTEGER,               -- NULL = editorial/seed event, not user-hosted
    title         TEXT NOT NULL,
    venue         TEXT NOT NULL,
    cat           TEXT NOT NULL,
    price         TEXT NOT NULL DEFAULT 'Free',
    date_text     TEXT NOT NULL,
    description   TEXT,
    city          TEXT NOT NULL,
    lat           REAL,
    lng           REAL,
    photo_key     TEXT,
    photo_url     TEXT,                  -- admin-set custom image link (overrides photo_key)
    color         TEXT,
    source_url    TEXT,                  -- link to the original listing (host-provided or live-sourced)
    tm_id         TEXT UNIQUE,           -- Ticketmaster event id, set only for live-sourced rows
    is_main       INTEGER NOT NULL DEFAULT 0, -- admin-picked featured event; at most one row is 1
    is_hidden     INTEGER NOT NULL DEFAULT 0, -- admin-hidden event; excluded from the public Discover list
    event_date    TEXT,                   -- best-effort parsed timestamp (ISO), used to detect past events; NULL = unknown, always treated as upcoming
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id     INTEGER NOT NULL,
    event_id    INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, event_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_events_city ON events(city);
`);

// Lightweight migrations for DBs created before these columns existed —
// CREATE TABLE IF NOT EXISTS above won't add columns to an already-existing
// table.
const eventColumns = db.prepare("PRAGMA table_info(events)").all().map((c) => c.name);
if (!eventColumns.includes('source_url')) {
  db.exec('ALTER TABLE events ADD COLUMN source_url TEXT');
}
if (!eventColumns.includes('photo_url')) {
  db.exec('ALTER TABLE events ADD COLUMN photo_url TEXT');
}
if (!eventColumns.includes('tm_id')) {
  db.exec('ALTER TABLE events ADD COLUMN tm_id TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_events_tm_id ON events(tm_id)');
}
if (!eventColumns.includes('is_main')) {
  db.exec('ALTER TABLE events ADD COLUMN is_main INTEGER NOT NULL DEFAULT 0');
}
if (!eventColumns.includes('is_hidden')) {
  db.exec('ALTER TABLE events ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0');
}
if (!eventColumns.includes('event_date')) {
  db.exec('ALTER TABLE events ADD COLUMN event_date TEXT');
}
const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userColumns.includes('is_admin')) {
  db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
}

// ---- seed sync, so /api/events returns real rows on a fresh DB, and any
// new listing added to seedEvents.js later (e.g. via the admin panel's
// "make permanent" flow, or by hand) actually shows up on the next deploy
// too — not just on a brand-new database. Runs on every startup, but only
// INSERTs rows that aren't already there (matched by title+venue+city);
// it never touches or overwrites an existing row, so admin edits made via
// the app (price/date/photo) are never stomped on redeploy.
const seed = require('./seedEvents');
const { parseEventDateText } = require('./utils/eventDate');
const insert = db.prepare(`
    INSERT INTO events (title, venue, cat, price, date_text, description, city, lat, lng, photo_key, photo_url, color, source_url, is_main, event_date)
    VALUES (@title, @venue, @cat, @price, @date_text, @description, @city, @lat, @lng, @photo_key, @photo_url, @color, @source_url, @is_main, @event_date)
  `);
const findExisting = db.prepare(`
    SELECT 1 FROM events
    WHERE lower(trim(title)) = lower(trim(@title))
      AND lower(trim(venue)) = lower(trim(@venue))
      AND city = @city
    LIMIT 1
  `);
const unsetCityMain = db.prepare('UPDATE events SET is_main = 0 WHERE is_main = 1 AND city = ?');
// Fill in optional fields the older, simpler seed rows don't have — lets
// an admin "promoted" event (with a real photo/link) sit in the same file
// as the original editorial listings without needing to touch every row.
const withDefaults = (r) => ({ description: null, photo_key: null, photo_url: null, source_url: null, is_main: false, ...r });
const insertMissing = db.transaction((rows) => {
  let added = 0;
  rows.forEach((r) => {
    const row = withDefaults(r);
    const existing = findExisting.get(row);
    if (!existing) {
      // `is_main: true` in seedEvents.js only takes effect the moment this
      // row is first created — it picks that city's main event once, the
      // same way an admin's manual pick would, and an admin is free to
      // change it afterwards through the app without a later redeploy
      // ever snapping it back (this insert never runs again for a row
      // that already exists).
      if (row.is_main) unsetCityMain.run(row.city);
      const parsedDate = parseEventDateText(row.date_text);
      insert.run({ ...row, is_main: row.is_main ? 1 : 0, event_date: parsedDate ? parsedDate.toISOString() : null });
      added++;
    } else if (row.is_main) {
      // Row already exists (e.g. it was added to the DB before is_main
      // seeding existed) — back-fill the pick, but only if nobody in this
      // city is currently marked main at all, so a deliberate admin
      // choice is never overwritten by a later redeploy.
      const cityHasMain = db.prepare('SELECT 1 FROM events WHERE city = ? AND is_main = 1 LIMIT 1').get(row.city);
      if (!cityHasMain) {
        db.prepare(`
          UPDATE events SET is_main = 1
          WHERE lower(trim(title)) = lower(trim(@title)) AND lower(trim(venue)) = lower(trim(@venue)) AND city = @city
        `).run(row);
      }
    }
  });
  return added;
});
const addedCount = insertMissing(seed);
if (addedCount > 0) console.log(`Seeded ${addedCount} new event(s) from seedEvents.js.`);

// One-time backfill: any row that predates the event_date column (or was
// otherwise never parsed) gets a best-effort pass now, so upgrading an
// already-live database still enables the Past-page behavior without a
// full reseed.
const unparsed = db.prepare('SELECT id, date_text FROM events WHERE event_date IS NULL').all();
if (unparsed.length > 0) {
  const setEventDate = db.prepare('UPDATE events SET event_date = ? WHERE id = ?');
  const backfill = db.transaction((rows) => {
    let filled = 0;
    rows.forEach((r) => {
      const parsed = parseEventDateText(r.date_text);
      if (parsed) {
        setEventDate.run(parsed.toISOString(), r.id);
        filled++;
      }
    });
    return filled;
  });
  const filled = backfill(unparsed);
  if (filled > 0) console.log(`Backfilled event_date on ${filled} existing event(s).`);
}

module.exports = db;
