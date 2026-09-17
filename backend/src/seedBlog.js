// seedBlog.js — starter "Made waves" blog posts: parties, festivals and live
// shows that blew up online. Runs through the same idempotent sync as
// seedEvents.js (see seedBlogPosts() in db.js) — matched by title, so admin
// edits made afterwards through the app are never overwritten by a later
// redeploy, and nothing is duplicated on restart.
//
// Add your own posts either here (permanent, survives every redeploy) or
// through the Admin > Blog tab in the app (stored in the database instead).

module.exports = [
  {
    title: 'Global Citizen Festival: Mandela 100 turns FNB Stadium into a world stage',
    happened_on: 'December 2018',
    summary: 'Beyonce, Jay-Z, Ed Sheeran and a lineup of global stars played a free concert at FNB Stadium for Mandela\'s centenary — and the internet couldn\'t stop talking about it.',
    body: 'Tens of thousands packed FNB Stadium in Johannesburg for a free concert marking what would have been Nelson Mandela\'s 100th birthday, with Beyonce and Jay-Z headlining alongside Ed Sheeran, Femi Kuti, Pharrell and a run of South African acts. Clips of the performances — especially Beyonce\'s set — spread everywhere online within hours, and the night became a genuine point of pride: one of the biggest global lineups ever assembled on South African soil, live-streamed to millions who couldn\'t be there in person.',
    source_url: null,
  },
  {
    title: 'Beyonce\'s "Beychella" rewrites what a festival headline set can be',
    happened_on: 'April 2018',
    summary: 'Beyonce\'s 2018 Coachella headline set was such a cultural event that people started calling the whole festival "Beychella" — and it\'s still one of the most talked-about live sets ever.',
    body: 'When Beyonce finally took the Coachella stage after postponing her original slot, she didn\'t just perform — she staged a full homecoming-style production with a marching band, steppers and dancers, built entirely around HBCU culture. Clips ricocheted across every platform for weeks, entire think-pieces got written about individual costume changes, and the festival\'s own hashtag got rebranded "Beychella" by fans almost overnight. It\'s still regularly cited as one of the greatest live sets of all time.',
    source_url: null,
  },
  {
    title: 'Fyre Festival promises paradise, delivers a viral disaster',
    happened_on: 'April 2017',
    summary: 'A "luxury" music festival on a private Bahamian island was sold with supermodel-studded ads — what attendees actually got was disaster-relief tents and cheese sandwiches, and the internet had a field day.',
    body: 'Marketed with a glossy influencer campaign promising private villas and gourmet dining on a private island, the festival that showed up on arrival day was nothing like the pitch: half-built disaster tents, a cheese sandwich passed around as "catering," and no real stages or artists in sight. Stranded attendees posted the chaos in real time, and the mismatch between the marketing and reality made it one of the most-mocked, most-shared event failures the internet has ever produced — spawning two competing documentaries the following year.',
    source_url: null,
  },
  {
    title: 'Tomorrowland goes fully digital and streams a fantasy world to millions',
    happened_on: 'July 2020',
    summary: 'With the physical festival cancelled, Tomorrowland built an entire fantasy island as a digital stage and streamed it to over a million viewers worldwide in one weekend.',
    body: 'Unable to hold its usual festival in Belgium, Tomorrowland built "Papillon" — a fully digital fantasy island — and streamed a weekend of DJ sets from more than 60 artists performing on virtual stages designed like something out of a film. It became the biggest livestreamed festival attempt yet, watched by well over a million people across the world, and proved a full festival experience could still travel through a screen when it couldn\'t happen in person.',
    source_url: null,
  },
  {
    title: 'Travis Scott turns Fortnite into a concert venue for 12 million players',
    happened_on: 'April 2020',
    summary: 'A rapper performing inside a video game shouldn\'t have worked — but Travis Scott\'s in-game Fortnite concert pulled in over 12 million concurrent players and became a genuine cultural moment.',
    body: 'Rather than a normal livestream, Travis Scott\'s "Astronomical" set was built directly into Fortnite as a playable in-game event — players\' avatars stood in a crowd as a giant, surreal version of the artist towered over the map, morphing the world around them in sync with the music. Over 12 million players logged in at once, turning it into one of the most-watched concerts in history and kicking off a wave of other artists trying similar in-game shows.',
    source_url: null,
  },
  {
    title: 'Ultra South Africa brings the world\'s biggest dance festival brand to Joburg',
    happened_on: 'February 2014',
    summary: 'When Ultra — the Miami dance-music giant — launched its first-ever South African edition, local timelines lit up for weeks before a single DJ had even landed.',
    body: 'South Africa\'s dance-music scene had been building for years, but Ultra\'s arrival was different — it was the first time the globally recognised Ultra brand, known for its massive Miami flagship, brought a full edition to South African soil. The lineup announcement alone dominated local social media for weeks, and the event itself became a benchmark moment for how big a festival in South Africa could actually get.',
    source_url: null,
  },
  {
    title: 'Rocking the Daisies becomes the festival everyone\'s feed looks like every October',
    happened_on: 'October (annual)',
    summary: 'Cape Town\'s Rocking the Daisies turned into such a fixture of South African festival culture that its farm setting and lineup reveals reliably take over local feeds every year.',
    body: 'Held on a farm outside Darling in the Western Cape, Rocking the Daisies grew from a homegrown weekend festival into one of the most photographed events on the South African calendar — its sunset sets, dust-covered dance floors and eco-conscious camping culture becoming an aesthetic of their own online. Every year\'s lineup announcement and after-movie recap reliably does the rounds again, making it as much an online ritual as a physical one.',
    source_url: null,
  },
  {
    title: 'A muddy Burning Man strands 70,000 people — and the internet watches it all',
    happened_on: 'September 2023',
    summary: 'Unusually heavy rain turned the Nevada desert festival into ankle-deep mud, trapping tens of thousands of attendees for days and flooding social media with survival videos.',
    body: 'A storm that hit Nevada\'s Black Rock Desert during Burning Man turned the dry playa into thick, shoe-sucking mud almost overnight, closing roads in and out of the festival and stranding roughly 70,000 attendees for several extra days. With cars unable to move, people improvised — wrapping plastic bags around their shoes, rationing supplies and, in a couple of widely shared clips, walking miles out on foot rather than wait it out. It turned into one of the festival\'s most talked-about years ever, for reasons that had nothing to do with the art or the music.',
    source_url: null,
  },
];
