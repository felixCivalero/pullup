// The agency's single sources of truth: contact, the two offers, and the case
// registry every surface links from (landing work index, nav, footer, each
// case page's "next case"). Order here = order everywhere.

export const CONTACT = "hello@pullup.se";
export const mailto = (subject) =>
  `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}`;

export const OFFERS = [
  {
    name: "The Blueprint Restructure",
    price: "$4,820",
    cadence: "One-time",
    body: "We audit your stack, build your content templates, and map your 3-part BKM engine.",
    cta: "Secure the Blueprint",
  },
  {
    name: "The Retained Architecture",
    price: "$3,000",
    cadence: "/ month · 12+ months",
    body: "A global partnership where we run the engine, moderate the dual tracks, and script your dramaturgical assets line-by-line.",
    cta: "Apply for retainer",
  },
];

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
];

export const casePath = (slug) => `/work/${slug}`;
export const caseBySlug = (slug) => CASES.find((c) => c.slug === slug);
export const nextCase = (slug) => {
  const i = CASES.findIndex((c) => c.slug === slug);
  return CASES[(i + 1) % CASES.length];
};
