// The universal-dump import brain: "dump your data from <brand>" lands here.
//
// Philosophy (agreed 2026-06-12): AI proposes, deterministic code disposes.
// A mapping is a declarative {column → field} document. Heuristics draft it
// (multilingual header names + value-shape sniffing), the optional AI pass
// only refines columns the heuristics couldn't place, and then EVERY row is
// run through hard validators before anything can land. "100%" comes from
// verification, never from model confidence — rows that fail surface as
// rejects, they are never silently guessed.
//
// Pure module: no I/O except proposeMappingAI's single Claude call.

// The person fields a dump can land into. email is the identity anchor —
// a row without a valid email is a reject (the whole spine is email-keyed).
export const TARGET_FIELDS = [
  "email", "name", "first_name", "last_name", "phone", "instagram", "twitter",
  "tiktok", "linkedin", "company", "birthday", "tags",
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Header-name synonyms, multilingual (sv/en first — our market).
const HEADER_HINTS = {
  email: ["email", "e-mail", "mail", "epost", "e-post", "mejl", "email address", "e-postadress"],
  name: ["name", "namn", "full name", "fullname", "fullständigt namn", "guest", "gäst", "attendee", "deltagare"],
  first_name: ["first name", "firstname", "förnamn", "given name", "fname"],
  last_name: ["last name", "lastname", "surname", "efternamn", "family name", "lname"],
  phone: ["phone", "telefon", "tel", "mobile", "mobil", "mobilnummer", "phone number", "telefonnummer", "cell"],
  instagram: ["instagram", "ig", "insta", "instagram handle", "ig handle"],
  twitter: ["twitter", "x handle", "x"],
  tiktok: ["tiktok", "tik tok"],
  linkedin: ["linkedin"],
  company: ["company", "företag", "bolag", "organisation", "organization", "org", "account name"],
  birthday: ["birthday", "födelsedag", "date of birth", "dob", "born", "födelsedatum"],
  tags: ["tags", "taggar", "labels", "category", "kategori", "segment"],
};

const norm = (s) => String(s || "").trim().toLowerCase().replace(/[_\-./]+/g, " ").replace(/\s+/g, " ");

// Substring matching needs negatives: "Event Name", "Middle Name", "Username"
// all contain "name" but none of them is the guest's name.
const FIELD_NEGATIVES = {
  name: ["middle", "mellannamn", "user", "användar", "nick", "event", "company", "ticket", "host", "brand", "file", "status", "type", "typ", "account", "konto", "form", "ad ", "domain"],
  first_name: ["middle", "mellannamn"],
  last_name: ["middle", "mellannamn"],
  email: ["disabled", "status", "marketing", "accepts"],
  phone: ["country", "carrier", "verified"],
};
const blocked = (field, n) => (FIELD_NEGATIVES[field] || []).some((neg) => n.includes(neg));

// Hints are matched against normalized headers, so they must be normalized
// the same way ("e-post" and "E-post" both become "e post").
const NORMALIZED_HINTS = Object.fromEntries(
  Object.entries(HEADER_HINTS).map(([field, hints]) => [field, hints.map(norm)])
);

// ---------------------------------------------------------------------------
// 1. Heuristic mapping draft
// ---------------------------------------------------------------------------

function sniffValues(values) {
  const present = values.filter((v) => String(v || "").trim());
  if (!present.length) return null;
  const share = (re) => present.filter((v) => re.test(String(v).trim())).length / present.length;
  if (share(EMAIL_RE) > 0.7) return "email";
  // Sniffed phones must start with + or 0 — order numbers ("123456789") and
  // dates ("2026-04-15") are digit-runs too, and both burned us in the
  // format experiment. A host can still map any column to phone by hand.
  if (share(/^(\+|0)[\d\s\-()]{6,17}$/) > 0.7) return "phone";
  if (share(/^@?[a-z0-9._]{2,30}$/i) > 0.8 && present.some((v) => String(v).startsWith("@"))) return "instagram";
  if (share(/^\d{4}-\d{2}-\d{2}/) > 0.7 || share(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/) > 0.7) return "birthday";
  return null;
}

// Operational/metadata columns (timestamps, order numbers, amounts, statuses)
// must never be shape-sniffed into person fields — an order date is exactly
// the kind of value that would otherwise land as a birthday or phone.
const OPERATIONAL_TOKENS = [
  "date", "datum", "time", "created", "updated", "registered", "subscribed",
  "submitted", "joined", "visited", "checked", "expiry", "expires", "status",
  "order", "köp", "optin", "opt in", "amount", "spent", "total", "count",
  "quantity", "rating", "price", "pris", "url", "länk", "link", "address",
  "adress", "city", "stad", "country", "land", "zip", "postnummer", "timestamp",
];
const OPERATIONAL_RE = { test: (n) => OPERATIONAL_TOKENS.some((t) => n.includes(t)) };

export function proposeMappingHeuristic(headers, rows) {
  const mapping = {}; // column header -> { field, via }
  const taken = new Set();
  // Phase 1: EXACT header matches across all fields ("Förnamn" must win
  // first_name before the substring pass lets "namn" grab it for name).
  for (const h of headers) {
    const n = norm(h);
    for (const [field, hints] of Object.entries(NORMALIZED_HINTS)) {
      if (taken.has(field)) continue;
      if (hints.includes(n) && !blocked(field, n)) {
        mapping[h] = { field, via: "header" };
        taken.add(field);
        break;
      }
    }
  }
  // Phase 2: substring matches for what's left. (No operational guard here —
  // "E-mail Address" contains "address" but must still match the email hint;
  // the guard protects shape-sniffing only, where there's no hint evidence.)
  for (const h of headers) {
    if (mapping[h]) continue;
    const n = norm(h);
    for (const [field, hints] of Object.entries(NORMALIZED_HINTS)) {
      if (taken.has(field)) continue;
      if (hints.some((hint) => hint.length > 3 && n.includes(hint)) && !blocked(field, n)) {
        mapping[h] = { field, via: "header" };
        taken.add(field);
        break;
      }
    }
  }
  // Phase 3: shape-sniff unmapped, non-operational columns from samples.
  for (const h of headers) {
    if (mapping[h] || OPERATIONAL_RE.test(norm(h))) continue;
    const field = sniffValues(rows.slice(0, 50).map((r) => r[h]));
    if (field && !taken.has(field)) {
      mapping[h] = { field, via: "values" };
      taken.add(field);
    }
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// 2. Optional AI refinement — only for columns the heuristics left unmapped
// ---------------------------------------------------------------------------

export async function proposeMappingAI(headers, rows, heuristic) {
  if (!process.env.ANTHROPIC_API_KEY) return heuristic;
  const unmapped = headers.filter((h) => !heuristic[h]);
  const open = TARGET_FIELDS.filter((f) => !Object.values(heuristic).some((m) => m.field === f));
  if (!unmapped.length || !open.length) return heuristic;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const samples = Object.fromEntries(
      unmapped.map((h) => [h, rows.slice(0, 5).map((r) => String(r[h] ?? "").slice(0, 80))])
    );
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{
        role: "user",
        content:
          `These CSV columns from a guest-list export could not be auto-mapped. ` +
          `Available target fields: ${open.join(", ")}. ` +
          `Column samples: ${JSON.stringify(samples)}. ` +
          `Reply with ONLY a JSON object mapping column names to one of the target fields, ` +
          `omitting any column that doesn't clearly match. No prose.`,
      }],
    });
    const text = res.content?.[0]?.text || "{}";
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const out = { ...heuristic };
    for (const [col, field] of Object.entries(parsed)) {
      if (unmapped.includes(col) && open.includes(field) &&
          !Object.values(out).some((m) => m.field === field)) {
        out[col] = { field, via: "ai" };
      }
    }
    return out;
  } catch (err) {
    console.warn("[importMapping] AI refinement skipped:", err.message);
    return heuristic; // heuristics alone are a complete, honest mapping
  }
}

