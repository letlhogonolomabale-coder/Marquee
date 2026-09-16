// db.js — Turso (hosted libSQL) database setup, schema, and one-time seed
// data.
//
// This used to be a local SQLite file via better-sqlite3. That file lived on
// Render's disk, which gets wiped on every redeploy — so it never actually
// persisted users. Turso is the same SQL dialect (it's a SQLite fork) hosted
// remotely, so the schema and queries below are almost identical to before.
// The one real difference: every call is now a network request, so every
// query is async (you `await` it) instead of instant.
//
// Requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in your .env / Render
// environment variables.

const { createClient } = require('@libsql/client');

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.warn('\n⚠️  TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set — the app cannot reach its database.\n');
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ---- Compatibility shim -----------------------------------------------
// Mimics better-sqlite3's db.prepare(sql).get/all/run(...) shape so the
// route files barely change — the only difference at each call site is
// adding `await`. Supports both styles the old code used:
//   db.prepare('... WHERE id = ?').get(id)              (positional)
//   db.prepare('... VALUES (@title, @venue)').run(row)  (named, one object)
function normalizeArgs(params) {
  if (params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !Array.isArray(params[0])) {
    return params[0];
  }
  return params;
}

function shapeRunResult(rs) {
  return {
    changes: rs.rowsAffected,
    lastInsertRowid: rs.lastInsertRowid !== undefined && rs.lastInsertRowid !== null
      ? Number(rs.lastInsertRowid)
      : undefined,
  };
}

function prepare(sql) {
  return {
    async get(...params) {
      const rs = await client.execute({ sql, args: normalizeArgs(params) });
      return rs.rows[0];
    },
    async all(...params) {
      const rs = await client.execute({ sql, args: normalizeArgs(params) });
      return rs.rows;
    },
    async run(...params) {
      const rs = await client.execute({ sql, args: normalizeArgs(params) });
      return shapeRunResult(rs);
    },
  };
}

// For scripts with several ;-separated statements and no parameters
// (schema setup, ALTER TABLE migrations).
async function exec(sql) {
  await client.executeMultiple(sql);
}

