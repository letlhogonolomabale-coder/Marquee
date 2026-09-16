// admin.js — user management for the site owner: viewing accounts (with
// their uploaded ID image so verification can be done by eye), approving or
// rejecting a host's verification, and deleting accounts. Every route here
// is mounted behind requireAuth + requireAdmin in server.js, so nothing in
// this file needs to re-check admin status itself.
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const router = express.Router();

function publicAdminUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    verificationStatus: row.verification_status,
    isAdmin: !!row.is_admin,
    hasIdUpload: !!row.id_file_path,
    createdAt: row.created_at,
  };
}

// GET /api/admin/users — every account, newest first.
router.get('/users', async (req, res, next) => {
  try {
    const rows = await db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    res.json({ users: rows.map(publicAdminUser) });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users/:id/id-image — streams the uploaded ID photo so it
// can be viewed inline in the admin panel, no separate tool needed.
router.get('/users/:id/id-image', async (req, res, next) => {
  try {
    const user = await db.prepare('SELECT id_file_path FROM users WHERE id = ?').get(req.params.id);
    if (!user || !user.id_file_path) return res.status(404).json({ error: 'No ID on file for this user.' });
    const filePath = path.resolve(user.id_file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'ID file is missing on disk.' });
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:id/verify — approve a pending (or previously
// rejected) verification.
router.post('/users/:id/verify', async (req, res, next) => {
  try {
    const result = await db.prepare("UPDATE users SET verification_status = 'verified' WHERE id = ?").run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ status: 'verified' });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:id/reject — reject a pending verification. They
// stay a normal member and can re-apply (re-upload) later if you want.
router.post('/users/:id/reject', async (req, res, next) => {
  try {
    const result = await db.prepare("UPDATE users SET verification_status = 'rejected' WHERE id = ?").run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ status: 'rejected' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/users/:id — remove an account entirely. Their favorites
// go with them (ON DELETE CASCADE); any events they hosted stay live but
// become unattributed (ON DELETE SET NULL on events.host_user_id) rather
// than disappearing. Their uploaded ID file is deleted from disk too.
router.delete('/users/:id', async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    if (targetId === req.user.id) {
      return res.status(400).json({ error: "You can't delete your own account from here." });
    }
    const user = await db.prepare('SELECT id_file_path FROM users WHERE id = ?').get(targetId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    if (user.id_file_path) {
      fs.unlink(user.id_file_path, () => {}); // best-effort; ignore if already gone
    }
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
