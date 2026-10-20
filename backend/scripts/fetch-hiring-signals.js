/**
 * Hiring signals → Priority 0 prospects in the sales sheet.
 *
 * Companies advertising a marketing role right now are the warmest prospects:
 * they have the need and a budget, and the ad's last day is the deadline for
 * reaching them before they hire. This pulls live ads from Arbetsförmedlingen's
 * open JobSearch API (Platsbanken; no key), keeps companies (org nr 5…/9…, no
 * public sector or associations), drops staffing/recruitment firms (they hide
 * the real employer) and sales jobs in marketing clothing, and appends each
 * new company to Prospects as Priority 0 with the ad's Deadline. The admin
 * page sends Priority 0 first, closest deadline first.
 *
 *   node --env-file=.env scripts/fetch-hiring-signals.js [--dry]
 *
 * Runs daily on the server (crontab). Needs GOOGLE_SERVICE_ACCOUNT_JSON with
 * edit access to SALES_SHEET_ID.
 */
import { appendValues, batchGetValues } from "../src/lib/googleSheets.js";

const API = "https://jobsearch.api.jobtechdev.se/search";
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
const LEAD_OCCUPATIONS = new Set(["Marknadschef", "Kommunikationschef", "E-commerce manager"]);
const LEAD_TITLE = /\b(chef|head|ansvarig|lead|director|cmo|manager)\b|marknadschef|kommunikationschef/i;

const STAFFING = /bemanning|rekryter|recruit|staffing|academic work|adecco|manpower|randstad|poolia|experis|jefferson wells|student ?consulting|\btng\b|bravura|dreamwork|uniflex|proffice|lernia|jobbusters|keystep|hays\b|michael page|kelly services|personalkoncernen|olivia|jurek|brightby|onepartner|jobandtalent|instaff|novare|perido|clockwork|wise professionals|ework|incluso|performiq|adding people|interim|eventpersonal|nlmp|personnel|personaltjänst|personal ?service/i;
// Marketing-titled ads that are really sales or phone jobs.
const NOT_MARKETING = /m[öo]te?s?bokare|telemarket|telefonf[öo]rs|s[äa]ljare|kundtj[äa]nst|customer service|kundservice|f[äa]lts[äa]lj|d[öo]rrknack/i;
const UNION_CONTACT = /saco|vision\b|unionen|akademikerf|ledarna|kommunal\b|st inom|fackli/i;
const GENERIC_INBOX = /^(info|jobb|jobs?|career|karriar|karriär|hr|rekrytering|recruitment|ansokan|apply|kontakt|contact|hello|hej)@/i;

const day = (iso) => (iso ? String(iso).slice(0, 10) : "");
const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\b(ab|publ|aktiebolag|aktiebolaget|sverige|sweden|group|hb|kb)\b/g, " ").replace(/\s+/g, " ").trim();
const domainOf = (s) => {
  const m = /(?:@|\/\/)(?:www\.)?([^/@\s>]+)/i.exec(String(s || ""));
  return m ? m[1].toLowerCase() : "";
};
const asText = (v) => (v ? `'${v}` : ""); // keep IDs and org numbers as text

async function fetchAds() {
  const ads = new Map();
  for (let offset = 0; offset < 2000; offset += 100) {
    const qs = new URLSearchParams({ limit: "100", offset: String(offset) });
    for (const id of Object.keys(OCCUPATIONS)) qs.append("occupation-name", id);
    const res = await fetch(`${API}?${qs}`, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`jobsearch ${res.status}`);
    const body = await res.json();
    for (const h of body.hits || []) ads.set(String(h.id), h);
    if (!body.hits?.length || offset + 100 >= (body.total?.value || 0)) break;
  }
  return [...ads.values()];
}

