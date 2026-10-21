/**
 * Hiring signals → Priority 0 prospects in the sales sheet.
 *
 * Companies advertising a marketing role right now are the warmest prospects:
 * they have the need and a budget, and the ad's last day is the deadline for
 * reaching them before they hire. Two open JobTech APIs (Arbetsförmedlingen,
 * no key):
 *   - JobSearch: Platsbanken ads, with org nr, contacts and the last day —
 *     by occupation, plus a free-text pass on marketing titles (ads filed
 *     under other occupations: content creator, SEO, growth …).
 *   - JobAd Links: ads from other Swedish job sites (thehub.io, studentjob,
 *     ledigajobb …). Only those not also on Platsbanken; no deadline given.
 * Keeps companies (no public sector, staffing/recruitment firms or sales jobs
 * in marketing clothing) and appends each new company to Prospects as
 * Priority 0. The admin page sends Priority 0 first, closest deadline first.
 * (Jobbsafari's terms forbid scraping, so it isn't a source.)
 *
 *   node --env-file=.env scripts/fetch-hiring-signals.js [--dry]
 *
 * Runs daily on the server (crontab). Needs GOOGLE_SERVICE_ACCOUNT_JSON with
 * edit access to SALES_SHEET_ID.
 */
import { appendValues, batchGetValues } from "../src/lib/googleSheets.js";

const SEARCH_API = "https://jobsearch.api.jobtechdev.se/search";
const LINKS_API = "https://links.api.jobtechdev.se/joblinks";
const DRY = process.argv.includes("--dry");

// Platsbanken occupation concepts that mean "we need marketing".
const OCCUPATIONS = {
  reEg_XH4_15c: "Marknadschef",
  kJZE_gsT_YQK: "Kommunikationschef",
  PtwA_N8T_GTo: "E-commerce manager",
  WCma_2oa_gyZ: "Marknadsförare",
  XiJJ_yXL_TC7: "Onlinemarknadsförare",
  "2MWk_Cnz_tTJ": "Social media manager",
  jtGy_ZBL_NEP: "Marknadskommunikatör",
  "3abF_Jyu_WtS": "Marknadskoordinator",
  uWwq_jF2_nhq: "Marknadsassistent",
  "64i5_ex4_BP9": "Kommunikationsstrateg",
  aRp4_qjZ_tPV: "Kommunikatör",
};
// Free-text Platsbanken searches for marketing roles filed under some other
// occupation; only headlines that read as marketing are kept.
const PLATSBANKEN_TERMS = ["content creator", "content manager", "content specialist", "digital marknadsförare", "digital marketing", "marketing specialist", "marketing manager", "growth", "seo", "marketing automation", "brand manager", "varumärkesansvarig", "kommunikationsansvarig", "marknadsansvarig", "sociala medier", "performance marketing", "e-handel", "copywriter"];
const LEAD_OCCUPATIONS = new Set(["Marknadschef", "Kommunikationschef", "E-commerce manager"]);
const LEAD_TITLE = /\b(chef|head|ansvarig|lead|director|cmo|manager)\b|marknadschef|kommunikationschef/i;

// JobAd Links has no occupation filter that holds, so search by words and
// keep headlines that are plainly marketing.
const LINK_TERMS = ["marknadschef", "marknadsansvarig", "marketing manager", "head of marketing", "marknadsförare", "growth marketing", "brand manager", "social media manager", "content manager", "kommunikationschef", "e-commerce manager", "kommunikatör", "marknadskoordinator", "marknadsassistent", "content creator", "digital marknadsförare", "marketing specialist", "seo", "performance marketing", "e-handel", "varumärke"];
const MARKETING_TITLE = /market|marknad|brand|varumärk|content|social media|sociala medier|kommunikat|growth|\bpr\b|\bseo\b|copywrit|e-?commerce|e-?handel/i;

const STAFFING = /bemanning|rekryter|recruit|staffing|academic work|adecco|manpower|randstad|poolia|experis|jefferson wells|student ?consulting|\btng\b|bravura|dreamwork|uniflex|proffice|lernia|jobbusters|keystep|hays\b|michael page|kelly services|personalkoncernen|olivia|jurek|brightby|onepartner|jobandtalent|instaff|novare|perido|clockwork|wise professionals|wise group|ework|incluso|performiq|adding people|interim|eventpersonal|nlmp|unik resurs|personnel|personaltjänst|personal ?service/i;
const PUBLIC_SECTOR = /kommun\b|kommunen|regionen|\bregion\b|landsting|myndighet|verket\b|universitet|högskola|försvarsmakten|polisen/i;
// Marketing-titled ads that are really sales or phone jobs.
const NOT_MARKETING = /m[öo]te?s?bokare|telemarket|telefonf[öo]rs|telefonpass|s[äa]ljare|kundtj[äa]nst|customer service|kundservice|f[äa]lts[äa]lj|d[öo]rrknack|intern\b|internship|praktik|extrajobb|account (manager|executive)|\bsales\b|inköp|lager|analyst|analytiker|engineer|developer|utvecklare|affärsutveckl|administratör|store manager|butik|it service/i;
// A free-text find must be plainly a marketing role by its title.
const STRICT_MARKETING_TITLE = /marknadsf|marknadschef|marknadsansvar|marknadskoord|marknadskommunik|marknadsassist|marketing|brand|varumärk|content|sociala medier|social media|kommunikat|\bseo\b|copywrit|e-?handelsredakt/i;
const UNION_CONTACT = /saco|vision\b|unionen|akademikerf|ledarna|kommunal\b|st inom|fackli/i;
const GENERIC_INBOX = /^(info|jobb|jobs?|career|karriar|karriär|hr|rekrytering|recruitment|ansokan|apply|kontakt|contact|hello|hej)@/i;

