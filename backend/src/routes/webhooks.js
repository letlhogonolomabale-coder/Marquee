// webhooks.js — Paystack calls this once a boost transaction completes.
// Mounted in server.js with express.raw() (NOT express.json()) because the
// HMAC signature check needs the exact raw request body — parsing it to
// JSON first would change the bytes and the signature would never match.
const express = require('express');
const db = require('../db');
const { verifyWebhookSignature, BOOST_DURATION_DAYS } = require('../utils/paystack');

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
    const eventId = Number(event.data?.metadata?.eventId);
    if (eventId) {
      const expiresAt = new Date(Date.now() + BOOST_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await db.prepare('UPDATE events SET is_boosted = 1, boost_expires_at = ? WHERE id = ?').run(expiresAt, eventId);
      console.log(`Boost activated for event ${eventId}, expires ${expiresAt}.`);
    } else {
      console.warn('charge.success had no usable metadata.eventId — nothing boosted.', event.data?.reference);
    }
  }

  // Paystack just wants a 200 to know we got it — respond fast, before any
  // slow work, same idea as Stripe's webhook contract.
  res.sendStatus(200);
});

module.exports = router;
