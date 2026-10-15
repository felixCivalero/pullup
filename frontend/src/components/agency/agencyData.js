import { CASE_TODAY as FLAMBO } from "../../pages/stories/adamFlamboData.js";

// The agency's single sources of truth: contact, the offer, and the case
// registry every surface links from (landing work index, nav, footer, each
// case page's "next case"). Order here = order everywhere.

export const CONTACT = "hello@pullup.se";
// The booklet: by email only (DeckTeaser → /deck-downloads). The PDF lives in
// backend/assets, printed by docs/deck/build.mjs; never served publicly.
export const DECK_PATH = "/#deck";

// The one message. Hero, services, booklet and meta all say it this way.
export const MESSAGE = {
  promise: "Great people make great brands.",
  kicker: "We make them greater.",
  deal: "Founders, artists, the faces behind it. Thirty minutes a week becomes content, community and reach — with the numbers to show it.",
};

export const mailto = (subject) =>
  `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}`;

// THE offer — the only one, and it includes everything (strategy, content,
// growth, CRM, tracking, dashboards, apps); scope follows the client's need and
// direction, not a price list. No tiers, no add-ons. Every engagement opens with a
// 3-month trust period — paid, but no commitment; after it, longer commitments
// cost less (no tier numbers published).
export const BASE_MONTHLY = 3000;
export const OFFER = {
  label: "One offer",
  price: "$3,000",
  cadence: "/ month",
  line: "Everything is included. What we build follows your need and direction.",
  includes: [
    "Brand strategy and direction",
    "Content — a weekly 30-minute sprint, production by you, your team or us",
    "Growth on every channel — Instagram, TikTok, YouTube, Facebook",
    "Community, events and CRM on PullUp",
    "Tracking and dashboards — every piece measured",
    "Your own apps and tools, built when you need them",
  ],
  terms: [
    ["First 3 months", "A trust period. Full scope, $3,000 a month, no commitment."],
    ["After that", "Commit to continue. The longer the commitment, the lower the monthly rate."],
  ],
  cta: "Build with us",
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
    client: "Li Karlsén",
    name: "Li Karlsén",
    kicker: "Founder · BKM · Elite freediver",
    color: "#0E9384",
    title: "8 hours became 30 minutes.",
    person: "A founder and elite freediver who learned to say it precisely, on camera.",
    brand: "One piece of content now takes 30 minutes to make, not 8 hours.",
    score: ["8 h → 30 min", "per piece of content"],
    chart: { type: "time", rows: [["Before", 480, "8 h"], ["Now", 30, "30 min"]] },
    spine: {
      start: "A founder and elite freediver with more to say than a reel can hold.",
      did: "30-minute extraction sprints, shaped on the spot into four beats.",
      made: "Reels split into Hook, Credibility, Core and Outro — cut frame by frame.",
      result: "From 8 hours to 30 minutes to make one piece of content.",
    },
    reel: true,
  },
  {
    slug: "bkm",
    client: "BKM",
    name: "BKM Health",
    kicker: "Brand · Health",
    color: "#B7791F",
    title: "0 to 10k without a marketing team.",
    person: "Two founders, Li and Tolga, became the faces of their own brand.",
    brand: "10,000+ followers, built by the founders themselves.",
    score: ["10,000+", "followers, from zero"],
    chart: { type: "grow", from: ["0", "followers at the start"], to: ["10,000+", "followers now"] },
    spine: {
      start: "Two founders, Li and Tolga, with a vision and no audience.",
      did: "30-minute sprints with the founders instead of a marketing department.",
      made: "Founder-led content in their own voice — and a community around it.",
      result: "10,000+ followers, built by the founders themselves.",
    },
    stats: [["10,000+", "followers"], ["30 min", "per sprint"]],
  },
  {
    slug: "stiga",
    client: "STIGA",
    name: "STIGA Table Tennis",
    kicker: "Brand · Sport",
    color: "#2563EB",
    title: "28 million views in seven months.",
    person: "The players and the play put at the centre — the sport in its own voice.",
    brand: "28.1M views and +32,000 followers in seven months.",
    score: ["28.1M", "views in seven months"],
    chart: { type: "channels" },
    spine: {
      start: "A global sports brand with decades of history.",
      did: "Put the people and the play at the centre, with Sebastian on their side.",
      made: "Short-form video and posts in the sport's own voice, on four channels.",
      result: "28.1M views and +32,000 followers in seven months.",
    },
    stats: [["28.1M", "views"], ["+32,000", "followers"], ["335,000", "interactions"], ["7 months", "Dec 2024 – Jun 2025"]],
  },
  {
    slug: "adam-dawood",
    client: "Adam Dawood",
    name: "Adam Dawood",
    kicker: "Creator · Music",
    color: "#7C3AED",
    title: "From zero to signed.",
    person: "An artist with a sound and a world, built into an identity before anyone watched.",
    brand: "Signed by Sony Music.",
    score: ["0 → Sony", "from zero to signed"],
    chart: { type: "path", steps: ["Zero", "Identity", "Story", "Rollout", "Sony Music"] },
    spine: {
      start: "An artist with a sound, a world and nobody watching yet.",
      did: "Built the identity around who he actually is, before any audience.",
      made: "The visual language and the story the music tells — rolled out step by step.",
      result: "Signed by Sony Music.",
    },
    hero: ["0 → Sony", "From zero to signed by Sony Music"],
  },
  {
    slug: "adam-flambo",
    client: "Adam Flambo",
    name: "Adam Flambo",
    kicker: "Creator · Community",
    color: "#D9480F",
    title: "A following became a community.",
    person: "A creator who started meeting his following in real life, one photo walk at a time.",
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
    image: "/stories/adam-hero.jpg",
  },
  {
    slug: "kaijas",
    client: "Kaijas",
    name: "Kaijas Musiksalong",
    kicker: "Our own · Live music, Stockholm",
    color: "#DB2777",
    title: "Booked three months ahead.",
    person: "The people behind it were the core — our team and our artists made Kaijas an experience you couldn't get anywhere else.",
    brand: "A brand built until the room was booked three months in advance.",
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
];

// The numbered stories — what the landing lists and the rail walks through.
export const SERIES = CASES.filter((c) => c.series !== false);
export const storyNo = (slug) => String(SERIES.findIndex((c) => c.slug === slug) + 1).padStart(2, "0");
// Li's edit: one reel in four beats; `cut` = frames taken out (illustrative).
export const REEL_BEATS = [
  { t: "Hook", line: "The first line earns the second.", frames: 4, cut: [3] },
  { t: "Credibility", line: "Proof before opinion.", frames: 6, cut: [1, 4] },
  { t: "Core", line: "The one thing you leave with.", frames: 10, cut: [2, 5, 8] },
  { t: "Outro", line: "Land it. Then stop.", frames: 5, cut: [2, 4] },
];
const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
export const storyCountWord = WORDS[SERIES.length] || String(SERIES.length);
export const storyCount = String(SERIES.length).padStart(2, "0");

export const casePath = (slug) => `/work/${slug}`;
export const caseBySlug = (slug) => CASES.find((c) => c.slug === slug);
export const nextCase = (slug) => {
  const i = SERIES.findIndex((c) => c.slug === slug);
  return SERIES[(i + 1) % SERIES.length];
};
