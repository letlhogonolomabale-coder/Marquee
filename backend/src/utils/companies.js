// companies.js — spots a known company/brand name in an event's title or
// description so events from the same sponsor (e.g. multiple "Standard
// Bank ..." listings pulled from Ticketmaster) can be grouped together in
// Discover instead of showing as separate individual cards.
//
// This is a simple keyword match, not NLP — good enough for the handful of
// big recurring sponsors that show up over and over in SA event listings.
// Add more brands to KNOWN_COMPANIES as you spot them in real scan results.

const KNOWN_COMPANIES = [
  'Standard Bank',
  'Absa',
  'Nedbank',
  'FNB',
  'Vodacom',
  'MTN',
  'Investec',
  'Sanlam',
  'Old Mutual',
  'DStv',
];

// Longer names first, so "Standard Bank" wins over any shorter substring
// that might also happen to match.
const SORTED = [...KNOWN_COMPANIES].sort((a, b) => b.length - a.length);

function detectCompany(...textParts) {
  const text = textParts.filter(Boolean).join(' ');
  if (!text) return null;
  const found = SORTED.find((name) => text.toLowerCase().includes(name.toLowerCase()));
  return found || null;
}

module.exports = { detectCompany, KNOWN_COMPANIES };
