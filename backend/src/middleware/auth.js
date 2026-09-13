const jwt = require('jsonwebtoken');
const db = require('../db');

// Requires a valid "Authorization: Bearer <token>" header.
// On success, attaches { id, email } to req.user.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in.' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired — please log in again.' });
  }
}

// Same as requireAuth, but doesn't fail the request if there's no token —
// just leaves req.user undefined. Useful for routes that behave slightly
// differently for logged-in vs anonymous users but don't require login.
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      /* ignore invalid token, treat as anonymous */
    }
  }
  next();
}

// Chain after requireAuth. Only lets the request through if the logged-in
// user's is_admin flag is set (see ADMIN_EMAIL handling in auth.js).
function requireAdmin(req, res, next) {
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
  if (!user || !user.is_admin) return res.status(403).json({ error: 'Admin access only.' });
  next();
}

module.exports = { requireAuth, optionalAuth, requireAdmin };
