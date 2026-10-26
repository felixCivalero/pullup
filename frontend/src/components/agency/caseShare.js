import { SERIES, storyNo, storyCount } from "./agencyData.js";
import { translate } from "./i18n.js";

/* What a shared case link shows (og/twitter tags + the card image), in
   Swedish. Written about the client — never "jag": the case is shared by
   Felix and by the client alike (Felix 2026-10-21). Read at build time by the
   case-share plugin in vite.config.js (dist/work/<slug>.html) and by
   scripts/case-og-images.mjs (public/og/case-<slug>.jpg). Bump OG_VERSION
   when the images change, to get past Facebook's cache. */
export const OG_VERSION = 2;
export const SITE = "https://pullup.se";

const sv = (s) => translate("sv", s);

export function caseShare(c) {
  const title = sv(c.title);
  return {
    slug: c.slug,
    url: `${SITE}/work/${c.slug}`,
    no: `Case ${storyNo(c.slug)} / ${storyCount}`,
    name: c.name,
    kicker: sv(c.kicker),
    title,
    pageTitle: `${c.name} — ${title}`,
    description: `${sv(c.spine.start)} ${sv(c.spine.result)}`,
    score: [sv(c.score[0]), sv(c.score[1])],
    color: c.color,
    image: `${SITE}/og/case-${c.slug}.jpg?v=${OG_VERSION}`,
    alt: `${c.name}: ${title}`,
  };
}

export const CASE_SHARES = SERIES.map(caseShare);
