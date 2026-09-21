# Marquee update — Discover tabs + new pricing (cumulative)

This zip contains EVERYTHING changed since your original project, so it is safe to copy over
the original OR over the earlier "pricing update". Same paths, overwrite when asked. The database
upgrades itself on first start; everything already live stays live.

## Discover now has four tabs
**🎟️ Events · 🍸 Bars & Lounges · 🍽️ Fine Dining · 🤝 Meetups** (equal-width, fits a 320px phone).
- **Events**: everything except meetups (keeps the category chips and sorting).
- **Meetups**: events whose category is "Meetup" (hosts pick it in the post form).
- **Bars & Lounges / Fine Dining**: *listed venues* — bars, lounges, clubs and restaurants that paid the
  R50 plan. Each gets a card with type, address, about text, map pin and website link, plus a gold
  "Partner" outline. If nobody is listed in a city yet, the tab says so and offers "Get listed — R50 / month".
- Tabs follow the city you scan; scanning a city with no events still updates the city everywhere.

## Pricing (from the previous update, unchanged)
R100 to host an event (hidden until paid; admins free) · boost removed · R50 per 30 days for venues ·
search across all cities · payments verified by amount and processed once (webhook + browser return).

## Venues are now real listings
- New optional fields when adding a venue: about, street address (used for the map pin), website/Instagram link.
- Owners can edit those details any time from Account → Bars & lounges (name, type and city are locked).
- Types: Bar, Lounge, Club, Fine Dining, Other. Old "Restaurant" venues are shown as Fine Dining.
- Public list: `GET /api/venues?city=…&section=bars|dining` — only venues with an active plan; lapsing = dropping off the tab.
- Events at a listed venue still get the gold highlight and rank first in Discover and search.

## Security fix included
The page's `escapeHtml` helper doesn't escape quotes, so a venue link containing `"` could have
injected HTML attributes for every visitor. Fixed twice: links are re-serialised server-side
(quotes become %22) and the page uses a new attribute-safe `escapeAttr` for these values.

## Files
Edited: backend/.env.example, backend/src/db.js, server.js, routes/events.js, routes/webhooks.js,
utils/paystack.js, utils/serializeEvent.js, frontend/Marquee.html, frontend/sw.js (cache → v11).
New: routes/payments.js, routes/venues.js, utils/cities.js, utils/payments.js.
Optional settings (defaults): HOST_FEE_CENTS=10000 · VENUE_PLAN_CENTS=5000 · VENUE_PLAN_DAYS=30.

## What was tested — and what wasn't
Tested: 57 backend checks against the real route code and a real SQLite database (fees, payments,
partner ranking, search, venue listings, ownership, upgrades from earlier schemas); 30 browser checks in
headless Chromium (all four tabs, empty states, escaping with hostile data, 320px fit, venue form/edit flow,
no JS errors) with the API mocked.
NOT tested: live Paystack (use `sk_test_` keys first: pay R100, pay R50, close the browser mid-checkout),
live Ticketmaster, Nominatim map pins, or your real Turso database.

## Known limits / decisions for you
- Bars & Lounges and Fine Dining start EMPTY until owners list. Nothing is invented.
- Meetups use the normal R100 host fee. Say the word if meetups should be free or cheaper.
- Venue highlighting matches on the venue *name*; hosts must spell it the same on their events.
- The R50 plan is a one-off 30-day payment, not an automatic monthly debit.
- Search covers events only (not venue listings yet).
- Venue names are first-come, first-served; nothing verifies real ownership.
- Host ID verification is still the auto-approve demo. Fix before promoting the app.
