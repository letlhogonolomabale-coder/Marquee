// payments.js — GET /api/payments/verify?reference=...
// Called by the frontend the moment someone lands back from Paystack's hosted
// checkout, for instant feedback. The webhook (routes/webhooks.js) is the
// resilient path; this just makes the UI feel immediate. Safe to call twice.
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { verifyTransaction } = require('../utils/paystack');
const { applyPayment } = require('../utils/payments');

const router = express.Router();

router.get('/verify', requireAuth, async (req, res, next) => {
  try {
    const reference = String(req.query.reference || '');
    if (!reference) return res.status(400).json({ error: 'Missing reference.' });

    const txn = await verifyTransaction(reference);
    if (txn.status !== 'success') return res.json({ paid: false });
    if (Number(txn.metadata?.userId) !== req.user.id) {
      return res.status(403).json({ error: "That payment doesn't belong to your account." });
    }

    const result = await applyPayment(txn);
    const paid = result.applied || result.reason === 'already_processed';
    res.json({ paid, kind: txn.metadata?.kind || null });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