const day = (iso) => (iso ? String(iso).slice(0, 10) : "");
const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\b(ab|publ|aktiebolag|aktiebolaget|sverige|sweden|group|hb|kb)\b/g, " ").replace(/\s+/g, " ").trim();
const domainOf = (s) => {
  const m = /(?:@|\/\/)(?:www\.)?([^/@\s>]+)/i.exec(String(s || ""));
  return m ? m[1].toLowerCase() : "";
};
const asText = (v) => (v ? `'${v}` : ""); // keep IDs and org numbers as text

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

function contactOf(ad) {
  const people = (ad.application_contacts || []).filter((c) => !UNION_CONTACT.test(`${c.name} ${c.description || ""}`));
  const c = people.find((p) => p.email) || people[0];
  if (c) return { name: c.name || "", role: c.contact_type || c.description || "", email: c.email || "" };
  return { name: "", role: "", email: ad.application_details?.email || ad.employer?.email || "" };
}

// Every source becomes the same shape: one hiring signal.
async function platsbanken(today) {
  const ads = new Map();
  for (let offset = 0; offset < 2000; offset += 100) {
    const qs = new URLSearchParams({ limit: "100", offset: String(offset) });
    for (const id of Object.keys(OCCUPATIONS)) qs.append("occupation-name", id);
    const body = await getJson(`${SEARCH_API}?${qs}`);
    for (const h of body.hits || []) ads.set(String(h.id), h);
    if (!body.hits?.length || offset + 100 >= (body.total?.value || 0)) break;
  }
  // Free text: marketing roles filed under another occupation.
  const byText = new Set();
  for (const q of PLATSBANKEN_TERMS) {
    const body = await getJson(`${SEARCH_API}?${new URLSearchParams({ q, limit: "100" })}`);
    for (const h of body.hits || []) {
      if (ads.has(String(h.id)) || !STRICT_MARKETING_TITLE.test(h.headline || "")) continue;
      ads.set(String(h.id), h);
      byText.add(String(h.id));
    }
  }
  return [...ads.values()]
    // The API widens an occupation search to related ones; keep only ours
    // (and the free-text finds, whose headline already reads as marketing).
    .filter((ad) => (OCCUPATIONS[ad.occupation?.concept_id] || byText.has(String(ad.id)))
      && /^[59]/.test(ad.employer?.organization_number || "")
      && day(ad.application_deadline) >= today)
    .map((ad) => {
      const occupation = OCCUPATIONS[ad.occupation?.concept_id] || ad.occupation?.label || "Marknadsroll";
      return {
        adId: String(ad.id),
        org: ad.employer?.organization_number || "",
        company: ad.employer?.name || ad.employer?.workplace || "",
        alsoKnownAs: ad.employer?.workplace || "",
        headline: ad.headline || "",
        lead: LEAD_OCCUPATIONS.has(occupation) || LEAD_TITLE.test(ad.headline || ""),
        location: [ad.workplace_address?.municipality, ad.workplace_address?.region].filter(Boolean).join(", "),
        website: ad.employer?.url || "",
        contact: contactOf(ad),
        url: ad.webpage_url,
        site: "Platsbanken",
        list: `Platsbanken: ${occupation}`,
        deadline: day(ad.application_deadline),
      };
    });
}

async function otherSites() {
  const hits = new Map();
  for (const q of LINK_TERMS) {
    const body = await getJson(`${LINKS_API}?${new URLSearchParams({ q, limit: "100" })}`);
    for (const h of body.hits || []) hits.set(h.id, h);
  }
  return [...hits.values()]
    // Ads that are also on Platsbanken come through JobSearch, with more data.
    .filter((h) => !(h.source_links || []).some((s) => s.label === "arbetsformedlingen.se") && MARKETING_TITLE.test(h.headline || ""))
    .map((h) => {
      const src = h.source_links?.[0] || {};
      const where = h.workplace_addresses?.[0] || {};
      return {
        adId: h.id,
        org: "",
        company: String(h.employer?.name || "").trim(),
        alsoKnownAs: "",
        headline: h.headline || "",
        lead: LEAD_TITLE.test(h.headline || ""),
        location: [where.municipality, where.region].filter(Boolean).join(", "),
        website: "",
        contact: { name: "", role: "", email: "" },
        url: src.url || "",
        site: src.label || "other site",
        list: `Job ad: ${src.label || "other site"}`,
        deadline: "",
      };
    });
}