// Real, atomic transactions — each statement inside `fn` runs through the
// tx-scoped `prepare` it's given (not the module-level one above), so they
// all commit or roll back together.
async function transaction(fn) {
  const tx = await client.transaction('write');
  const txPrepare = (sql) => ({
    async get(...params) {
      const rs = await tx.execute({ sql, args: normalizeArgs(params) });
      return rs.rows[0];
    },
    async all(...params) {
      const rs = await tx.execute({ sql, args: normalizeArgs(params) });
      return rs.rows;
    },
    async run(...params) {
      const rs = await tx.execute({ sql, args: normalizeArgs(params) });
      return shapeRunResult(rs);
    },
  });
  try {
    const result = await fn(txPrepare);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// ---- Schema -------------------------------------------------------------
async function ensureSchema() {
  await exec(`
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

    CREATE TABLE IF NOT EXISTS blog_posts (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      title            TEXT NOT NULL,
      happened_on      TEXT,                 -- display text, e.g. "February 2015" — not used for sorting
      summary          TEXT,                 -- short teaser shown on the card before it's expanded
      body             TEXT NOT NULL,        -- full write-up
      cover_photo_url  TEXT,                 -- falls back to a generic photo on the frontend if unset
      source_url       TEXT,                 -- optional link to read more elsewhere
      author_user_id   INTEGER,              -- the admin who wrote it; NULL if that account is later deleted
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_blog_posts_created ON blog_posts(created_at);
  `);

  // Lightweight migrations for DBs created before these columns existed —
  // CREATE TABLE IF NOT EXISTS above won't add columns to an already-existing
  // table.
  const eventColumns = (await prepare('PRAGMA table_info(events)').all()).map((c) => c.name);
  if (!eventColumns.includes('source_url')) await exec('ALTER TABLE events ADD COLUMN source_url TEXT');
  if (!eventColumns.includes('photo_url')) await exec('ALTER TABLE events ADD COLUMN photo_url TEXT');
  if (!eventColumns.includes('tm_id')) {
    await exec('ALTER TABLE events ADD COLUMN tm_id TEXT');
    await exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_events_tm_id ON events(tm_id)');
  }
  if (!eventColumns.includes('is_main')) await exec('ALTER TABLE events ADD COLUMN is_main INTEGER NOT NULL DEFAULT 0');
  if (!eventColumns.includes('is_hidden')) await exec('ALTER TABLE events ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0');
  if (!eventColumns.includes('event_date')) await exec('ALTER TABLE events ADD COLUMN event_date TEXT');

  const userColumns = (await prepare('PRAGMA table_info(users)').all()).map((c) => c.name);
  if (!userColumns.includes('is_admin')) await exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
}

// ---- Seed sync ------------------------------------------------------------
// Runs on every startup, but only INSERTs rows that aren't already there
// (matched by title+venue+city); it never touches or overwrites an existing
// row, so admin edits made via the app (price/date/photo) are never stomped
// on redeploy. Wrapped in a real transaction now, so a crash partway through
// can't leave a half-seeded city-main pick behind.
async function seedEvents() {
  const seed = require('./seedEvents');
  const { parseEventDateText } = require('./utils/eventDate');
  const withDefaults = (r) => ({ description: null, photo_key: null, photo_url: null, source_url: null, is_main: false, ...r });

  const addedCount = await transaction(async (tx) => {
    const insert = tx(`
      INSERT INTO events (title, venue, cat, price, date_text, description, city, lat, lng, photo_key, photo_url, color, source_url, is_main, event_date)
      VALUES (@title, @venue, @cat, @price, @date_text, @description, @city, @lat, @lng, @photo_key, @photo_url, @color, @source_url, @is_main, @event_date)
    `);
    const findExisting = tx(`
      SELECT 1 FROM events
      WHERE lower(trim(title)) = lower(trim(@title))
        AND lower(trim(venue)) = lower(trim(@venue))
        AND city = @city
      LIMIT 1
    `);
    const unsetCityMain = tx('UPDATE events SET is_main = 0 WHERE is_main = 1 AND city = ?');
    const cityHasMain = tx('SELECT 1 FROM events WHERE city = ? AND is_main = 1 LIMIT 1');
    const backfillMain = tx(`
      UPDATE events SET is_main = 1
      WHERE lower(trim(title)) = lower(trim(@title)) AND lower(trim(venue)) = lower(trim(@venue)) AND city = @city
    `);

    let added = 0;
    for (const r of seed) {
      const row = withDefaults(r);
      const idParams = { title: row.title, venue: row.venue, city: row.city };
      const existing = await findExisting.get(idParams);
      if (!existing) {
        // `is_main: true` in seedEvents.js only takes effect the moment this
        // row is first created — an admin is free to change it afterwards
        // through the app without a later redeploy ever snapping it back.
        if (row.is_main) await unsetCityMain.run(row.city);
        const parsedDate = parseEventDateText(row.date_text);
        await insert.run({ ...row, is_main: row.is_main ? 1 : 0, event_date: parsedDate ? parsedDate.toISOString() : null });
        added++;
      } else if (row.is_main) {
        // Row already exists — back-fill the pick, but only if nobody in
        // this city is currently marked main at all, so a deliberate admin
        // choice is never overwritten by a later redeploy.
        const hasMain = await cityHasMain.get(row.city);
        if (!hasMain) await backfillMain.run(idParams);
      }
    }
    return added;
  });

  if (addedCount > 0) console.log(`Seeded ${addedCount} new event(s) from seedEvents.js.`);

  // One-time backfill: any row that predates the event_date column (or was
  // otherwise never parsed) gets a best-effort pass now.
  const unparsed = await prepare('SELECT id, date_text FROM events WHERE event_date IS NULL').all();
  if (unparsed.length > 0) {
    const filled = await transaction(async (tx) => {
      const setEventDate = tx('UPDATE events SET event_date = ? WHERE id = ?');
      let count = 0;
      for (const r of unparsed) {
        const parsed = parseEventDateText(r.date_text);
        if (parsed) {
          await setEventDate.run(parsed.toISOString(), r.id);
          count++;
        }
      }
      return count;
    });
    if (filled > 0) console.log(`Backfilled event_date on ${filled} existing event(s).`);
  }
}

// ---- Blog seed sync ---------------------------------------------------
// Same idea as seedEvents() above, matched by title instead of
// title+venue+city: only inserts posts that aren't already there, so admin
// edits/deletes made through the Admin > Blog tab are never undone by a
// later redeploy.
async function seedBlogPosts() {
  const seed = require('./seedBlog');
  const insert = prepare(`
    INSERT INTO blog_posts (title, happened_on, summary, body, cover_photo_url, source_url)
    VALUES (@title, @happened_on, @summary, @body, @cover_photo_url, @source_url)
  `);
  const findExisting = prepare('SELECT 1 FROM blog_posts WHERE lower(trim(title)) = lower(trim(?)) LIMIT 1');

  let added = 0;
  for (const post of seed) {
    const existing = await findExisting.get(post.title);
    if (!existing) {
      await insert.run({ cover_photo_url: null, source_url: null, ...post });
      added++;
    }
  }
  if (added > 0) console.log(`Seeded ${added} new blog post(s) from seedBlog.js.`);
}

let readyPromise = null;
// Call this once at server startup (see server.js) before accepting any
// requests — creates tables/migrations/seed data if needed.
function init() {
  if (!readyPromise) {
    readyPromise = ensureSchema().then(seedEvents).then(seedBlogPosts);
  }
  return readyPromise;
}

module.exports = { prepare, exec, transaction, init, client };
