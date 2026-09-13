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
    source_url    TEXT,                  -- link to the original listing (host-provided)
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
const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userColumns.includes('is_admin')) {
  db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
}

// ---- one-time seed, so /api/events returns real rows on a fresh DB ----
// This is the same data that used to live in the frontend's EVENT_POOL array.
const seedCount = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
if (seedCount === 0) {
  const seed = require('./seedEvents');
  const insert = db.prepare(`
    INSERT INTO events (title, venue, cat, price, date_text, city, lat, lng, photo_key, color)
    VALUES (@title, @venue, @cat, @price, @date_text, @city, @lat, @lng, @photo_key, @color)
  `);
  const insertMany = db.transaction((rows) => rows.forEach((r) => insert.run(r)));
  insertMany(seed);
  console.log(`Seeded ${seed.length} events.`);
}

module.exports = db;
