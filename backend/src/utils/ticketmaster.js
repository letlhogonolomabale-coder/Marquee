// ticketmaster.js — pulls real, currently-on-sale events from Ticketmaster's
// free Discovery API (covers South Africa via their Quicket partnership).
// Every event returned here carries a genuine ticket-page URL, so tapping
// one in the app takes the user to the actual site the listing came from —
// no guessing, no search-engine redirect trick needed.
//
// Requires a free API key from https://developer.ticketmaster.com/, set as
// TICKETMASTER_API_KEY. If that env var isn't set, fetchLiveEvents() just
// returns an empty list so the rest of the app keeps working without it.

const fetch = require('node-fetch');

const BASE_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

const CATEGORY_MAP = {
  Music: 'Music',
  Sports: 'Sport',
  'Arts & Theatre': 'Film',
  Film: 'Film',
  Miscellaneous: 'Meetup',
};

function mapCategory(tmEvent) {
  const segment = tmEvent.classifications?.[0]?.segment?.name;
  return CATEGORY_MAP[segment] || 'Music';
}

function formatDate(tmEvent) {
  const start = tmEvent.dates?.start;
  if (!start?.localDate) return 'Date TBA';
  const d = new Date(`${start.localDate}T${start.localTime || '00:00:00'}`);
  const dateStr = d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
  if (!start.localTime) return dateStr;
  const timeStr = d.toLocaleTimeString('en-ZA', { hour: 'numeric', minute: '2-digit' });
  return `${dateStr} · ${timeStr}`;
}

function formatPrice(tmEvent) {
  const range = tmEvent.priceRanges?.[0];
  if (!range) return 'See site for price';
  const currency = range.currency === 'ZAR' ? 'R' : (range.currency || '') + ' ';
  return range.min === range.max
    ? `${currency}${Math.round(range.min)}`
    : `From ${currency}${Math.round(range.min)}`;
}

function bestImage(tmEvent) {
  const images = tmEvent.images || [];
  const wide = images.find((img) => img.ratio === '16_9' && img.width >= 640);
  return (wide || images[0])?.url || null;
}

function toDbRow(tmEvent, city) {
  const venue = tmEvent._embedded?.venues?.[0];
  const start = tmEvent.dates?.start;
  const eventDate = start?.localDate ? new Date(`${start.localDate}T${start.localTime || '00:00:00'}`) : null;
  return {
    tmId: tmEvent.id,
    title: tmEvent.name,
    venue: venue?.name || 'Venue TBA',
    cat: mapCategory(tmEvent),
    price: formatPrice(tmEvent),
    date: formatDate(tmEvent),
    eventDate: eventDate && !isNaN(eventDate) ? eventDate.toISOString() : null,
    description: tmEvent.info || tmEvent.pleaseNote || null,
    city,
    lat: venue?.location?.latitude ? parseFloat(venue.location.latitude) : null,
    lng: venue?.location?.longitude ? parseFloat(venue.location.longitude) : null,
    photoUrl: bestImage(tmEvent),
    sourceUrl: tmEvent.url, // the real Ticketmaster/Quicket ticket page
  };
}

// Returns [] (never throws) so a missing key, rate limit, or network hiccup
// just means "no live results" rather than breaking Discover entirely.
// Each result is shaped for a DB upsert (see routes/events.js) rather than
// returned directly to the client — that way a live event becomes a normal
// row with a normal integer id, and favoriting/admin-editing/etc. all just
// work on it the same as any other event.
async function fetchLiveEvents(city) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    apikey: apiKey,
    city,
    countryCode: 'ZA',
    size: '20',
    sort: 'date,asc',
  });

  try {
    const res = await fetch(`${BASE_URL}?${params}`);
    if (!res.ok) {
      console.error('Ticketmaster API error:', res.status, await res.text());
      return [];
    }
    const data = await res.json();
    const events = data._embedded?.events || [];
    return events.map((ev) => toDbRow(ev, city));
  } catch (err) {
    console.error('Ticketmaster fetch failed:', err.message);
    return [];
  }
}

module.exports = { fetchLiveEvents };
