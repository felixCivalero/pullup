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
  "email", "name", "phone", "instagram", "twitter", "tiktok", "linkedin",
  "company", "birthday", "tags",
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Header-name synonyms, multilingual (sv/en first — our market).
const HEADER_HINTS = {
  email: ["email", "e-mail", "mail", "epost", "e-post", "mejl", "email address", "e-postadress"],
  name: ["name", "namn", "full name", "fullname", "fullständigt namn", "guest", "gäst", "attendee", "deltagare", "first name"],
  phone: ["phone", "telefon", "tel", "mobile", "mobil", "mobilnummer", "phone number", "telefonnummer", "cell"],
  instagram: ["instagram", "ig", "insta", "instagram handle", "ig handle"],
  twitter: ["twitter", "x handle", "x"],
  tiktok: ["tiktok", "tik tok"],
  linkedin: ["linkedin"],
  company: ["company", "företag", "bolag", "organisation", "organization", "org"],
  birthday: ["birthday", "födelsedag", "date of birth", "dob", "born", "födelsedatum"],
  tags: ["tags", "taggar", "labels", "category", "kategori", "segment", "group", "grupp"],
};

const norm = (s) => String(s || "").trim().toLowerCase().replace(/[_\-./]+/g, " ").replace(/\s+/g, " ");

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
  if (share(/^\+?[\d\s\-()]{7,18}$/) > 0.7) return "phone";
  if (share(/^@?[a-z0-9._]{2,30}$/i) > 0.8 && present.some((v) => String(v).startsWith("@"))) return "instagram";
  if (share(/^\d{4}-\d{2}-\d{2}/) > 0.7 || share(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/) > 0.7) return "birthday";
  return null;
}

export function proposeMappingHeuristic(headers, rows) {
  const mapping = {}; // column header -> { field, via }
  const taken = new Set();
  for (const h of headers) {
    const n = norm(h);
    for (const [field, hints] of Object.entries(NORMALIZED_HINTS)) {
      if (taken.has(field)) continue;
      if (hints.includes(n) || hints.some((hint) => n.includes(hint) && hint.length > 3)) {
        mapping[h] = { field, via: "header" };
        taken.add(field);
        break;
      }
    }
  }
  // Second pass: shape-sniff unmapped columns from up to 50 sample values.
  for (const h of headers) {
    if (mapping[h]) continue;
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
  return d && !isNaN(d) ? d.toISOString().slice(0, 10) : null;
}

const FIELD_CLEANERS = {
  email: (v) => {
    const e = String(v).trim().toLowerCase();
    return EMAIL_RE.test(e) ? e : null;
  },
  name: (v) => String(v).trim().slice(0, 200) || null,
  phone: (v) => {
    const p = String(v).trim();
    return /^\+?[\d\s\-()]{7,18}$/.test(p) ? p.replace(/[\s\-()]/g, "") : null;
  },
  instagram: cleanHandle,
  twitter: cleanHandle,
  tiktok: cleanHandle,
  linkedin: cleanHandle,
  company: (v) => String(v).trim().slice(0, 200) || null,
  birthday: parseBirthday,
  tags: (v) => {
    const t = String(v).split(/[,;|]/).map((x) => x.trim()).filter(Boolean).slice(0, 20);
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
    for (const col of Object.keys(row)) {
      if (!mapping[col] && String(row[col] ?? "").trim()) person.extra[col] = String(row[col]).slice(0, 500);
    }
    people.push(person);
  });

  return { people, rejects, fieldDrops };
}
