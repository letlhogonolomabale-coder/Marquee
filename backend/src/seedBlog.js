// seedBlog.js — starter "Made waves" blog posts: internet moments that
// briefly took over everyone's feed. Runs through the same idempotent sync
// as seedEvents.js (see seedBlogPosts() in db.js) — matched by title, so
// admin edits made afterwards through the app are never overwritten by a
// later redeploy, and nothing is duplicated on restart.
//
// Add your own posts either here (permanent, survives every redeploy) or
// through the Admin > Blog tab in the app (stored in the database instead).

module.exports = [
  {
    title: 'The Ice Bucket Challenge takes over every feed',
    happened_on: 'Summer 2014',
    summary: 'A simple dare — dump ice water on your head, film it, nominate three friends — turned into the biggest viral fundraiser the internet had seen.',
    body: "It started small and spread through nomination chains until it felt like everyone's timeline was nothing but ice water and gasps. Athletes, politicians and celebrities all took their turn, each video ending with a challenge to three more people. Behind the fun, it raised enormous sums for ALS research in just a few weeks — proof that a genuinely silly format could still move real money and real awareness at a scale nobody had planned for.",
    source_url: null,
  },
  {
    title: '"The Dress" splits the internet in half',
    happened_on: 'February 2015',
    summary: 'One photo of a dress. Half the internet swore it was blue and black, the other half saw white and gold — and nobody could agree.',
    body: 'A blurry, badly lit photo of a dress got posted online, and within hours the entire internet was arguing about what color it actually was. Friends sitting next to each other, looking at the same screen, saw completely different things. It turned into a genuine science lesson about color perception and lighting that reached millions of people who\'d never normally read about optics — all sparked by one ordinary photo nobody expected to go anywhere.',
    source_url: null,
  },
  {
    title: 'The Harlem Shake meme explodes overnight',
    happened_on: 'February 2013',
    summary: 'One person dancing alone, then a bass drop, then a room full of chaos — the 30-second format got copied by hundreds of thousands of groups worldwide.',
    body: "The formula was dead simple: one person dances while everyone else ignores them, the bass drops, and suddenly the whole room is in costume doing something ridiculous. Within about a month, it felt like every university, sports team, office and YouTube channel had filmed their own version. It burned out almost as fast as it caught fire, but for a few weeks it was genuinely everywhere.",
    source_url: null,
  },
  {
    title: 'A Reddit forum takes on Wall Street over GameStop',
    happened_on: 'January 2021',
    summary: 'Retail traders on a Reddit forum coordinated to buy GameStop shares, squeezing hedge funds that had bet heavily against the stock.',
    body: "A stock that big investment firms were confidently betting would fall instead shot up in value, after a large community of everyday retail traders online decided to buy in together. Hedge funds that had bet against the stock lost billions as the price kept climbing, brokerages restricted trading in the middle of it, and lawmakers ended up asking questions about how markets are supposed to work. It became a genuine case study in what a coordinated online crowd can do to a market almost overnight.",
    source_url: null,
  },
  {
    title: 'A stuck ship blocks one of the world\'s busiest canals',
    happened_on: 'March 2021',
    summary: 'A giant container ship wedged itself sideways across the Suez Canal, halting global shipping for six days and becoming an instant meme factory.',
    body: 'A container ship longer than most skyscrapers are tall got turned sideways by high winds and ran aground, blocking one of the busiest shipping routes on the planet. Hundreds of vessels queued up on either side while diggers and tugboats worked for days to free it, and in the meantime the internet turned it into one long joke — a single small excavator next to the enormous hull became one of the most reused images of the year.',
    source_url: null,
  },
  {
    title: 'Elon Musk closes his deal for Twitter, sink included',
    happened_on: 'October 2022',
    summary: 'After months of back and forth, a $44 billion deal finally closed — and the new owner walked into headquarters carrying a sink.',
    body: 'After a long, public tug-of-war over the deal — including an attempt to back out of it entirely — the acquisition finally closed, and the platform\'s new owner marked the occasion by walking into the company\'s headquarters carrying a bathroom sink, joking online about "letting that sink in." The weeks that followed brought rapid changes to staffing, verification and moderation, and people argued about all of it in real time on the platform itself.',
    source_url: null,
  },
  {
    title: 'A backup dancer in a shark costume steals the Super Bowl',
    happened_on: 'February 2015',
    summary: 'During a Super Bowl halftime show, one backup dancer in a shark costume seemed to freestyle instead of following the choreography — and became a legend.',
    body: "While the rest of the dancers hit their marks in sync, one dancer dressed as a shark appeared to be a beat behind and dancing to a routine of their own. The clip was clipped, looped and shared within minutes, turning one costumed backup dancer into a bigger talking point the next morning than the headline performance itself.",
    source_url: null,
  },
  {
    title: 'A joke Facebook event convinces a million people to "storm" a military base',
    happened_on: 'September 2019',
    summary: 'A tongue-in-cheek Facebook event calling for people to raid a secretive US Air Force base "to see them aliens" racked up over a million RSVPs.',
    body: 'What began as an obviously joking Facebook event — a mock plan to run into a famously secretive military base "Naruto-style" to see if aliens were really being hidden there — somehow racked up well over a million people marking themselves "going." News outlets covered it seriously, the base issued actual warnings, and when the date arrived a modest crowd showed up mostly to take photos and enjoy a makeshift desert festival rather than storm anything.',
    source_url: null,
  },
];
