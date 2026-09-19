require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const authRoutes = require('./routes/auth');
const eventsRoutes = require('./routes/events');
const favoritesRoutes = require('./routes/favorites');
const adminRoutes = require('./routes/admin');
const blogRoutes = require('./routes/blog');
const webhookRoutes = require('./routes/webhooks');
const { requireAuth, requireAdmin } = require('./middleware/auth');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change_this_to_a_long_random_string') {
  console.warn('\n⚠️  JWT_SECRET is not set (or still the example value) — set a real one in .env before deploying.\n');
}

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

// Paystack webhooks MUST be mounted before express.json() below, with the
// raw body untouched — the HMAC signature check hashes the exact bytes
// Paystack sent, so parsing to JSON first (which the rest of the app
// wants) would make the signature never match. Everything else keeps
// using express.json().
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);
// Blog reading is public; writing is protected route-by-route inside blog.js
// (POST/PATCH/DELETE each require an admin), not at the mount point here.
app.use('/api/blog', blogRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve the frontend (and its PWA files) from the same server, so you can
// deploy this as one app instead of two. If you'd rather host the frontend
// separately (Vercel/Netlify), just delete this block and set CORS_ORIGIN
// above to that frontend's URL.
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(FRONTEND_DIR, {
  // Express's static middleware hides dotfiles/dot-directories by default
  // (dotfiles: 'ignore'), which would silently 404 /.well-known/assetlinks.json
  // — the file Android's Digital Asset Links check needs to verify this app
  // owns the site, required for the TWA to drop its browser address bar and
  // for the Play Store listing. Explicitly allow it.
  dotfiles: 'allow',
  setHeaders: (res, filePath) => {
    // Never let the browser (or Render's edge) cache the service worker or
    // the HTML shell — that's what caused stale deploys. Everything else
    // (icons, manifest) is fine to cache normally.
    if (filePath.endsWith('sw.js') || filePath.endsWith('Marquee.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(FRONTEND_DIR, 'Marquee.html'));
});

// Central error handler — catches multer errors (bad file type, too large)
// and anything else thrown in a route, so the client always gets JSON back.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
});

const PORT = process.env.PORT || 4000;

// Turso setup (schema creation + seeding) is async now, since every call is
// a network request — so the server waits for it to finish once at startup
// instead of doing it synchronously at require time.
db.init()
  .then(() => {
    app.listen(PORT, () => console.log(`Marquee API running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to set up the database — check TURSO_DATABASE_URL / TURSO_AUTH_TOKEN:', err);
    process.exit(1);
  });
