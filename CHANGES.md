# Marquee update — notification bell + admin broadcasts

Five files, same paths — overwrite when asked. Database upgrades itself on
first start (a `broadcasts` table, and a `notifications_seen_at` column on
users; both harmless additions, nothing existing is touched).

## What it does

**The bell (top-right, next to Admin), for every logged-in user:**
- A badge shows how many things are new: unread admin broadcasts, plus —
  for admins only — how many events/venues are waiting on approval right
  now. Refreshes on load and every 60 seconds.
- Tapping it opens a panel: admins see a "N listings waiting on your
  review" row with a link straight into the Admin panel, then every
  broadcast (newest first) with a relative time ("18h ago"). Opening it
  marks broadcasts as read — the pending-review count only drops when an
  admin actually approves or rejects those listings.

**Admin → Broadcasts (new tab, alongside Events/Venues/Users/Blog):**
compose a short message and send it to every user's bell, see the full
send history, delete one you sent by mistake.

## Files
db.js (`broadcasts` table + `users.notifications_seen_at`), server.js
(mounts the new route), routes/notifications.js (GET /, POST /seen, POST
/broadcast, GET /admin/all, DELETE /admin/:id — all admin-only except the
first two), Marquee.html (bell button + badge + panel + the admin
Broadcasts tab), sw.js (cache bumped to v17).

## Tested
18 backend checks against the real route code and a real database — badge
counts (unread broadcasts + pending listings, folded together correctly),
opening the bell marking broadcasts read without touching the pending
count, the admin-only gate on sending/deleting broadcasts (a non-admin
gets a real 403), history and deletion — all passing. 15 browser checks in
headless Chromium — the badge count, the panel's content and read-marking,
"Review now" jumping into Admin, composing/sending/deleting a broadcast
from the admin tab, and no JS errors — all passing.
Not tested: live Paystack (unaffected by this change anyway), your real
database, or a very large broadcast history (no pagination yet — the bell
only ever shows the most recent 20).

## Worth knowing
- There's no way to target a broadcast at just hosts, or just one city —
  every broadcast goes to every user. Say the word if you want targeting.
- Pending-listing count is a live query (not a stored notification), so it
  can never go stale or need clearing beyond actually reviewing the item.
