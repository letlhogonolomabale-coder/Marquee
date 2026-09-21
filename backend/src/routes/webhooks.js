// webhooks.js — Paystack calls this once a payment (hosting fee or venue plan) completes.
// Mounted in server.js with express.raw() (NOT express.json()) because the
// HMAC signature check needs the exact raw request body — parsing it to
// JSON first would change the bytes and the signature would never match.
const express = require('express');
const db = require('../db');
const { verifyWebhookSignature } = require('../utils/paystack');
const { applyPayment } = require('../utils/payments');

const router = express.Router();

router.post('/paystack', async (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  // req.body is the raw Buffer here (see the express.raw() mount in
  // server.js) — required so the HMAC is computed over the exact bytes
  // Paystack sent, not a re-serialized (and possibly differently-ordered)
  // JSON.stringify of it.
  if (!signature || !verifyWebhookSignature(req.body, signature)) {
    console.error('Paystack webhook signature check failed.');
    return res.status(400).send('Invalid signature.');
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch (err) {
    return res.status(400).send('Malformed JSON body.');
  }

  if (event.event === 'charge.success') {
    try {
      const result = await applyPayment(event.data);
      if (result.applied) console.log(`Payment applied: ${result.kind} #${result.refId} (${event.data?.reference}).`);
      else console.log(`Payment not applied (${result.reason}):`, event.data?.reference);
    } catch (err) {
      // A 500 makes Paystack retry the webhook later, which is what we want
      // if the database was briefly unavailable.
      console.error('Failed to apply payment:', err);
      return res.sendStatus(500);
    }
  }

  // Paystack just wants a 200 to know we got it — respond fast, before any
  // slow work, same idea as Stripe's webhook contract.
  res.sendStatus(200);
});

module.exports = router;