async function main() {
  const sheetId = process.env.SALES_SHEET_ID;
  if (!sheetId) throw new Error("SALES_SHEET_ID is not set");

  const [prospectRows] = await batchGetValues(sheetId, ["Prospects!A:X"]);
  const header = prospectRows[0] || [];
  const col = (h) => {
    const i = header.indexOf(h);
    if (i < 0) throw new Error(`Prospects has no "${h}" column`);
    return i;
  };
  const [idI, coI, emI, adI, orgI] = ["ID", "Company", "Email", "Ad ID", "Org nr"].map(col);

  // What's already in the list: ad IDs, org numbers, names and email domains.
  const knownAds = new Set();
  const knownOrgs = new Set();
  const byName = new Map();
  const byDomain = new Map();
  let lastId = 0;
  for (const r of prospectRows.slice(1)) {
    if (r[adI]) knownAds.add(String(r[adI]));
    if (r[orgI]) knownOrgs.add(String(r[orgI]));
    if (r[coI]) byName.set(norm(r[coI]), r[idI]);
    const d = domainOf(r[emI]);
    if (d) byDomain.set(d, r[idI]);
    const n = /^P-(\d+)$/.exec(String(r[idI] || ""));
    if (n) lastId = Math.max(lastId, Number(n[1]));
  }

  const today = new Date().toISOString().slice(0, 10);
  const signals = [...(await platsbanken(today)), ...(await otherSites())].filter((s) =>
    s.company
    && !STAFFING.test(`${s.company} ${s.alsoKnownAs}`)
    && !PUBLIC_SECTOR.test(s.company)
    && !NOT_MARKETING.test(s.headline));

  // One prospect per company: the signal with the closest deadline (an ad
  // with a deadline beats one without).
  const byCompany = new Map();
  for (const s of signals) {
    const key = s.org || norm(s.company);
    const prev = byCompany.get(key);
    if (!prev || (s.deadline || "9999") < (prev.deadline || "9999")) byCompany.set(key, s);
  }
  // The same company can come from both sources: once by org nr, once by name.
  const seenNames = new Set();
  const companies = [...byCompany.values()]
    .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"))
    .filter((s) => {
      const n = norm(s.company);
      if (seenNames.has(n)) return false;
      seenNames.add(n);
      return true;
    });

  const skipped = [];
  const fresh = companies
    .filter((s) => !knownAds.has(s.adId) && !(s.org && knownOrgs.has(s.org)))
    .filter((s) => {
      const existing = byName.get(norm(s.company)) || byDomain.get(domainOf(s.website)) || byDomain.get(domainOf(s.contact.email));
      if (existing) skipped.push(`${s.company} (already ${existing})`);
      return !existing;
    });

  const width = header.length;
  const rows = fresh.map((s) => {
    const { email } = s.contact;
    const emailType = !email ? "None yet" : GENERIC_INBOX.test(email) ? "General" : "Person";
    const who = [s.contact.name, s.contact.role && `(${s.contact.role})`].filter(Boolean).join(" ");
    const values = {
      ID: `P-${String(++lastId).padStart(3, "0")}`,
      Priority: 0,
      Company: s.company,
      "Person(s)": who,
      Location: s.location,
      "What they do": s.website,
      "Why PullUp": `Hiring ${s.lead ? "a marketing lead" : "marketing help"}: "${s.headline}".${s.deadline ? ` Pitch before the ${s.deadline} deadline.` : ""}`,
      Email: email || "—",
      "Email type": emailType,
      "Contact note": [who && `Ad contact: ${who}`, !email && "No email in the ad: find the founder/CEO"].filter(Boolean).join(". "),
      "Contact checked": "From job ad",
      Source: s.url ? `=HYPERLINK("${s.url}","${s.site} ↗")` : "",
      List: s.list,
      Stage: "Not contacted",
      Deadline: s.deadline,
      "Ad ID": asText(s.adId),
      "Org nr": asText(s.org),
    };
    return Array.from({ length: width }, (_, i) => values[header[i]] ?? "");
  });

  const fromOther = fresh.filter((s) => s.site !== "Platsbanken").length;
  console.log(`signals ${signals.length} · companies ${companies.length} · new ${rows.length} (${rows.length - fromOther} Platsbanken, ${fromOther} other sites)${skipped.length ? ` · already prospects ${skipped.length}` : ""}`);
  for (const s of skipped) console.log(`  skip ${s}`);
  if (DRY) {
    for (const s of fresh.slice(0, 25)) console.log(`  ${s.deadline || "no date  "}  ${s.site.padEnd(14)} ${s.company} — ${s.headline}`);
    return;
  }
  const written = await appendValues(sheetId, "Prospects!A:X", rows);
  console.log(`appended ${written} prospect(s)`);
}

main().catch((err) => {
  console.error("[hiring-signals]", err.message);
  process.exit(1);
});
