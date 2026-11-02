// Fills in the picture for guide events the scrapers found without one: the
// organiser's own share image (og:image) from the event's page. Read through
// siteCheck's guarded fetch (public addresses only, size and time capped).
// Runs after the nightly scrape (routes/stockholm.js) and by hand.
import { readPublic } from "./siteCheck.js";

const attr = (tag, name) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] || null;

// The page's share image, absolute and https, or null.
export function ogImageOf(html, pageUrl) {
  const tags = String(html || "").match(/<(meta|link)\b[^>]*>/gi) || [];
  const wanted = [
    (t) => /^meta$/i.test(t.slice(1, 5)) && /(property|name)\s*=\s*["']og:image(:secure_url|:url)?["']/i.test(t) && attr(t, "content"),
    (t) => /(property|name)\s*=\s*["']twitter:image(:src)?["']/i.test(t) && attr(t, "content"),
    (t) => /rel\s*=\s*["']image_src["']/i.test(t) && attr(t, "href"),
  ];
  for (const pick of wanted) {
    for (const tag of tags) {
      const raw = pick(tag);
      if (!raw) continue;
      try {
        const url = new URL(raw.replace(/&amp;/g, "&"), pageUrl);
        if (url.protocol === "http:") url.protocol = "https:";
        if (url.protocol === "https:") return url.href;
      } catch {
        /* not a url — try the next tag */
      }
    }
  }
  return null;
}

// Every current guide event without an image: look once, save what's found.
export async function fillMissingImages(supabase, { limit = 120, pause = 400 } = {}) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("stockholm_events")
    .select("id, url")
    .is("image_url", null)
    .or(`starts_at.gte.${now},ends_at.gte.${now}`)
    .limit(limit);
  if (error) throw new Error(error.message);
  let found = 0;
  for (const row of data || []) {
    if (!/^https?:\/\//i.test(row.url || "")) continue;
    try {
      const page = await readPublic(row.url);
      const image = page.status === 200 ? ogImageOf(page.text, page.url) : null;
      if (image) {
        await supabase.from("stockholm_events").update({ image_url: image }).eq("id", row.id);
        found += 1;
      }
    } catch {
      /* page unreachable — the tile stands in */
    }
    await new Promise((r) => setTimeout(r, pause));
  }
  return { looked: data?.length || 0, found };
}
