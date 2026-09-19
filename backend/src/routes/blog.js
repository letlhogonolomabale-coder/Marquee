// blog.js — the "Made waves" page: short posts about internet moments,
// editable by admins from the Admin > Blog tab (or permanently via
// seedBlog.js, same pattern as events). Reading is public — no login
// needed — writing is admin-only.
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { fetchSitePreview } = require('../utils/sitePreview');

const router = express.Router();

function toApiPost(row) {
  return {
    id: row.id,
    title: row.title,
    happenedOn: row.happened_on,
    summary: row.summary,
    body: row.body,
    coverPhotoUrl: row.cover_photo_url,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
  };
}

// GET /api/blog — every post, newest-added first. Public.
router.get('/', async (req, res, next) => {
  try {
    const rows = await db.prepare('SELECT * FROM blog_posts ORDER BY created_at DESC').all();
    res.json({ posts: rows.map(toApiPost) });
  } catch (err) {
    next(err);
  }
});

// GET /api/blog/site-preview?url=... — fetches the source link and pulls
// out that site's own og:image (falling back to its favicon), so the
// admin can use it as the post's cover photo without hunting one down by
// hand. Admin only, since it makes an outbound request on the admin's
// behalf. Registered before GET /:id so "site-preview" isn't swallowed by
// that param route.
router.get('/site-preview', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const url = (req.query.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'Give a source link starting with http:// or https:// first.' });
    }
    const { imageUrl, siteName } = await fetchSitePreview(url);
    if (!imageUrl) {
      return res.status(404).json({ error: "Couldn't find a picture on that site." });
    }
    res.json({ imageUrl, siteName });
  } catch (err) {
    res.status(502).json({ error: "Couldn't reach that source link to pull a picture from it." });
  }
});

// GET /api/blog/:id — a single post. Public.
router.get('/:id', async (req, res, next) => {
  try {
    const row = await db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Post not found.' });
    res.json({ post: toApiPost(row) });
  } catch (err) {
    next(err);
  }
});

// POST /api/blog — create a post. Admin only.
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { title, happenedOn, summary, body, coverPhotoUrl, sourceUrl } = req.body;
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: 'Title and body are required.' });
    }
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl.trim())) {
      return res.status(400).json({ error: 'Source link must start with http:// or https://' });
    }
    if (coverPhotoUrl && !/^https?:\/\//i.test(coverPhotoUrl.trim())) {
      return res.status(400).json({ error: 'Cover photo link must start with http:// or https://' });
    }

    const result = await db
      .prepare(`
        INSERT INTO blog_posts (title, happened_on, summary, body, cover_photo_url, source_url, author_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        title.trim(),
        happenedOn?.trim() || null,
        summary?.trim() || null,
        body.trim(),
        coverPhotoUrl?.trim() || null,
        sourceUrl?.trim() || null,
        req.user.id
      );

    const row = await db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ post: toApiPost(row) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/blog/:id — edit a post. Admin only.
router.patch('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const row = await db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Post not found.' });

    const { title, happenedOn, summary, body, coverPhotoUrl, sourceUrl } = req.body;
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl.trim())) {
      return res.status(400).json({ error: 'Source link must start with http:// or https://' });
    }
    if (coverPhotoUrl && !/^https?:\/\//i.test(coverPhotoUrl.trim())) {
      return res.status(400).json({ error: 'Cover photo link must start with http:// or https://' });
    }

    await db.prepare(`
      UPDATE blog_posts
      SET title = ?, happened_on = ?, summary = ?, body = ?, cover_photo_url = ?, source_url = ?
      WHERE id = ?
    `).run(
      title?.trim() || row.title,
      happenedOn?.trim() || null,
      summary?.trim() || null,
      body?.trim() || row.body,
      coverPhotoUrl?.trim() || null,
      sourceUrl?.trim() || null,
      row.id
    );

    const updated = await db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(row.id);
    res.json({ post: toApiPost(updated) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/blog/:id — remove a post. Admin only.
//
// Records a tombstone first (same idea as DELETE /api/events/admin/:id) so
// a seed post — e.g. one from seedBlog.js — doesn't just come back on the
// next server restart. Without this, seedBlogPosts() only checks "does a
// post with this title exist yet", which looks identical to "was this
// deleted on purpose" once the row is gone.
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const row = await db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Post not found.' });

    await db.prepare('INSERT INTO removed_blog_posts (title) VALUES (?)').run(db.normalizeTitle(row.title));
    await db.prepare('DELETE FROM blog_posts WHERE id = ?').run(row.id);
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
