# Marquee update — admin approval for listings + venue deletion

Three files changed from what you uploaded. Same paths, overwrite when asked.
Database upgrades itself on first start (two new columns, both default to
'approved' so nothing already live gets hidden or queued retroactively).

## What changed

**Every new listing needs admin sign-off before it goes live.**
- A host's event — paid, free Meetup, doesn't matter — now starts
  `approval_status: 'pending'`. Discover requires BOTH the hosting fee paid
  (or it's a free Meetup) AND admin approval; whichever is still missing is
  what keeps it hidden. Only admin-posted events skip the queue.
- A venue registration (Bars & Lounges / Fine Dining) works the same way:
  paying the R50 plan is no longer enough on its own — an admin has to
  approve it too before it appears on the public tab.
- Rejecting doesn't delete anything — a rejected item just stays out of
  Discover/the tabs, and can be approved later if the host fixes whatever
  was wrong. The host/owner sees their own item's status either way
  (Pending review / Rejected / Live), on their own profile page.
- Admin panel: both the Events and Venues tabs now show a status badge and
  Approve/Reject buttons on every row.

**Admin can now delete a venue listing entirely** (Venues tab → "Delete
venue", with a confirm prompt — this can't be undone, unlike Reject). Its
photos are removed too. Events already posted at that venue are untouched —
they just stop getting the gold partner highlight, since that's a live name
match, not something tied to the venue row.

## Files
Edited: backend/src/db.js (two new columns: events.approval_status,
venues.approval_status), backend/src/routes/events.js (approval gate +
POST /admin/:id/approve, /admin/:id/reject), backend/src/routes/venues.js
(approval gate + the same two admin routes, plus DELETE /admin/:id),
backend/src/utils/serializeEvent.js (approvalStatus field), frontend/Marquee.html
(status pills on the host/owner side; badges, Approve/Reject and Delete
venue on the admin side), frontend/sw.js (cache bumped to v16).

## Tested
90 automated checks against the real route code and a real database — new
listings start pending, stay hidden from Discover/search/direct-link/the
public tabs until approved, a rejected one can be re-approved later, admins
skip the queue, deleting a venue removes it (and 404s on a repeat or unknown
id) without touching events at that venue — all passing (2 unrelated,
pre-existing environment quirks in this test setup, not caused by this
change: no seed "main event" and no paid Durban event exist in the bare test
database this runs against). 12 browser checks in headless Chromium: the
Admin tab, approve/reject buttons and badges on both Events and Venues rows,
the delete-with-confirm flow (including cancelling it), and no JS errors —
all passing.
Not tested: live Paystack, your real database, or a genuinely large backlog
of pending listings (pagination isn't part of this change).

## Decisions you may want to revisit
- I read "any listing" as events AND venues. If you only meant one of them,
  say so and I'll narrow it.
- I made this admin-only (matching how the rest of the admin panel works) —
  there's no owner-side delete for their own venue. Say the word if hosts/
  owners should be able to remove their own listings too.
- A rejected event/venue currently gives the host/owner no reason why and no
  way to edit and resubmit from their side — just a "contact support" style
  notice. I can add an admin note + an edit-and-resubmit flow if useful.