function contactOf(ad) {
  const people = (ad.application_contacts || []).filter((c) => !UNION_CONTACT.test(`${c.name} ${c.description || ""}`));
  const c = people.find((p) => p.email) || people[0];
  if (c) {
    const role = c.contact_type || c.description;
    return { name: c.name || "", role: role || "", email: c.email || "" };
  }
  return { name: "", role: "", email: ad.application_details?.email || ad.employer?.email || "" };
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
  const ads = await fetchAds();
  // The API widens an occupation search to related ones; keep only ours.
  const relevant = ads.filter((ad) =>
    OCCUPATIONS[ad.occupation?.concept_id]
    && /^[59]/.test(ad.employer?.organization_number || "")
    && !STAFFING.test(`${ad.employer?.name} ${ad.employer?.workplace}`)
    && !NOT_MARKETING.test(ad.headline || "")
    && day(ad.application_deadline) >= today);

  // One prospect per company: its ad with the closest deadline.
  const byOrg = new Map();
  for (const ad of relevant) {
    const org = ad.employer.organization_number;
    const prev = byOrg.get(org);
    if (!prev || day(ad.application_deadline) < day(prev.application_deadline)) byOrg.set(org, ad);
  }

  const skipped = [];
  const fresh = [...byOrg.values()]
    .filter((ad) => !knownAds.has(String(ad.id)) && !knownOrgs.has(ad.employer.organization_number))
    .filter((ad) => {
      const contact = contactOf(ad);
      const existing = byName.get(norm(ad.employer?.name)) || byDomain.get(domainOf(ad.employer?.url)) || byDomain.get(domainOf(contact.email));
      if (existing) skipped.push(`${ad.employer?.name} (already ${existing})`);
      return !existing;
    })
    .sort((a, b) => day(a.application_deadline).localeCompare(day(b.application_deadline)));

  const width = header.length;
  const rows = fresh.map((ad) => {
    const occupation = OCCUPATIONS[ad.occupation.concept_id];
    const lead = LEAD_OCCUPATIONS.has(occupation) || LEAD_TITLE.test(ad.headline || "");
    const contact = contactOf(ad);
    const email = contact.email;
    const emailType = !email ? "None yet" : GENERIC_INBOX.test(email) ? "General" : "Person";
    const who = [contact.name, contact.role && `(${contact.role})`].filter(Boolean).join(" ");
    const values = {
      ID: `P-${String(++lastId).padStart(3, "0")}`,
      Priority: 0,
      Company: ad.employer?.name || ad.employer?.workplace || "",
      "Person(s)": who,
      Location: [ad.workplace_address?.municipality, ad.workplace_address?.region].filter(Boolean).join(", "),
      "What they do": ad.employer?.url || "",
      "Why PullUp": `Hiring ${lead ? "a marketing lead" : "marketing help"}: "${ad.headline}". Pitch before the ${day(ad.application_deadline)} deadline.`,
      Email: email || "—",
      "Email type": emailType,
      "Contact note": [who && `Ad contact: ${who}`, !email && "No email in the ad: find the founder/CEO"].filter(Boolean).join(". "),
      "Contact checked": "From job ad",
      Source: `=HYPERLINK("${ad.webpage_url}","Platsbanken ↗")`,
      List: `Platsbanken: ${occupation}`,
      Stage: "Not contacted",
      Deadline: day(ad.application_deadline),
      "Ad ID": asText(ad.id),
      "Org nr": asText(ad.employer?.organization_number),
    };
    return Array.from({ length: width }, (_, i) => values[header[i]] ?? "");
  });

  console.log(`ads ${ads.length} · relevant ${relevant.length} · companies ${byOrg.size} · new ${rows.length}${skipped.length ? ` · already prospects ${skipped.length}` : ""}`);
  for (const s of skipped) console.log(`  skip ${s}`);
  if (DRY) {
    for (const r of rows.slice(0, 15)) console.log(`  ${r[header.indexOf("Deadline")]}  ${r[0]}  ${r[2]}  <${r[header.indexOf("Email type")]}>`);
    return;
  }
  const written = await appendValues(sheetId, "Prospects!A:X", rows);
  console.log(`appended ${written} prospect(s)`);
}

main().catch((err) => {
  console.error("[hiring-signals]", err.message);
  process.exit(1);
});
