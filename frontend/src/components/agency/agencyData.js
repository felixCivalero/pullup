import { CASE_STATS as FLAMBO } from "../../pages/stories/adamFlamboData.js";

// The agency's single sources of truth: contact, the offer, and the case
// registry every surface links from (landing work index, nav, footer, each
// case page's "next case"). Order here = order everywhere.

export const CONTACT = "hello@pullup.se";
// The booklet: open page + the PDF printed from the same pages (docs/deck/build.mjs).
export const DECK_PATH = "/booklet";
export const DECK_PDF = "/the-production-core.pdf";

// The one message. Hero, services, booklet and meta all say it this way.
export const MESSAGE = {
  promise: "We build brands people actually feel.",
  deal: "Thirty minutes of you a week. A week of content that sounds like you — published on every channel, measured and grown.",
};

// What a client gets from the core, in the words a CMO plans with.
export const OUTPUT = [
  { when: "Every week", t: "A week of content", b: "Short-form video, posts and copy in your voice — ready to publish." },
  { when: "Always", t: "Instagram, 3 months ahead", b: "Planned and scheduled, so the feed never goes quiet." },
  { when: "Every channel", t: "One story, cut for each", b: "The same content put to work on TikTok, YouTube and Facebook." },
  { when: "Every month", t: "A read-out", b: "What moved people, what didn't — and what we make more of next." },
];

export const mailto = (subject) =>
  `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}`;

// One package. Every engagement opens with a 3-month trust period — paid, but
// no commitment; the commitment starts after it, and longer commitments cost less.
// Superpowers: add-ons on top of the retained engine (OFFER), monthly.
// `from` marks a starting price that's scoped per client.
export const BASE_MONTHLY = 3000;
export const SUPERPOWERS = [
  {
    id: "crm",
    name: "Real People CRM",
    by: "PullUp",
    line: "Know every person who pulls up.",
    items: [
      "Every follower, RSVP and guest as one real person — not a row in five tools",
      "Community marketing and sales across email, WhatsApp and Instagram",
      "Your audience and its data stay yours",
    ],
    price: 750,
  },
  {
    id: "room",
    name: "The Room",
    by: "Access",
    line: "What happens at the event stays with the people who were there.",
    items: [
      "A private room only the people who pulled up can enter",
      "Guests share their photos and moments with each other — credited",
      "Being there becomes the reason to come back",
    ],
    price: 500,
  },
  {
    id: "tracking",
    name: "Deep Tracking",
    by: "Signal",
    line: "See what actually moves people.",
    items: [
      "One trail from post to RSVP to pull-up",
      "Every channel and every piece of content, attributed",
      "A weekly read-out: what to do more of",
    ],
    price: 400,
  },
  {
    id: "app",
    name: "Your Own App",
    by: "Lab",
    line: "Your world, on their home screen.",
    items: [
      "Your community in an app with your name on it",
      "Rooms, tickets and messages — in your brand",
      "Built on PullUp, owned by you",
    ],
    price: 1500,
    from: true,
  },
];

// Bundle ladder: the more superpowers, the less each one costs.
// Index = number of powers switched on → share off every power's price.
export const BUNDLE_OFF = [0, 0, 0.1, 0.15, 0.2];
export const bundleOff = (count) => BUNDLE_OFF[Math.min(count, BUNDLE_OFF.length - 1)] || 0;
const round5 = (n) => Math.round(n / 5) * 5;
// A power's monthly price when `count` powers are on in total.
export const powerPrice = (p, count) => round5(p.price * (1 - bundleOff(count)));
// Every power switched on = the Full Service package: one fixed price,
// the core engine and all four powers, nothing "from".
export const FULL_SERVICE = { name: "Full Service", price: 5500 };
export function monthlyPlan(ids) {
  const picked = SUPERPOWERS.filter((p) => ids.includes(p.id));
  const n = picked.length;
  const list = picked.reduce((a, p) => a + p.price, 0);
  if (n === SUPERPOWERS.length) {
    return { picked, n, off: bundleOff(n), full: true, from: false, total: FULL_SERVICE.price, saved: BASE_MONTHLY + list - FULL_SERVICE.price };
  }
  const powers = picked.reduce((a, p) => a + powerPrice(p, n), 0);
  return { picked, n, off: bundleOff(n), full: false, saved: list - powers, total: BASE_MONTHLY + powers, from: picked.some((p) => p.from) };
}

