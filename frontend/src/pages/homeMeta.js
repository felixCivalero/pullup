/* Share and search tags for the pages around the front door, read at build
   time by the pages plugin in vite.config.js. The front page's own tags are
   the ones in index.html. */
const SITE = "https://pullup.se";

export const HOME_TITLE = "Creative powerhouse — PullUp";

export const GUIDE_META = {
  title: "Hitta kultur i Stockholm — PullUp",
  description: "Allt som händer i Stockholm på en sida: musik, konst och scen. Filtrera på det du gillar och få det på mejl varje torsdag. Gratis.",
  url: `${SITE}/stockholm`,
};

// Culture Capital: a letter Felix sends himself. Not in the menu, not in the
// sitemap, and noindex (the pages plugin adds the robots tag).
export const CULTURE_META = {
  title: "Culture Capital I — a SEK 75M fund for culture and love",
  description: "A SEK 75M fund to find and back the people who move a city. In a world AI can predict, the one thing left is what people feel.",
  url: `${SITE}/culture-capital`,
  image: `${SITE}/og/culture-capital.jpg`,
  alt: "Culture Capital I — a SEK 75M fund to find and back the people who move a city.",
  noindex: true,
};

export const FELIX_META = {
  title: "Felix Civalero Stolpe — Jag bygger varumärken. Tillväxt som håller.",
  description: "Jag bygger varumärken – för företag, kreatörer och artister. Content, marknadsföring och tillväxt som håller.",
  url: `${SITE}/felix-civalero`,
  jsonLd: [{
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Felix Civalero Stolpe",
    url: `${SITE}/felix-civalero`,
    worksFor: { "@type": "Organization", name: "PullUp", url: `${SITE}/` },
    email: "felix@pullup.se",
  }],
};
