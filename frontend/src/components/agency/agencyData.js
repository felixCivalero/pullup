import { CASE_TODAY as FLAMBO } from "../../pages/stories/adamFlamboData.js";

// The agency's single sources of truth: contact, the offer, and the case
// registry every surface links from (landing work index, nav, footer, each
// case page's "next case"). Order here = order everywhere.

export const CONTACT = "felix@pullup.se";
// The booklet: by email only (DeckTeaser → /deck-downloads). The PDF lives in
// backend/assets, printed by docs/deck/build.mjs; never served publicly.
export const DECK_PATH = "/#deck";

// The one message. Hero, services, booklet and meta all say it this way.
export const MESSAGE = {
  promise: "Great people make great brands.",
  kicker: "We make them greater.",
  // A goal isn't reached once, it's lived — and the journey is what people
  // follow. "Post more" is really structure, alignment and consistency.
  deal: "A goal isn't something you reach once. It's something you live. We help you live yours in public, every week — a clear direction, content that sounds like you and growth you can measure. One price.",
};

export const mailto = (subject) =>
  `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}`;

// THE offer — the only one, and it includes everything (strategy, content,
// growth, CRM, tracking, dashboards, apps); scope follows the client's need and
// direction, not a price list. No tiers, no add-ons. The first month is
// money-back: paid, and refunded in full if the client isn't happy. After it,
// the client commits to continue (longer commitments cost less — no tier
// numbers published) or leaves with their money back.
// Priced in SEK in every language.
export const BASE_MONTHLY = 30000;
export const OFFER = {
  label: "One offer",
  price: "30,000 SEK",
  cadence: "/ month",
  line: "Every tool is included. Content is scoped together — quality over volume.",
  includes: [
    "Brand strategy and direction",
    "The 30-minute sprint, every week — direction and scripts for your content",
    "Editing and production, scoped together — made by you, your team or us",
    "Growth on every channel — Instagram, TikTok, YouTube, Facebook",
    "Community, events and CRM on PullUp",
    "Tracking and dashboards — every piece measured",
    "Your own apps and tools, built when you need them",
  ],
  terms: [
    ["First month", "Full scope, 30,000 SEK. Not happy? You get your money back."],
    ["Content", "Scoped together, never unlimited. For BKM that meant up to two edited pieces a week and a production day about once a month."],
    ["After that", "Like it? Commit and we keep building. The longer the commitment, the lower the monthly rate."],
  ],
  cta: "Work with me",
};

// The one story frame. Every case — card, case page, booklet — answers the
// same four questions in the same order, so a reader can follow all of them.
export const SPINE = [
  ["start", "Start"],
  ["did", "What we did"],
  ["made", "What we made"],
  ["result", "Result"],
];

// STIGA per channel — Growhouse results report, 1 Dec 2024 – 30 Jun 2025.
export const STIGA_ROWS = [
  { channel: "Facebook", views: 14924282, interactions: 85239, followers: 11407 },
  { channel: "Instagram", views: 10276752, interactions: 204138, followers: 15018 },
  { channel: "TikTok", views: 1800000, interactions: 32000, followers: 4805 },
  { channel: "YouTube", views: 1100000, interactions: 13200, followers: 1200 },
];

