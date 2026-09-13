// The one place a DB event row is turned into what the frontend receives.
// Used by routes/events.js and routes/favorites.js — previously each had
// its own copy of this and they drifted out of sync (favorites.js was
// missing url/photoUrl), so events opened from Favorites always fell back
// to the Maps link even when a real one had been submitted.
function toApiEvent(row) {
  return {
    id: row.id,
    title: row.title,
    venue: row.venue,
    cat: row.cat,
    price: row.price,
    date: row.date_text,
    description: row.description,
    city: row.city,
    lat: row.lat,
    lng: row.lng,
    photoKey: row.photo_key,
    photoUrl: row.photo_url,
    color: row.color,
    url: row.source_url,
    hosted: row.host_user_id !== null,
    live: row.tm_id !== null,
  };
}

module.exports = { toApiEvent };
