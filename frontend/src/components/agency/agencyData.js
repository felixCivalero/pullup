// The agency's single sources of truth: contact, the offer, and the case
// registry every surface links from (landing work index, nav, footer, each
// case page's "next case"). Order here = order everywhere.

export const CONTACT = "hello@pullup.se";
// The deck: open page + the PDF built from the same slides (docs/deck/build.mjs).
export const DECK_PATH = "/deck";
export const DECK_PDF = "/the-production-core.pdf";

export const mailto = (subject) =>
  `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}`;

// One package. Every engagement opens with a 3-month trust period — paid, but
// no commitment; the commitment starts after it, and longer commitments cost less.
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

// `image` is optional — cards and case heroes fall back to pure typography.
export const CASES = [
  {
    slug: "bkm",
    client: "BKM",
    kicker: "Founder-led marketing",
    title: "0 to 10k without a marketing department.",
    summary: "How a strict 30-minute rhythm replaced the creative loop — and turned founder genius into operational proof.",
  },
  {
    slug: "li-karlsen",
    client: "Li Karlsén",
    kicker: "Content extraction",
    title: "Precision over noise.",
    summary: "An elite freediver's stillness, translated into a four-beat dramaturgy for every piece of content.",
  },
  {
    slug: "stiga",
    client: "STIGA",
    kicker: "Enterprise",
    title: "A legacy global brand on a 30-minute cadence.",
    summary: "The same engine, scaled to corporate systems, technical data and a brand with decades behind it.",
  },
  {
    slug: "adam-flambo",
    client: "Adam Flambo",
    kicker: "Execution",
    title: "Out of the execution trap.",
    summary: "A deep mission, a team in a vacuum — wired together through the Alignment Bridge.",
    image: "/stories/adam-hero.jpg",
  },
  {
    slug: "adam-dawood",
    client: "Adam Dawood",
    kicker: "Artist",
    title: "From zero to signed.",
    summary: "No audience to aim at — so the core came first. Today DAWOOD is signed by Sony Music.",
  },
];

export const casePath = (slug) => `/work/${slug}`;
export const caseBySlug = (slug) => CASES.find((c) => c.slug === slug);
export const nextCase = (slug) => {
  const i = CASES.findIndex((c) => c.slug === slug);
  return CASES[(i + 1) % CASES.length];
};
