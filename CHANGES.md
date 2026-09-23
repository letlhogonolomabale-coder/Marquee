# Marquee update — free meetups

Two files changed from what you uploaded. Same paths, overwrite when asked. No database changes.

## What changed
- **Meetups are free.** Posting an event with the Meetup category now goes straight to
  "paid" — no R100 checkout, no redirect to Paystack. It appears in Discover immediately
  (the same way an admin's post already did). Every other category still costs R100.
- **The post form is honest about this before you submit.** Meetup is now the first/default
  option in the category dropdown. The button reads "Post meetup — free" for Meetup and
  "Post event — R100" for everything else, and the hint text above it updates to match as
  you change the category. Meetup was already a category option before this change — the
  form just didn't make the price difference clear, which is what this fixes.

## Files
Edited: backend/src/routes/events.js (one line: Meetups save as 'paid', same as admin posts),
frontend/Marquee.html (post-form category order + dynamic fee hint/button),
frontend/sw.js (cache bumped to v14, so the updated form reaches people who already
installed the app).

## Tested
58 automated checks against the real route code and a real database (including two new
checks: a Meetup is created already paid and appears in Discover with no payment step, while
a non-Meetup still requires the R100 fee) — all passing. 8 browser checks in headless Chromium
confirming the form defaults to Meetup, the button/hint text switch correctly when the category
changes, and submitting a Meetup never triggers a checkout redirect — all passing.
Not tested: live Paystack, your real database.
