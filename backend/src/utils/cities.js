// cities.js — the list of cities Marquee covers, and the fuzzy matcher that
// turns what a person typed ("jhb", "cape") into one of them. Shared by the
// events and venues routes so both agree on what counts as a valid city.

const KNOWN_CITIES = [
  'Johannesburg', 'Cape Town', 'Durban', 'Pretoria',
  'Bloemfontein', 'Gqeberha', 'East London', 'Nelspruit',
  'Polokwane', 'Kimberley', 'George', 'Stellenbosch',
];
const CITY_ALIASES = {
  jhb: 'Johannesburg', joburg: 'Johannesburg', joeys: 'Johannesburg',
  cpt: 'Cape Town', capetown: 'Cape Town',
  dbn: 'Durban', pta: 'Pretoria', tshwane: 'Pretoria',
  bloem: 'Bloemfontein', mangaung: 'Bloemfontein',
  pe: 'Gqeberha', 'portelizabeth': 'Gqeberha', gqeberha: 'Gqeberha',
  el: 'East London', eastlondon: 'East London',
  mbombela: 'Nelspruit', nelspruit: 'Nelspruit',
  polokwane: 'Polokwane', pietersburg: 'Polokwane',
  kimberley: 'Kimberley',
  george: 'George',
  stellenbosch: 'Stellenbosch',
};

// Same matching logic the frontend used to do locally — kept here so the
// server is the single source of truth for "what city did the user mean".
function matchCity(raw) {
  const q = (raw || '').trim().toLowerCase();
  if (!q) return 'Johannesburg';
  const hit = KNOWN_CITIES.find((c) => c.toLowerCase().includes(q) || q.includes(c.toLowerCase()));
  if (hit) return hit;
  return CITY_ALIASES[q.replace(/\s+/g, '')] || null;
}

module.exports = { KNOWN_CITIES, CITY_ALIASES, matchCity };
