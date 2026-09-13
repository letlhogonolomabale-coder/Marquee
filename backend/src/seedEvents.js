// seedEvents.js — the original frontend's hardcoded EVENT_POOL, moved into
// the database as real rows (host_user_id is implicitly NULL = editorial).
// date_text is kept as free text for now, same as the original design;
// see README for notes on moving to real Date values + a live source.

module.exports = [
  // Johannesburg
  { title: "Neon Rooftop Sessions", venue: "Sky Lounge, Rosebank", cat: "Music", price: "From R250", date_text: "Fri, 12 Sep · 8:00 PM", city: "Johannesburg", lat: -26.1467, lng: 28.0436, photo_key: "neon", color: "#FFB454" },
  { title: "Sunday Farmers Market", venue: "Bryanston Organic Market", cat: "Market", price: "Free entry", date_text: "Sun, 14 Sep · 9:00 AM", city: "Johannesburg", lat: -26.0525, lng: 28.0146, photo_key: "market", color: "#4FD6C7" },
  { title: "Chiefs vs Sundowns", venue: "FNB Stadium", cat: "Sport", price: "From R120", date_text: "Sat, 13 Sep · 3:00 PM", city: "Johannesburg", lat: -26.2348, lng: 27.9825, photo_key: "stadium2", color: "#FF8080" },
  { title: "Indie Film Night: Shorts Vol.4", venue: "The Bioscope, Maboneng", cat: "Film", price: "R90", date_text: "Fri, 12 Sep · 7:30 PM", city: "Johannesburg", lat: -26.2023, lng: 28.0567, photo_key: "projector", color: "#9D7BFF" },
  { title: "Jozi Street Food Crawl", venue: "Braamfontein", cat: "Food", price: "From R180", date_text: "Sat, 13 Sep · 6:00 PM", city: "Johannesburg", lat: -26.1926, lng: 28.0337, photo_key: "foodstalls", color: "#FFB454" },
  { title: "Open Mic & Poetry", venue: "The Bassline", cat: "Music", price: "R60", date_text: "Thu, 11 Sep · 8:00 PM", city: "Johannesburg", lat: -26.2023, lng: 28.0287, photo_key: "festival", color: "#4FD6C7" },
  { title: "Startup Founders Meetup", venue: "WeWork Sandton", cat: "Meetup", price: "Free", date_text: "Wed, 10 Sep · 6:30 PM", city: "Johannesburg", lat: -26.1076, lng: 28.0567, photo_key: "meetup", color: "#9D7BFF" },
  // Cape Town
  { title: "Sunset Rooftop Sessions", venue: "Waterfront Rooftop, V&A Waterfront", cat: "Music", price: "From R220", date_text: "Fri, 12 Sep · 7:00 PM", city: "Cape Town", lat: -33.9036, lng: 18.4201, photo_key: "party", color: "#FFB454" },
  { title: "Neighbourgoods Market", venue: "Old Biscuit Mill, Woodstock", cat: "Market", price: "Free entry", date_text: "Sat, 13 Sep · 9:00 AM", city: "Cape Town", lat: -33.9273, lng: 18.4553, photo_key: "foodstalls", color: "#4FD6C7" },
  { title: "Stormers vs Bulls", venue: "DHL Stadium", cat: "Sport", price: "From R150", date_text: "Sat, 13 Sep · 5:00 PM", city: "Cape Town", lat: -33.9036, lng: 18.4108, photo_key: "stadium", color: "#FF8080" },
  { title: "Cape Town Jazz Night", venue: "The Crypt Jazz Restaurant", cat: "Music", price: "R120", date_text: "Thu, 11 Sep · 8:00 PM", city: "Cape Town", lat: -33.9249, lng: 18.4173, photo_key: "neon", color: "#FFB454" },
  { title: "Long Street Food Crawl", venue: "Long Street", cat: "Food", price: "From R160", date_text: "Sun, 14 Sep · 6:00 PM", city: "Cape Town", lat: -33.9189, lng: 18.4172, photo_key: "market", color: "#FFB454" },
  // Durban
  { title: "Beachfront Sunset DJ Set", venue: "uShaka Beach Bar", cat: "Music", price: "Free entry", date_text: "Fri, 12 Sep · 6:30 PM", city: "Durban", lat: -29.8674, lng: 31.0424, photo_key: "ocean", color: "#FFB454" },
  { title: "Durban Green Market", venue: "Essenwood Park", cat: "Market", price: "Free entry", date_text: "Sat, 13 Sep · 8:00 AM", city: "Durban", lat: -29.8296, lng: 30.9997, photo_key: "market", color: "#4FD6C7" },
  { title: "Sharks vs Lions", venue: "Kings Park Stadium", cat: "Sport", price: "From R100", date_text: "Sat, 13 Sep · 3:00 PM", city: "Durban", lat: -29.8281, lng: 31.0292, photo_key: "stadium2", color: "#FF8080" },
  { title: "Indie Film Screening", venue: "Suncoast Cinema", cat: "Film", price: "R80", date_text: "Fri, 12 Sep · 7:30 PM", city: "Durban", lat: -29.8362, lng: 31.0432, photo_key: "projector", color: "#9D7BFF" },
  { title: "Curry Street Food Pop-up", venue: "Victoria Street Market", cat: "Food", price: "From R90", date_text: "Sun, 14 Sep · 5:00 PM", city: "Durban", lat: -29.8579, lng: 31.0176, photo_key: "foodstalls", color: "#FFB454" },
  // Pretoria
  { title: "Church Square Live Sessions", venue: "Church Square", cat: "Music", price: "Free entry", date_text: "Fri, 12 Sep · 7:00 PM", city: "Pretoria", lat: -25.7472, lng: 28.1878, photo_key: "festival", color: "#FFB454" },
  { title: "Hazel Food Market", venue: "Hazel Food Market, Menlo Park", cat: "Market", price: "Free entry", date_text: "Sat, 13 Sep · 9:00 AM", city: "Pretoria", lat: -25.7822, lng: 28.2607, photo_key: "market", color: "#4FD6C7" },
  { title: "Bulls vs Sharks", venue: "Loftus Versfeld", cat: "Sport", price: "From R130", date_text: "Sat, 13 Sep · 4:00 PM", city: "Pretoria", lat: -25.7546, lng: 28.2287, photo_key: "stadium", color: "#FF8080" },
  { title: "Poetry & Open Mic Night", venue: "Tings & Times", cat: "Music", price: "R50", date_text: "Thu, 11 Sep · 8:00 PM", city: "Pretoria", lat: -25.7469, lng: 28.2294, photo_key: "neon", color: "#4FD6C7" },
  { title: "Founders Meetup Pretoria", venue: "The Innovation Hub", cat: "Meetup", price: "Free", date_text: "Wed, 10 Sep · 6:30 PM", city: "Pretoria", lat: -25.7551, lng: 28.2450, photo_key: "officechat", color: "#9D7BFF" },
];
