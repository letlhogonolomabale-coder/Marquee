// payments.js — turns a confirmed Paystack transaction into what the customer
// paid for. Called from two places for every payment: the webhook (reliable,
// works even if the customer closes their browser) and GET /api/payments/verify
// (instant feedback when they land back on the site). Whichever runs first
// applies it; the second one is a harmless no-op thanks to the `payments` table.
const db = require('../db');
const { HOST_FEE_CENTS, VENUE_PLAN_CENTS, VENUE_PLAN_DAYS } = require('./paystack');

const DAY_MS = 24 * 60 * 60 * 1000;

// txn = { reference, status, amount (cents), metadata } as Paystack returns it.
// Returns { applied: boolean, reason?, kind?, refId?, expiresAt? }.
async function applyPayment(txn) {
  if (!txn || txn.status !== 'success') return { applied: false, reason: 'not_successful' };
  const reference = txn.reference;
  const meta = txn.metadata || {};
  const amount = Number(txn.amount);
  if (!reference) return { applied: false, reason: 'no_reference' };

  let kind = meta.kind;
  let refId;
  let minAmount;
  if (kind === 'host_fee') { refId = Number(meta.eventId); minAmount = HOST_FEE_CENTS; }
  else if (kind === 'venue_plan') { refId = Number(meta.venueId); minAmount = VENUE_PLAN_CENTS; }
  else return { applied: false, reason: 'unknown_kind' };

  if (!refId) return { applied: false, reason: 'missing_target' };
  // Never trust the metadata alone: make sure they actually paid enough.
  if (!(amount >= minAmount)) return { applied: false, reason: 'amount_too_low', kind, refId };

  // Claim this reference first. The primary key makes a second attempt fail
  // here, which is what stops a venue plan being extended twice.
  try {
    await db.prepare('INSERT INTO payments (reference, kind, ref_id, amount_cents) VALUES (?, ?, ?, ?)')
      .run(reference, kind, refId, amount);
  } catch (err) {
    if (/UNIQUE|constraint/i.test(err.message || '')) return { applied: false, reason: 'already_processed', kind, refId };
    throw err;
  }

  try {
    if (kind === 'host_fee') {
      await db.prepare("UPDATE events SET payment_status = 'paid' WHERE id = ? AND payment_status = 'unpaid'").run(refId);
      return { applied: true, kind, refId };
    }
    const venue = await db.prepare('SELECT plan_expires_at FROM venues WHERE id = ?').get(refId);
    if (!venue) throw new Error(`Venue ${refId} not found for payment ${reference}`);
    // Renewing early stacks on top of the time already left.
    const current = venue.plan_expires_at ? Date.parse(venue.plan_expires_at) : 0;
    const start = Math.max(Date.now(), Number.isNaN(current) ? 0 : current);
    const expiresAt = new Date(start + VENUE_PLAN_DAYS * DAY_MS).toISOString();
    await db.prepare('UPDATE venues SET plan_expires_at = ? WHERE id = ?').run(expiresAt, refId);
    return { applied: true, kind, refId, expiresAt };
  } catch (err) {
    // Release the claim so a retry (Paystack re-sends failed webhooks) can try again.
    await db.prepare('DELETE FROM payments WHERE reference = ?').run(reference);
    throw err;
  }
}

module.exports = { applyPayment };
