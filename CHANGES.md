# Marquee — pricing update

Copy these files over your project (same paths). Nothing else changes; the database
upgrades itself the first time the server starts, and everything already live stays live.

## What's new
- **R100 hosting fee.** A verified host posts an event → it is saved as *unpaid* and hidden
  from Discover, search and its public page → the host is sent to Paystack checkout →
  the event goes live once payment is confirmed. Unpaid events stay visible to their host,
  with a "Pay R100 to publish" button. Admins post for free.
- **Boost removed.** Boost routes, button, sorting and toasts are gone. The two old boost
  database columns are left in place, unused (removing columns is riskier than ignoring them).
- **Search.** New search box on Discover → `GET /api/events/search?q=` across all cities
  (title, venue, description, category, city). Upcoming, paid, non-hidden events only.
- **Bars & lounges: R50 per 30 days.** New "Bars & lounges" section in the profile. Any
  logged-in member can register a venue and pay. While the plan is active, every event whose
  venue name matches (case-insensitive, same city) gets a gold "Partner venue" highlight and
  ranks first (just under the admin's main pick) in Discover and search.
- **Safe payments.** Amounts are checked (a R1 payment can't unlock a R100 event); the webhook
  and the browser-return check can both run without applying a payment twice; a customer can
  only confirm their own payment.

## Files
Edited: backend/.env.example, backend/src/db.js, server.js, routes/events.js, routes/webhooks.js,
utils/paystack.js, utils/serializeEvent.js, frontend/Marquee.html, frontend/sw.js (cache bumped to v10).
New: routes/payments.js, routes/venues.js, utils/cities.js, utils/payments.js.

## Settings (optional; defaults shown)
HOST_FEE_CENTS=10000 · VENUE_PLAN_CENTS=5000 · VENUE_PLAN_DAYS=30. Uses your existing
PAYSTACK_SECRET_KEY and webhook; no new Paystack setup needed.

## Before you go live — test in Paystack TEST mode first
Not tested against Paystack itself (no network where this was built). Use an `sk_test_` key and:
1. Post an event → pay the R100 test charge → event appears in Discover.
2. Post another, close the browser at checkout after paying → it should still go live (webhook).
3. Add a venue → pay R50 → events at that venue get the gold badge; try paying again (+30 days).

## Known limits
- Venue highlighting matches on the venue *name*. Hosts must type it the same way on their
  events. Ticketmaster's spelling of a venue may differ from the owner's.
- The R50 plan is a one-off 30-day payment, not an automatic monthly debit; owners pay again
  to renew. (Automatic renewals would need Paystack Plans.)
- Search covers events already stored. A city's live Ticketmaster events are stored the first
  time someone scans that city.
- Venue names are first-come, first-served; nothing checks the person really owns the venue.
- Host ID verification is still the auto-approve demo. Fix before promoting the app.
