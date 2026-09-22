# Marquee update — Photos for events & venue galleries (cumulative)

This zip contains EVERYTHING changed since your original project, so it is safe to copy over
the original OR over any earlier update (Discover tabs, pricing, etc). Same paths, overwrite
when asked. The database upgrades itself on first start; everything already live stays live —
this includes a new `images` table, created automatically, no manual migration needed.

## Hosts and admins can now upload a real photo
Posting an event has an optional photo picker (instead of only pasting a link). A host can
change or remove it later from Account → Your hosted events. Admins can upload for ANY event
(including live/demo ones) from the admin panel, or still paste an https:// link if they'd
rather. If a photo fails to upload, the event is saved without it and you are NOT sent to
checkout — so nobody pays the R100 hosting fee for a listing that's missing its picture.

## Bars & Lounges and Fine Dining are now a gallery
Each venue can have up to **8 photos**. The listing card is a swipeable gallery (dots, a
"1 / 3" counter, arrows on desktop) instead of a plain icon once photos are added; tapping a
photo opens it full-screen with swipe/close. A venue with no photos still shows the emoji
placeholder exactly as before.
- Managed from Account → Bars & lounges: add several at once, remove one, or star a photo to
  make it the cover (shown first).
- The "Add your venue" form also lets you choose photos up front — they upload right after the
  venue is created, before the R50 checkout.
- Admins get a new **Venues** tab in the admin panel to manage the photo gallery on ANY venue
  (paid or not), separate from their existing Events tab.

## How photos are stored
Pictures are stored **in your database**, not on disk — Render wipes local disk on every
redeploy, so a disk-based upload would vanish on the next deploy. Served publicly at
`GET /api/images/:id` with a long cache lifetime (a picture never changes in place; replacing
one creates a new id). No new npm packages required.
- The browser shrinks every photo to at most 1600px on its long side and re-encodes it as a
  JPEG before uploading — faster on mobile data, and this also strips the EXIF data phones
  attach (including GPS location).
- The server independently checks the real file bytes (not just the filename or the browser's
  Content-Type) and only accepts JPEG, PNG or WebP — SVG is refused even if mislabeled, since it
  can carry scripts.
- Limits: 4 MB per picture, 8 photos per venue, 60 stored pictures total per non-admin account
  (admins are exempt). Deleting an event or a venue deletes its stored picture(s) too.

## Security fix included (from the previous update)
The page's `escapeHtml` helper doesn't escape quotes, so a venue link containing `"` could have
injected HTML attributes for every visitor. Fixed twice: links are re-serialised server-side
(quotes become %22) and the page uses an attribute-safe `escapeAttr` for these values. This zip
also closes the same hole for photo links: they're now inserted into `background-image` styles
through an escaping helper instead of being pasted in raw, so a hostile photo link can't inject
CSS onto an event card.

## Files
Edited: backend/src/db.js, server.js, routes/venues.js, routes/events.js,
utils/serializeEvent.js, frontend/Marquee.html, frontend/sw.js (cache → v12).
New: backend/src/routes/images.js, backend/src/utils/images.js.

## What was tested — and what wasn't
Tested: 40 backend checks against the real route code and a real SQLite database (upload
permissions and limits, cover ordering, cleanup of replaced/deleted pictures, quota, cascade
delete on venues); 42 browser checks in headless Chromium (the gallery and full-screen viewer,
every upload flow for hosts/owners/admins, EXIF stripping and photo shrinking, the CSS-injection
fix, a 320px phone width, no JS console errors).
NOT tested: your real Turso database (the zip doesn't include auth.js, the admin routes, or
package.json, so a full server couldn't be started here — the backend tests ran the real
route/db code against SQLite with stand-ins for Express and the Turso client instead). Do one
real photo upload after deploying to confirm Turso stores and serves BLOBs the same way.
NOT tested (carried over, still true): live Paystack, live Ticketmaster, Nominatim map pins.

## Known limits / decisions for you
- An uploaded event picture isn't included in the seed-file snippet ("Make a permanent part of
  the app") since it lives in the database, not in code — the sheet tells you this and you can
  paste a plain photo link instead if you want that event's picture to survive into
  `seedEvents.js`.
- Search results (`/api/events/search`) don't pick up a photo change until the next search —
  same as before, this wasn't a photo-specific gap.
- Photo captions/alt text are auto-generated ("Venue name — photo N of M"); there's no field to
  write your own per-photo caption.
- Reordering the gallery beyond "pick a new cover" isn't supported — photos otherwise stay in
  the order they were added.
