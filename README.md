# Marquee — now with a real backend

This turns the original static prototype into a real client/server app:

- **Real accounts** — signup/login with hashed passwords + JWT sessions (was: name/email typed into memory)
- **A real database** (SQLite) — events, users, and favorites now persist across refreshes and devices
- **Real event data source** — `/api/events` queries the DB instead of randomly sampling a hardcoded array; the old `EVENT_POOL` is now the DB's seed data
- **Real ID-verification workflow** — file upload is saved server-side and status-tracked (`none → pending → verified`), instead of a `setTimeout` in the browser
- **Real geocoding** — hosted events get real coordinates from OpenStreetMap's Nominatim API instead of defaulting to the Joburg city center
- **Installable as a PWA** — manifest + service worker added, so it can be added to a home screen and opens instantly / works offline for the shell

What's *not* changed: the ride sheet still hands off to the real Uber app/site (that was already real), and the map embed still uses live OpenStreetMap (already real). Past-event comments are still demo-only/in-memory — see "What to build next" below.

## Project layout

```
backend/     Node.js + Express API + SQLite database
frontend/    Marquee.html (now calls the API) + manifest.json + sw.js + icons
```

## Running it locally

```bash
cd backend
cp .env.example .env
# open .env and set a real JWT_SECRET — a generator command is in the comments there
npm install
npm start
```

Then open **http://localhost:4000** — the backend serves the frontend directly, so it's one URL, one app. (There's nothing to run in `frontend/` separately; it's static files served by Express.)

To open the frontend as a plain file instead (e.g. `file:///.../Marquee.html`) while the backend runs separately, append `?api=http://localhost:4000` to the URL so it knows where to send API calls.

## Testing the flow

1. Go to the **Host** tab → create an account (any name/email/8+ char password)
2. Upload any image as your "ID" — it auto-approves after ~6 seconds (see the note in `backend/src/routes/auth.js` about replacing this before real users are involved)
3. Post an event — it'll geocode the venue for real and show up in **Discover**
4. Star an event to save it — refresh the page, it's still there (pulled from the DB, not memory)

## Before this goes live for real users

The code has inline comments flagging these, but the short version:

1. **ID verification is auto-approved for demo continuity.** Before real ID photos are involved, swap this for a real review queue or a provider like Stripe Identity/Onfido/Persona, and move the stored files to encrypted cloud storage instead of local disk. This is the single most important thing to fix before this leaves your laptop.
2. **SQLite → Postgres** once you have concurrent write load or need multiple server instances (SQLite is genuinely fine for early usage though).
3. **JWT_SECRET** must be a real random value in production, not the placeholder.
4. **Rate limiting** isn't in yet — add it (e.g. `express-rate-limit`) on `/api/auth/*` before this is public, so people can't brute-force logins.
5. **HTTPS** — required for service workers and geolocation outside of localhost; your host (Render, Railway, Fly.io, a VPS + Caddy, etc.) will typically handle this for you.

## What to build next (not done yet)

- **Real event sourcing.** Right now events only come from hosts posting them, plus the seeded demo data. If you want the "AI scan finds events near you" feeling from the original prototype to be real, that means integrating an events API (Ticketmaster, Eventbrite, etc.) or building a scraper — this is a bigger, separate project.
- **Real distance ("X km away").** The original prototype faked this per-event; showing real distance needs the user's location (`navigator.geolocation`) and a distance calculation against each event's now-real lat/lng.
- **Past-event comments/photos** are still in-memory only — same pattern as favorites, just needs a `comments` table + two endpoints if you want it to persist.
- **Push notifications** for saved-event reminders — currently a fake in-page toast; real push needs the Web Push API + a subscription table, wired up now that there's a real backend to hold subscriptions.
