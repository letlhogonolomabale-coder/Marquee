const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `id_${req.user.id}_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('ID upload must be an image.'));
    cb(null, true);
  },
});

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    verificationStatus: user.verification_status,
    isAdmin: !!user.is_admin,
  };
}

// If this account's email matches the ADMIN_EMAIL env var, flip its
// is_admin flag on. Runs on every signup/login so setting/changing the env
// var on Render takes effect the next time that person logs in — no manual
// database editing needed.
function syncAdminFlag(user) {
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const shouldBeAdmin = adminEmail && user.email === adminEmail ? 1 : 0;
  if (shouldBeAdmin !== user.is_admin) {
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(shouldBeAdmin, user.id);
    user.is_admin = shouldBeAdmin;
  }
  return user;
}

router.post('/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are all required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.trim(), email.toLowerCase().trim(), passwordHash);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  syncAdminFlag(user);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  syncAdminFlag(user);
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: publicUser(user) });
});

// Upload an ID photo to request host verification.
//
// IMPORTANT — production note: this stores the photo on local disk and, for
// demo continuity with the original prototype, auto-approves it after a
// short delay. Before real users upload real ID photos, replace this with:
//   1. Cloud storage (S3/GCS) instead of local disk, with encryption at rest
//   2. A real human review queue, or a proper ID-verification provider
//      (Stripe Identity, Onfido, Persona, etc.) instead of auto-approval
//   3. A data-retention/deletion policy for the images
router.post('/verify-id', requireAuth, upload.single('idImage'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No ID image uploaded.' });

  db.prepare('UPDATE users SET verification_status = ?, id_file_path = ? WHERE id = ?').run(
    'pending',
    req.file.path,
    req.user.id
  );

  // Demo-only auto-approval — see note above before shipping this for real.
  setTimeout(() => {
    db.prepare("UPDATE users SET verification_status = 'verified' WHERE id = ? AND verification_status = 'pending'").run(
      req.user.id
    );
  }, 6000);

  res.json({ status: 'pending', message: 'ID submitted — review usually takes 24–48 hours.' });
});

router.get('/verify-id/status', requireAuth, (req, res) => {
  const user = db.prepare('SELECT verification_status FROM users WHERE id = ?').get(req.user.id);
  res.json({ status: user.verification_status });
});

module.exports = router;
