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
  // Was 8MB — too small for a full-resolution photo straight from a modern
  // phone camera (a single 12-48MP shot easily lands in the 10-20MB range),
  // which meant real users hit this silently: their upload would fail with
  // a cryptic "File too large" and no obvious next step. 20MB comfortably
  // covers a real camera photo without opening the door to arbitrarily huge
  // uploads.
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(Object.assign(new Error('ID upload must be an image (JPG, PNG, HEIC, etc).'), { status: 400 }));
    }
    cb(null, true);
  },
});

// Wraps upload.single('idImage') so a rejected upload (too large, wrong
// file type) reaches the client as a clear, friendly message instead of
// Multer's raw error text — and with the right 400 status instead of
// falling through to the generic 500 in the central error handler.
function uploadIdImage(req, res, next) {
  upload.single('idImage')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: "That photo is too large — please use one under 20MB (most phones let you pick a lower quality/size when sharing)." });
    }
    return res.status(err.status || 400).json({ error: err.message || 'Could not process that upload.' });
  });
}

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
    hostOrgName: user.host_org_name,
    hostPhone: user.host_phone,
    hostEventTypes: user.host_event_types,
    hostSocial: user.host_social,
  };
}

// If this account's email matches the ADMIN_EMAIL env var, flip its
// is_admin flag on. Runs on every signup/login so setting/changing the env
// var on Render takes effect the next time that person logs in — no manual
// database editing needed.
async function syncAdminFlag(user) {
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const shouldBeAdmin = adminEmail && user.email === adminEmail ? 1 : 0;
  if (shouldBeAdmin !== user.is_admin) {
    await db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(shouldBeAdmin, user.id);
    user.is_admin = shouldBeAdmin;
  }
  return user;
}

// Email rule: must contain '@', and — deliberately stricter than typical —
// no uppercase letters at all, so what's typed is exactly what gets stored,
// with no silent case-folding surprises later. Also expects a normal
// user@domain.tld shape so junk input still gets caught.
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
}

router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are all required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid email — lowercase only, and it must contain an @.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

    const passwordHash = bcrypt.hashSync(password, 10);
    const result = await db
      .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run(name.trim(), email.toLowerCase().trim(), passwordHash);

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    await syncAdminFlag(user);
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    await syncAdminFlag(user);
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// Step 1 of applying to host: a few questions about who they are and what
// they run, collected BEFORE the ID upload step below. The frontend's apply
// view checks hostOrgName (see publicUser() above) to decide which of the
// two steps to show — once this is saved, it skips straight to the ID
// upload on every future visit, so this only has to be filled in once.
router.post('/host-info', requireAuth, async (req, res, next) => {
  try {
    const { orgName, phone, eventTypes, social } = req.body;
    if (!orgName?.trim() || !phone?.trim()) {
      return res.status(400).json({ error: 'Organizer/business name and a phone number are required.' });
    }

    await db.prepare(`
      UPDATE users SET host_org_name = ?, host_phone = ?, host_event_types = ?, host_social = ? WHERE id = ?
    `).run(
      orgName.trim(),
      phone.trim(),
      eventTypes?.trim() || null,
      social?.trim() || null,
      req.user.id
    );

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// Upload an ID photo to request host verification. An admin now reviews and
// approves/rejects it by eye from the Admin panel (see routes/admin.js) —
// no more auto-approval.
//
// IMPORTANT — production note before this handles real users' real IDs:
//   1. Cloud storage (S3/GCS) instead of local disk, with encryption at rest
//   2. A data-retention/deletion policy for the images (delete once
//      reviewed, rather than keeping them indefinitely)
//   3. Consider a dedicated ID-verification provider (Stripe Identity,
//      Onfido, Persona) instead of manual photo review, for both liability
//      and fraud-detection reasons at any real scale
router.post('/verify-id', requireAuth, uploadIdImage, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No ID image uploaded.' });

    await db.prepare('UPDATE users SET verification_status = ?, id_file_path = ? WHERE id = ?').run(
      'pending',
      req.file.path,
      req.user.id
    );

    res.json({ status: 'pending', message: 'ID submitted — you\'ll be notified once it\'s reviewed.' });
  } catch (err) {
    next(err);
  }
});

router.get('/verify-id/status', requireAuth, async (req, res, next) => {
  try {
    const user = await db.prepare('SELECT verification_status FROM users WHERE id = ?').get(req.user.id);
    res.json({ status: user.verification_status });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