export const OFFER = {
  name: "The Retained Architecture",
  price: "$3,000",
  cadence: "/ month",
  body: "We run the engine with you: we moderate the dual tracks, script your assets line by line, and hold the whole team to the daily rhythm.",
  terms: [
    ["Start", "A 3‑month trust period at $3,000/month — with no commitment."],
    ["In those 3 months", "The multi-channel start-and-grow process: Instagram scheduled 3 months ahead, your existing content put to work on TikTok, YouTube and Facebook — one system, measured and grown. Your marketing is sharper whether you stay or not."],
    ["After 3 months", "It's clear where our future time together is best invested. Commit to continue — the longer the commitment, the lower the monthly rate."],
  ],
  cta: "Start the trust period",
};

// The one story frame. Every case — card, case page, booklet — answers the
// same four questions in the same order, so a reader can follow all of them.
export const SPINE = [
  ["start", "Start"],
  ["did", "What we did"],
  ["made", "What we made"],
  ["result", "Result"],
];

// The case registry — order here = order everywhere (landing, footer, the
// rail on every case page, "next story"). `series: false` would keep a page
// live without numbering it. Every claim: Felix's brief; STIGA traces to the
// Growhouse report (1 Dec 2024 – 30 Jun 2025); Adam Flambo to his rooms.
export const CASES = [
  {
    slug: "stiga",
    client: "STIGA",
    name: "STIGA Table Tennis",
    kicker: "Brand · Sport",
    title: "A heritage brand, growing on every channel.",
    spine: {
      start: "A heritage brand with about 50 followers on Instagram.",
      did: "Put the people and the play at the centre, with Sebastian on their side.",
      made: "Short-form video and posts in the sport's own voice, on four channels.",
      result: "28.1M views and +32,000 followers in seven months.",
    },
    stats: [["28.1M", "views"], ["+32,000", "followers"], ["335,000", "interactions"], ["7 months", "Dec 2024 – Jun 2025"]],
  },
  {
    slug: "li-karlsen",
    client: "Li Karlsén",
    name: "Li Karlsén",
    kicker: "Founder · BKM · Elite freediver",
    tone: "dark",
    title: "Content doesn't need to be loud. It needs to be precise.",
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
    title: "0 to 10k without a marketing department.",
    spine: {
      start: "Two founders, Li and Tolga, with a vision and no audience.",
      did: "30-minute sprints with the founders instead of a marketing department.",
      made: "Founder-led content in their own voice — and a community around it.",
      result: "10,000+ followers, built without a single paid ad.",
    },
    stats: [["10,000+", "followers"], ["0 kr", "paid spend"], ["30 min", "per sprint", true]],
  },
  {
    slug: "adam-dawood",
    client: "Adam Dawood",
    name: "Adam Dawood",
    kicker: "Creator · Music",
    tone: "dark",
    title: "From zero to signed.",
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
    title: "A following became a community.",
    spine: {
      start: "A creator with a following online and no way to meet it.",
      did: "Moved his events and his community onto PullUp — owned by him.",
      made: `${FLAMBO.walks} photo walks, a private room of ${FLAMBO.photos} credited photos, a printed journal.`,
      result: `${FLAMBO.pulledUnique} people pulled up. ${FLAMBO.community} in his community.`,
    },
    stats: [[String(FLAMBO.walks), "events hosted"], [String(FLAMBO.pulledUnique), "people pulled up"], [String(FLAMBO.community), "in his community", true]],
    image: "/stories/adam-hero.jpg",
  },
  {
    slug: "kaijas",
    client: "Kaijas",
    name: "Kaijas Musiksalong",
    kicker: "Our own · Live music, Stockholm",
    tone: "dark",
    title: "We did it for ourselves first.",
    spine: {
      start: "An empty room in Stockholm.",
      did: "Built the brand, the programme, the people and the systems to run it.",
      made: "Instagram as the front door, plus our own booking system and dashboard.",
      result: "Live music four nights a week. 10,000+ followers.",
    },
    stats: [["4 nights", "of live music a week"], ["10,000+", "Instagram followers"], ["Built in-house", "booking system and operations dashboard", true]],
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
