// The sales sheet (SALES_SHEET_ID) as the server sees it: one cached read
// shared by the admin pages, and the one write the site makes itself —
// a website request becomes (or updates) a prospect row.
import { appendValues, batchGetValues, batchUpdateValues, sheetsConfigured } from "./googleSheets.js";
import { stockholmToday } from "./salesSummary.js";

const CACHE_MS = 60_000;
let cache = null; // { at, raw }

export const salesSheetConfigured = () => !!process.env.SALES_SHEET_ID && sheetsConfigured();
export const salesSheetUrl = () => `https://docs.google.com/spreadsheets/d/${process.env.SALES_SHEET_ID}/edit`;

export async function readSalesSheet({ fresh = false } = {}) {
  if (!cache || fresh || Date.now() - cache.at > CACHE_MS) {
    const [prospectRows, logRows, overviewRows] = await batchGetValues(process.env.SALES_SHEET_ID, ["Prospects!A:X", "Log!A:E", "Overview!A1:B40"]);
    cache = { at: Date.now(), raw: { prospectRows, logRows, overviewRows } };
  }
  return { ...cache.raw, readAt: new Date(cache.at).toISOString() };
}

const colLetter = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));
const asText = (v) => (v ? `'${v}` : "");

// A request from the site's form → the sheet. Someone already on the list
// (same email) gets their row moved to Replied, Priority 0; anyone else gets
// a new row. Returns the prospect ID.
export async function recordWebsiteLead({ name, email, company, description, preferredTime, plan }) {
  const sheetId = process.env.SALES_SHEET_ID;
  const [rows] = await batchGetValues(sheetId, ["Prospects!A:X"]);
  const header = rows[0] || [];
  const col = (h) => header.indexOf(h);
  const today = stockholmToday();
  const note = [`Website request ${today}: ${description.replace(/\s+/g, " ").slice(0, 400)}`, plan && `Wants: ${plan}`, preferredTime && `Can talk: ${preferredTime}`].filter(Boolean).join(" · ");

  const at = rows.findIndex((r, i) => i > 0 && String(r[col("Email")] || "").trim().toLowerCase() === email);
  if (at > 0) {
    const row = at + 1;
    const set = (h, v) => ({ range: `Prospects!${colLetter(col(h))}${row}`, values: [[v]] });
    const prevNotes = String(rows[at][col("Notes")] || "");
    await batchUpdateValues(sheetId, [
      set("Priority", 0),
      set("Stage", "Replied"),
      set("Last contact", today),
      set("Next step", "Answer the website request and book a meeting"),
      set("Next step date", today),
      set("Notes", prevNotes ? `${prevNotes}\n${note}` : note),
    ]);
    cache = null;
    return String(rows[at][col("ID")]);
  }

  const lastId = rows.slice(1).reduce((n, r) => Math.max(n, Number((/^P-(\d+)$/.exec(String(r[col("ID")] || "")) || [])[1]) || 0), 0);
  const id = `P-${String(lastId + 1).padStart(3, "0")}`;
  const values = {
    ID: id,
    Priority: 0,
    Company: company || name,
    "Person(s)": name,
    "Why PullUp": "Came to us: asked through the website.",
    Email: email,
    "Email type": "Person",
    "Contact note": "From the pullup.se request form",
    "Contact checked": "Website form",
    List: "Website",
    Stage: "Replied",
    "Last contact": today,
    "Next step": "Answer the website request and book a meeting",
    "Next step date": today,
    Notes: note,
  };
  await appendValues(sheetId, "Prospects!A:X", [header.map((h) => (h === "ID" ? asText(values[h]) : values[h] ?? ""))]);
  cache = null;
  return id;
}
