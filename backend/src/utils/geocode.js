// geocode.js — turns "venue, city" into real lat/lng using OpenStreetMap's
// free Nominatim API (no API key needed — same project that powers the
// map embed already in the frontend).
//
// Nominatim's usage policy caps this at ~1 request/second and asks for a
// descriptive User-Agent, which is why we set one and don't call this in a
// tight loop. For higher volume in production, either self-host Nominatim
// or switch to a paid geocoder (Google, Mapbox, etc.) — the call site in
// routes/events.js is the only place you'd need to change.

const fetch = require('node-fetch');

async function geocodeVenue(venue, city) {
  const query = encodeURIComponent(`${venue}, ${city}, South Africa`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Marquee-App/1.0 (event discovery app)' },
    });
    if (!res.ok) return null;
    const results = await res.json();
    if (!results.length) return null;
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  } catch (err) {
    console.error('Geocoding failed:', err.message);
    return null;
  }
}

module.exports = { geocodeVenue };
