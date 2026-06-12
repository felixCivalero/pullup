// "Dump your data from <brand>" — the universal import, stage-1 sibling of
// /host/export. Two steps, both stateless:
//
//   POST /host/import/preview  { csvText }            → proposed mapping +
//        validation stats + sample, nothing written. Heuristics draft the
//        mapping; AI refines only the columns heuristics couldn't place.
//   POST /host/import/commit   { csvText, mapping, source } → re-parses and
//        re-validates SERVER-SIDE (the client's preview is a courtesy, never
//        trusted), then lands people idempotently:
//          - email-keyed upsert (people.email unique, mig 078)
//          - fill-only-empty: imported values NEVER overwrite existing data
//            (external data links, never clobbers — house rule)
//          - tags merge; unmapped columns persist in import_metadata.extra
//          - one person_events timeline entry per person, dedupe-keyed, so
//            re-dumping the same file can never double anyone.

import { requireAuth } from "../middleware/auth.js";
import { parseCsv } from "../services/csvImportService.js";
import {
  TARGET_FIELDS,
  proposeMappingHeuristic,
  proposeMappingAI,
  validateRows,
} from "../services/importMapping.js";

const MAX_ROWS = 5000;
const FILL_FIELDS = ["name", "phone", "instagram", "twitter", "tiktok", "linkedin", "company", "birthday"];

function parseAndCap(csvText) {
  if (!csvText || typeof csvText !== "string") return { error: "csvText is required" };
  const rows = parseCsv(csvText);
  if (!rows.length) return { error: "couldn't find any rows in the file" };
  if (rows.length > MAX_ROWS) return { error: `max ${MAX_ROWS} rows per import (got ${rows.length})` };
  return { rows, headers: Object.keys(rows[0]) };
}

export function registerHostImportRoutes(app) {
  app.post("/host/import/preview", requireAuth, async (req, res) => {
    try {
      const { error, rows, headers } = parseAndCap(req.body?.csvText);
      if (error) return res.status(400).json({ error });

      const heuristic = proposeMappingHeuristic(headers, rows);
      const mapping = await proposeMappingAI(headers, rows, heuristic);
      const { people, rejects, fieldDrops, error: vErr } = validateRows(rows, mapping);

      return res.json({
        columns: headers,
        targetFields: TARGET_FIELDS,
        mapping: Object.fromEntries(Object.entries(mapping).map(([c, m]) => [c, m])),
        stats: {
          totalRows: rows.length,
          validPeople: people.length,
          rejected: rejects.length,
          fieldDrops,
        },
        sample: people.slice(0, 5),
        rejects: rejects.slice(0, 20),
        mappingError: vErr || null,
        aiAvailable: !!process.env.ANTHROPIC_API_KEY,
      });
    } catch (err) {
      console.error("[host/import/preview] error:", err.message);
      return res.status(500).json({ error: "Failed to read the file" });
    }
  });

  app.post("/host/import/commit", requireAuth, async (req, res) => {
    try {
      const hostId = req.user.id;
      const { error, rows } = parseAndCap(req.body?.csvText);
      if (error) return res.status(400).json({ error });

      // Client sends {column: field}; normalize and whitelist.
      const rawMap = req.body?.mapping || {};
      const mapping = {};
      for (const [col, field] of Object.entries(rawMap)) {
        const f = typeof field === "string" ? field : field?.field;
        if (TARGET_FIELDS.includes(f)) mapping[col] = { field: f };
      }
      const { people, rejects, error: vErr } = validateRows(rows, mapping);
      if (vErr) return res.status(400).json({ error: vErr });
      if (!people.length) return res.status(400).json({ error: "no valid people to import", rejects: rejects.slice(0, 20) });

      const source = String(req.body?.source || "csv").trim().slice(0, 80) || "csv";
      const { supabase } = await import("../supabase.js");

      const chunk = (arr, n) => {
        const out = [];
        for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
        return out;
      };

      // Who already exists? (email unique since mig 078)
      const byEmail = new Map();
      for (const ids of chunk(people.map((p) => p.email), 200)) {
        const { data, error: exErr } = await supabase
          .from("people")
          .select("id, email, name, phone, instagram, twitter, tiktok, linkedin, company, birthday, tags, import_source, import_metadata")
          .in("email", ids);
        if (exErr) throw exErr;
        for (const p of data || []) byEmail.set((p.email || "").toLowerCase(), p);
      }

      let created = 0, updated = 0;
      const importedAt = new Date().toISOString();
      const timelineRows = [];

      for (const p of people) {
        const existing = byEmail.get(p.email);
        const meta = { source, importedAt, ...(Object.keys(p.extra).length ? { extra: p.extra } : {}) };

        let personId;
        if (existing) {
          // Fill-only-empty: the dump enriches, never overwrites.
          const updates = {};
          for (const f of FILL_FIELDS) {
            if (p[f] != null && (existing[f] == null || existing[f] === "")) updates[f] = p[f];
          }
          if (p.tags?.length) {
            const merged = [...new Set([...(existing.tags || []), ...p.tags])];
            if (merged.length !== (existing.tags || []).length) updates.tags = merged;
          }
          if (!existing.import_source) updates.import_source = source;
          updates.import_metadata = { ...(existing.import_metadata || {}), [`import_${importedAt.slice(0, 10)}`]: meta };
          const { error: upErr } = await supabase.from("people").update(updates).eq("id", existing.id);
          if (upErr) throw upErr;
          personId = existing.id;
          updated++;
        } else {
          const { data: ins, error: insErr } = await supabase
            .from("people")
            .insert({
              email: p.email,
              name: p.name || null,
              phone: p.phone || null,
              instagram: p.instagram || null,
              twitter: p.twitter || null,
              tiktok: p.tiktok || null,
              linkedin: p.linkedin || null,
              company: p.company || null,
              birthday: p.birthday || null,
              tags: p.tags || [],
              import_source: source,
              import_metadata: meta,
            })
            .select("id")
            .single();
          if (insErr) throw insErr;
          personId = ins.id;
          created++;
        }

        timelineRows.push({
          person_id: personId,
          host_id: hostId,
          type: "import",
          channel: null,
          direction: null,
          body: `Imported from ${source}`,
          metadata: meta,
          occurred_at: importedAt,
          dedupe_key: `import:${source}:${p.email}`,
        });
      }

      // Timeline entries, idempotent on dedupe_key — a re-run of the same
      // dump updates nothing and adds nothing.
      for (const batch of chunk(timelineRows, 200)) {
        const { error: tlErr } = await supabase
          .from("person_events")
          .upsert(batch, { onConflict: "dedupe_key", ignoreDuplicates: true });
        if (tlErr) throw tlErr;
      }

      return res.json({
        ok: true,
        created,
        updated,
        rejected: rejects.length,
        rejects: rejects.slice(0, 20),
        source,
      });
    } catch (err) {
      console.error("[host/import/commit] error:", err.message);
      return res.status(500).json({ error: "Import failed — nothing may have been partially written; re-running is safe (idempotent)" });
    }
  });
}