// ---------------------------------------------------------------------------
// 3. Deterministic validation — where the 100% actually comes from
// ---------------------------------------------------------------------------

const cleanHandle = (v) =>
  String(v).trim().replace(/^https?:\/\/(www\.)?(instagram\.com|twitter\.com|x\.com|tiktok\.com\/@?|linkedin\.com\/in)\//i, "")
    .replace(/^@/, "").replace(/[/?].*$/, "").slice(0, 64) || null;

function parseBirthday(v) {
  const s = String(v).trim();
  let d = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s.slice(0, 10));
  else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [a, b, y] = s.split("/").map(Number);
    // DD/MM vs MM/DD: trust the unambiguous side; ambiguous defaults to DD/MM (sv).
    const [day, mon] = a > 12 ? [a, b] : b > 12 ? [b, a] : [a, b];
    d = new Date(Date.UTC(y, mon - 1, day));
  }
  if (!d || isNaN(d)) return null;
  const year = d.getUTCFullYear();
  if (year < 1900 || year > new Date().getUTCFullYear() - 5) return null;
  return d.toISOString().slice(0, 10);
}

const FIELD_CLEANERS = {
  email: (v) => {
    let e = String(v).trim();
    // "Anna Andersson <anna@x.com>" and "mailto:anna@x.com" both appear in
    // real dumps — extract the address before judging it.
    const angle = e.match(/<([^<>\s]+@[^<>\s]+)>/);
    if (angle) e = angle[1];
    e = e.replace(/^mailto:/i, "").toLowerCase();
    return EMAIL_RE.test(e) ? e : null;
  },
  name: (v) => String(v).trim().slice(0, 200) || null,
  first_name: (v) => String(v).trim().slice(0, 100) || null,
  last_name: (v) => String(v).trim().slice(0, 100) || null,
  phone: (v) => {
    const p = String(v).trim().replace(/^p:/i, ""); // Facebook lead-ads prefix
    return /^\+?[\d\s\-()]{7,18}$/.test(p) ? p.replace(/[\s\-()]/g, "") : null;
  },
  instagram: cleanHandle,
  twitter: cleanHandle,
  tiktok: cleanHandle,
  linkedin: cleanHandle,
  company: (v) => String(v).trim().slice(0, 200) || null,
  birthday: parseBirthday,
  tags: (v) => {
    const t = String(v)
      .split(/[,;|]/)
      .map((x) => x.trim().replace(/^["'\u201c\u201d\u2018\u2019]+|["'\u201c\u201d\u2018\u2019]+$/g, "").trim())
      .filter(Boolean)
      .slice(0, 20);
    return t.length ? t : null;
  },
};

// Run the mapping over every row. A row needs a valid email to land (the
// identity anchor); every other field is optional and dropped per-field if
// it fails its cleaner (counted, never guessed). Unmapped columns ride
// along untouched in `extra` so nothing in the dump is ever lost.
export function validateRows(rows, mapping) {
  const people = [];
  const rejects = [];
  const fieldDrops = {};
  const emailCol = Object.keys(mapping).find((c) => mapping[c].field === "email");
  if (!emailCol) return { people, rejects, fieldDrops, error: "no email column mapped" };

  const seen = new Set();
  rows.forEach((row, i) => {
    const email = FIELD_CLEANERS.email(row[emailCol] ?? "");
    if (!email) {
      rejects.push({ row: i + 2, reason: `no valid email ("${String(row[emailCol] ?? "").slice(0, 60)}")` });
      return;
    }
    if (seen.has(email)) {
      rejects.push({ row: i + 2, reason: `duplicate of ${email} earlier in file` });
      return;
    }
    seen.add(email);

    const person = { email, extra: {} };
    for (const [col, m] of Object.entries(mapping)) {
      if (m.field === "email") continue;
      const raw = row[col];
      if (raw === undefined || String(raw).trim() === "") continue;
      const cleaned = FIELD_CLEANERS[m.field]?.(raw) ?? null;
      if (cleaned === null) fieldDrops[m.field] = (fieldDrops[m.field] || 0) + 1;
      else person[m.field] = cleaned;
    }
    // First/Last compose into name; an explicit full-name column wins.
    if (!person.name && (person.first_name || person.last_name)) {
      person.name = [person.first_name, person.last_name].filter(Boolean).join(" ");
    }
    delete person.first_name;
    delete person.last_name;
    for (const col of Object.keys(row)) {
      if (!mapping[col] && String(row[col] ?? "").trim()) person.extra[col] = String(row[col]).slice(0, 500);
    }
    people.push(person);
  });

  return { people, rejects, fieldDrops };
}
