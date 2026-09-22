// images.js — shared helpers for picture uploads (event photos and venue galleries).
//
// Pictures are stored in the `images` table (see db.js) and served by
// GET /api/images/:id. Uploads arrive as the raw image bytes in the request body
// (Content-Type: image/jpeg | image/png | image/webp) — no multipart parsing and no
// extra npm packages. The browser shrinks every photo before sending (and thereby
// strips its EXIF/GPS data); the checks here are the server-side backstop.
const express = require('express');
const db = require('../db');

const MAX_BYTES = 4 * 1024 * 1024;   // per picture
const MAX_VENUE_PHOTOS = 8;          // gallery size per venue
const MAX_USER_IMAGES = 60;          // per non-admin account, so nobody can fill the database
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_URL_RE = /^\/api\/images\/(\d+)$/;

// Reads the body as a Buffer for the three allowed types only. Put it AFTER
// requireAuth on a route so nobody unauthenticated makes the server buffer 4 MB.
const imageBody = express.raw({
  type: (req) => ALLOWED_MIMES.includes(String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()),
  limit: MAX_BYTES,
});

// Decides the real type from the file's first bytes rather than trusting the
// Content-Type header. Returns null for anything that isn't a JPEG, PNG or WebP
// (SVG in particular is never accepted — it can carry scripts).
function sniffMime(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

// Returns { mime } or { error } for a request body that should be a picture.
function checkUpload(body) {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return { error: 'Send the picture as a JPEG, PNG or WebP image.' };
  }
  const mime = sniffMime(body);
  if (!mime) return { error: 'That file is not a JPEG, PNG or WebP picture.' };
  return { mime };
}

const imageUrl = (id) => `/api/images/${id}`;
const imageIdFromUrl = (url) => {
  const m = IMAGE_URL_RE.exec(String(url || ''));
  return m ? Number(m[1]) : null;
};

async function isAdmin(userId) {
  const u = await db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
  return !!(u && u.is_admin);
}

// Non-admins are capped at MAX_USER_IMAGES stored pictures in total.
async function overQuota(userId) {
  if (await isAdmin(userId)) return false;
  const row = await db.prepare('SELECT COUNT(*) AS n FROM images WHERE uploader_id = ?').get(userId);
  return Number(row.n) >= MAX_USER_IMAGES;
}

async function storeImage({ buffer, mime, userId, venueId = null, position = 0 }) {
  // A plain Uint8Array copy: the libSQL client accepts it as a BLOB value, and it
  // isn't mistaken for a named-parameter object by db.js's argument normaliser.
  const bytes = new Uint8Array(buffer);
  const result = await db
    .prepare('INSERT INTO images (mime, data, uploader_id, venue_id, position) VALUES (?, ?, ?, ?, ?)')
    .run(mime, bytes, userId, venueId, position);
  return result.lastInsertRowid;
}

const deleteImage = (id) => db.prepare('DELETE FROM images WHERE id = ?').run(id);

// Deletes the stored picture behind an '/api/images/<id>' link; anything else
// (an external https:// link, null) is left alone.
async function deleteImageByUrl(url) {
  const id = imageIdFromUrl(url);
  if (id !== null) await deleteImage(id);
}

// Libsql returns BLOBs as ArrayBuffer, other drivers as Buffer/Uint8Array.
function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(data);
}

module.exports = {
  MAX_BYTES, MAX_VENUE_PHOTOS, MAX_USER_IMAGES, ALLOWED_MIMES, IMAGE_URL_RE,
  imageBody, sniffMime, checkUpload, imageUrl, imageIdFromUrl,
  isAdmin, overQuota, storeImage, deleteImage, deleteImageByUrl, toBuffer,
};
