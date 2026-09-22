// images.js — GET /api/images/:id serves an uploaded picture (event photo or
// venue gallery photo). Public, like the pages that show them. A picture never
// changes once stored (replacing one creates a new id), so browsers may cache it
// for a year.
const express = require('express');
const db = require('../db');
const { toBuffer, ALLOWED_MIMES } = require('../utils/images');

const router = express.Router();

router.get('/:id', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Picture not found.' });
    const row = await db.prepare('SELECT mime, data FROM images WHERE id = ?').get(Number(req.params.id));
    if (!row || !ALLOWED_MIMES.includes(row.mime)) return res.status(404).json({ error: 'Picture not found.' });
    const body = toBuffer(row.data);
    res.set({
      'Content-Type': row.mime,
      'Content-Length': String(body.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      // The frontend may be hosted on another origin than the API (see CORS_ORIGIN).
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.end(body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
