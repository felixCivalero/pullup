/* Share and search tags for the pages around the front door, read at build
   time by the pages plugin in vite.config.js. The front page's own tags are
   the ones in index.html. */
const SITE = "https://pullup.se";
// Share cards: public/og/<page>.jpg, drawn by scripts/og-pages.mjs. Bump when
// a card is redrawn so link previews fetch the new one.
const OG_VERSION = 1;
const card = (name) => `${SITE}/og/${name}.jpg?v=${OG_VERSION}`;
export const HOME_CARD = { image: card("home"), alt: "Creative powerhouse — PullUp, Stockholm" };

export const HOME_TITLE = "Creative powerhouse — PullUp";

export const GUIDE_META = {
  title: "Hitta kultur i Stockholm — PullUp",
  description: "Allt som händer i Stockholm på en sida: musik, konst och scen. Filtrera på det du gillar och få det på mejl varje torsdag. Gratis.",
  url: `${SITE}/stockholm`,
  image: card("stockholm"),
  alt: "Stockholm — allt som händer, på ett ställe. Varje torsdag på mejl.",
};

// Culture Capital: a letter Felix sends himself. Not in the menu, not in the
// sitemap, and noindex (the pages plugin adds the robots tag).
export const CULTURE_META = {
  title: "Culture Capital I — a SEK 75M fund for culture and love",
  description: "A SEK 75M fund to find and back the people who move a city. In a world AI can predict, the one thing left is what people feel.",
  url: `${SITE}/culture-capital`,
  image: card("culture-capital"),
  alt: "Culture Capital I — a SEK 75M fund to find and back the people who move a city.",
  noindex: true,
};

export const FELIX_META = {
  title: "Felix Civalero Stolpe — Jag bygger varumärken. Tillväxt som håller.",
  description: "Jag bygger varumärken – för företag, kreatörer och artister. Content, marknadsföring och tillväxt som håller.",
  url: `${SITE}/felix-civalero`,
  image: card("felix-civalero"),
  alt: "Felix Civalero Stolpe — Jag bygger varumärken. Tillväxt som håller.",
  jsonLd: [{
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Felix Civalero Stolpe",
    url: `${SITE}/felix-civalero`,
    worksFor: { "@type": "Organization", name: "PullUp", url: `${SITE}/` },
    email: "felix@pullup.se",
  }],
};

// The legal pages and login: their own titles, the front page's card.
const legal = (path, title, description) => ({ title: `${title} — PullUp`, description, url: `${SITE}/${path}`, ...HOME_CARD });
export const LEGAL_META = {
  privacy: legal("privacy", "Integritetspolicy", "Hur PullUp hanterar personuppgifter: vad vi sparar, varför, hur länge och hur du får dem raderade."),
  terms: legal("terms", "Villkor", "Villkoren för att använda PullUp och eventverktyget."),
  cookies: legal("cookies", "Cookies och lagring", "Den enda cookie PullUp frågar om räknar unika besökare. Här ser och ändrar du ditt val."),
};
export const LOGIN_META = {
  title: "Logga in — PullUp",
  description: "Logga in på PullUp med en kod till din e-post. Första gången skapas ditt konto, gratis.",
  url: `${SITE}/login`,
  ...HOME_CARD,
  noindex: true,
};
