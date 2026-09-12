require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const eventsRoutes = require('./routes/events');
const favoritesRoutes = require('./routes/favorites');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change_this_to_a_long_random_string') {
  console.warn('\n⚠️  JWT_SECRET is not set (or still the example value) — set a real one in .env before deploying.\n');
}

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/favorites', favoritesRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve the frontend (and its PWA files) from the same server, so you can
// deploy this as one app instead of two. If you'd rather host the frontend
// separately (Vercel/Netlify), just delete this block and set CORS_ORIGIN
// above to that frontend's URL.
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(FRONTEND_DIR, 'Marquee.html'));
});

// Central error handler — catches multer errors (bad file type, too large)
// and anything else thrown in a route, so the client always gets JSON back.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Marquee API running on http://localhost:${PORT}`));
