// paystack.js — thin wrapper around the Paystack REST API. No SDK
// dependency needed: the app already uses node-fetch elsewhere (see
// utils/ticketmaster.js), and Paystack's API is plain REST + JSON.
//
// One difference from Stripe worth knowing: Paystack uses the SAME secret
// key both to call the API and to verify webhook signatures — there's no
// separate webhook secret to generate/store.
const fetch = require('node-fetch');
const crypto = require('crypto');

// Fixed boost price + duration, kept in one place so the checkout route and
// the .env.example comments agree. Amount is in cents — ZAR's smallest
// unit, same idea as Stripe's "amount in cents".
const BOOST_PRICE_CENTS = Number(process.env.BOOST_PRICE_CENTS || 500); // R5.00 by default
const BOOST_DURATION_DAYS = Number(process.env.BOOST_DURATION_DAYS || 7);

function requireSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw Object.assign(new Error("Boosting isn't configured yet — PAYSTACK_SECRET_KEY is missing on the server."), { status: 500 });
  }
  return key;
}

// Starts a transaction and returns Paystack's hosted payment page details.
// `reference` is ours to pick — we generate our own (see events.js) so a
// transaction can be traced back to an event even before any webhook fires.
async function initializeTransaction({ email, amountCents, reference, metadata, callbackUrl }) {
  const key = requireSecretKey();
  const resp = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      amount: amountCents,
      currency: 'ZAR',
      reference,
      metadata,
      callback_url: callbackUrl,
    }),
  });
  const json = await resp.json();
  if (!resp.ok || !json.status) {
    throw Object.assign(new Error(json.message || 'Paystack could not start the transaction.'), { status: 502 });
  }
  return json.data; // { authorization_url, access_code, reference }
}

// Confirms whether a transaction actually succeeded. Safe to call more than
// once — Paystack just reports whatever the current status is each time.
// Used right after the host is redirected back from checkout, as a fast
// path alongside the webhook (see routes/webhooks.js) rather than instead
// of it — the webhook is what still boosts the event if the host closes
// their browser before the redirect completes.
async function verifyTransaction(reference) {
  const key = requireSecretKey();
  const resp = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const json = await resp.json();
  if (!resp.ok || !json.status) {
    throw Object.assign(new Error(json.message || 'Could not verify the transaction with Paystack.'), { status: 502 });
  }
  return json.data; // { status: 'success' | 'failed' | ..., amount, metadata, reference, ... }
}

// Paystack signs each webhook body with HMAC-SHA512 using your secret key.
// Recomputing that hash over the exact raw bytes received and comparing it
// to the x-paystack-signature header is how we know a request claiming to
// be Paystack actually is — see the express.raw() mount in server.js for
// why the raw (not JSON-parsed) body matters here.
function verifyWebhookSignature(rawBody, signatureHeader) {
  const key = requireSecretKey();
  const expected = crypto.createHmac('sha512', key).update(rawBody).digest('hex');
  return expected === signatureHeader;
}

module.exports = { initializeTransaction, verifyTransaction, verifyWebhookSignature, BOOST_PRICE_CENTS, BOOST_DURATION_DAYS };