// The case registry — order here = order everywhere (landing, footer, the
// rail on every case page, "next story"). `series: false` would keep a page
// live without numbering it. Every claim: Felix's brief; STIGA traces to the
// Growhouse report (1 Dec 2024 – 30 Jun 2025); Adam Flambo to his rooms.
export const CASES = [
  {
    slug: "li-karlsen",
    client: "Week-Li",
    name: "Week-Li · BKM Health",
    // The overview card leads with Li so it stands apart from BKM's own card;
    // the case page itself stays on the format (Felix 2026-10-21).
    cardName: "Li Karlsén",
    kicker: "Week-Li · BKM Health",
    color: "#0E9384",
    title: "From a whole topic down to seconds.",
    who: "Deep, broad knowledge of women's health — far too much for one reel.",
    gained: "Week-Li: short, personal reels for BKM, one clear point each — made in 30 minutes.",
    brand: "One reel in 30 minutes instead of 8 hours.",
    score: ["8 h → 30 min", "per reel"],
    chart: { type: "time", rows: [["Before", 480, "8 h"], ["Now", 30, "30 min"]] },
    spine: {
      start: "Week-Li, BKM's format on women's health: deep, broad knowledge and no way to fit it in one reel.",
      did: "30-minute sprints that narrowed each topic down to one question.",
      made: "Reels of 1–1.5 minutes in five beats: hook, introduction, build-up, climax, CTA.",
      result: "From 8 hours to 30 minutes to make one reel.",
    },
    reel: true,
  },
  {
    slug: "bkm",
    client: "BKM",
    name: "BKM Health",
    kicker: "Brand · Health",
    color: "#B7791F",
    // Never call the followers organic — not all of them were (Felix 2026-10-21).
    title: "One red thread, from vision to every post.",
    // Tolga is THE founder in everything we write (Felix 2026-10-21).
    who: "Tolga Duran, BKM's founder, with a vision and no audience.",
    gained: "A vision and a strategy, built together, that every sprint, event and story followed.",
    brand: "10,000+ followers in one year, several million views across channels — and sales and subscriptions growing exponentially.",
    score: ["10,000+", "followers in one year, from zero"],
    chart: { type: "grow", from: ["0", "followers at the start"], to: ["10,000+", "followers now"], note: "Sales and subscriptions: growing exponentially" },
    spine: {
      start: "Tolga Duran, BKM's founder, with a vision and no audience.",
      did: "Vision and strategy as one red thread, worked out together — and kept moving by 30-minute sprints.",
      made: "A community post the same day as every event, and a flow that let the ambassadors tell deep stories.",
      result: "10,000+ followers in one year and several million views across channels — with sales and subscriptions growing exponentially.",
    },
    stats: [["10,000+", "followers in one year"], ["Millions", "of views across channels"], ["Exponential", "growth in sales and subscriptions", true]],
  },
  {
    slug: "kaijas",
    client: "Kaijas",
    name: "Kaijas Musiksalong",
    kicker: "Our own · Live music, Stockholm",
    color: "#DB2777",
    title: "Booked three months ahead.",
    who: "Our own venue — an empty room in Stockholm.",
    gained: "The team and the artists became the reason people came.",
    brand: "Booked three months in advance.",
    score: ["3 months", "booked in advance"],
    chart: { type: "ahead", months: 3, note: "Live music four nights a week" },
    spine: {
      start: "An empty room in Stockholm.",
      did: "Built the brand around the people behind it — the team and the artists.",
      made: "A unique live-music experience, with Instagram as the front door and our own booking system behind it.",
      result: "Booked three months in advance.",
    },
    stats: [["3 months", "booked in advance"], ["4 nights", "of live music a week"], ["10,000+", "Instagram followers", true]],
  },
  {
    slug: "stiga",
    client: "STIGA",
    name: "STIGA Table Tennis",
    kicker: "Brand · Sport",
    color: "#2563EB",
    title: "28 million views in seven months.",
    who: "A global sports brand with decades of history — and talent already in the building.",
    gained: "In-house talents became faces fans follow, each with a persona and a story.",
    brand: "28.1M views and +32,000 followers in seven months.",
    score: ["28.1M", "views in seven months"],
    chart: { type: "channels" },
    spine: {
      start: "A global sports brand with decades of history.",
      did: "Introduced in-house talents and built personas and stories around them.",
      made: "Short-form video and posts in the sport's own voice, on four channels.",
      result: "28.1M views and +32,000 followers in seven months.",
    },
    stats: [["28.1M", "views"], ["+32,000", "followers"], ["335,000", "interactions"], ["7 months", "Dec 2024 – Jun 2025"]],
  },
  {
    slug: "adam-flambo",
    client: "Adam Flambo",
    name: "Adam Flambo",
    kicker: "Creator · Community",
    color: "#D9480F",
    title: "A following became a community.",
    who: "A creator with a following online and no way to meet it.",
    gained: "Faces he knows instead of followers — and a community that's his.",
    brand: `${FLAMBO.pulledUnique} people pulled up. ${FLAMBO.community} in his community.`,
    score: [String(FLAMBO.community), "people in his community"],
    chart: { type: "walks", rows: FLAMBO.events },
    spine: {
      start: "A creator with a following online and no way to meet it.",
      did: "Moved his events and his community onto PullUp — owned by him.",
      made: `${FLAMBO.events.length} events, a private room of the community's own photos, a printed journal.`,
      result: `${FLAMBO.pulledUnique} people pulled up. ${FLAMBO.community} in his community.`,
    },
    stats: [[String(FLAMBO.events.length), "events hosted"], [String(FLAMBO.pulledUnique), "people pulled up"], [String(FLAMBO.community), "in his community", true]],
    image: "/stories/adam-hero.webp",
  },
];

// The numbered stories — what the landing lists and the rail walks through.
export const SERIES = CASES.filter((c) => c.series !== false);
export const storyNo = (slug) => String(SERIES.findIndex((c) => c.slug === slug) + 1).padStart(2, "0");
// The Week-Li edit: one reel in five beats; `cut` = frames taken out (illustrative).
export const REEL_BEATS = [
  { t: "Hook", line: "Stop the scroll in the first seconds.", frames: 3, cut: [2] },
  { t: "Introduction", line: "What this is about, and why it matters.", frames: 4, cut: [1, 3] },
  { t: "Build-up", line: "The knowledge, one step at a time.", frames: 8, cut: [2, 5] },
  { t: "Climax", line: "The one thing you leave with.", frames: 5, cut: [3] },
  { t: "CTA", line: "What to do next. Then stop.", frames: 3, cut: [2] },
];
const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
export const storyCountWord = WORDS[SERIES.length] || String(SERIES.length);
export const storyCount = String(SERIES.length).padStart(2, "0");

// A photo per story, for pages that show the stories as images. Week-Li has
// none until Li sends the photos she wants, and BKM's freediving photos are
// gone with the freediving story (Felix 2026-10-21).
export const COVERS = {
  kaijas: "/stories/kaijas/crowd.webp",
  stiga: "/stories/stiga/arena.webp",
  "adam-flambo": "/stories/adam-hero.webp",
};

export const casePath = (slug) => `/work/${slug}`;
export const caseBySlug = (slug) => CASES.find((c) => c.slug === slug);
export const nextCase = (slug) => {
  const i = SERIES.findIndex((c) => c.slug === slug);
  return SERIES[(i + 1) % SERIES.length];
};
