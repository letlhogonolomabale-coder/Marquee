// eventDate.js — best-effort parsing of the free-text "date_text" shown on
// cards (e.g. "Sat, 13 Sep · 3:00 PM", "Sat, 10 Oct • 12:00pm - Till late")
// into a real, comparable timestamp, stored alongside date_text as
// event_date. This is what lets the app tell whether an event has already
// happened and belongs on the Past page instead of Discover.
//
// date_text stays free text (hosts and admins can write "Doors 7, show 9"
// and it'll still display fine) — this parser just does its best to pull a
// day/month/time out of it. If it can't, event_date is left null and the
// event is treated as always-upcoming (never auto-hidden) rather than
// guessed into the wrong bucket.

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseEventDateText(text, ref = new Date()) {
  if (!text || typeof text !== 'string') return null;

  const dayMonth = text.match(/(\d{1,2})\s+([A-Za-z]{3,})/);
  if (!dayMonth) return null;
  const day = parseInt(dayMonth[1], 10);
  const month = MONTHS[dayMonth[2].slice(0, 3).toLowerCase()];
  if (month === undefined || day < 1 || day > 31) return null;

  // Default to noon when no time is given, so an event with only a date
  // (e.g. a free market listing) still sorts sensibly against timed ones.
  let hour = 12;
  let minute = 0;
  const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*([APap][Mm])/);
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
    minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ap = timeMatch[3].toLowerCase();
    if (ap === 'pm' && hour < 12) hour += 12;
    if (ap === 'am' && hour === 12) hour = 0;
  }

  const year = ref.getFullYear();
  let d = new Date(year, month, day, hour, minute, 0);
  // If that lands more than ~4 months in the past, assume it means next
  // year's occurrence — keeps evergreen demo/seed dates ("Sat, 13 Sep")
  // useful for a while instead of immediately reading as long-past.
  const diffDays = (ref - d) / 86400000;
  if (diffDays > 120) {
    d = new Date(year + 1, month, day, hour, minute, 0);
  }
  return d;
}

module.exports = { parseEventDateText };
