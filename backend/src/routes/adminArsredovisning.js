// ADMIN ÅRSREDOVISNING ROUTES — CRUD + generate + download for the iXBRL
// annual-report generator (services/arsredovisning.js). Admin-gated now;
// the same service becomes a creator-tier perk later (free filing for
// creators with AB). Submission to Bolagsverket is deliberately stubbed:
// their API only accepts traffic from avtal-holding software with an
// approved klientcertifikat, so /submit returns 501 until
// BOLAGSVERKET_API_ENABLED is set and the client module exists.
import { requireAdmin } from "../middleware/auth.js";
import { supabase } from "../supabase.js";
import { generate, validate } from "../services/arsredovisning.js";
import * as bolagsverket from "../services/bolagsverketClient.js";

const TABLE = "arsredovisningar";

export function registerAdminArsredovisningRoutes(app) {
  // List all reports, newest fiscal year first
  app.get("/admin/arsredovisningar", requireAdmin, async (req, res) => {
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, orgnr, company_name, fiscal_year_start, fiscal_year_end, status, created_at, updated_at")
      .order("fiscal_year_end", { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ arsredovisningar: data });
  });

  // Fetch one (full inputs for editing)
  app.get("/admin/arsredovisningar/:id", requireAdmin, async (req, res) => {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "not_found" });
    res.json({ arsredovisning: data });
  });

  // Create / update a draft. Body: { inputs } — the full generator input object.
  app.post("/admin/arsredovisningar", requireAdmin, async (req, res) => {
    const inputs = req.body?.inputs;
    if (!inputs?.company?.orgnr || !inputs?.fiscalYear?.end) {
      return res.status(400).json({ error: "inputs.company.orgnr and inputs.fiscalYear required" });
    }
    const row = {
      orgnr: inputs.company.orgnr,
      company_name: inputs.company.name || "",
      fiscal_year_start: inputs.fiscalYear.start,
      fiscal_year_end: inputs.fiscalYear.end,
      inputs,
      status: "draft",
      created_by_email: req.admin?.email || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from(TABLE).insert(row).select("id").single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data.id });
  });

  app.put("/admin/arsredovisningar/:id", requireAdmin, async (req, res) => {
    const inputs = req.body?.inputs;
    if (!inputs) return res.status(400).json({ error: "inputs required" });
    const { error } = await supabase
      .from(TABLE)
      .update({
        inputs,
        orgnr: inputs.company?.orgnr,
        company_name: inputs.company?.name || "",
        fiscal_year_start: inputs.fiscalYear?.start,
        fiscal_year_end: inputs.fiscalYear?.end,
        status: "draft", // any edit invalidates a previous generate
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

  // Stateless validate + preview: returns errors OR derived sums + xhtml,
  // without persisting. Powers the live form (balance check as you type).
  app.post("/admin/arsredovisningar/preview", requireAdmin, async (req, res) => {
    const inputs = req.body?.inputs;
    if (!inputs) return res.status(400).json({ error: "inputs required" });
    const errors = validate(inputs);
    if (errors.length) return res.json({ ok: false, errors });
    try {
      const { xhtml, derived, dispositionType } = generate(inputs);
      res.json({ ok: true, errors: [], xhtml, derived, dispositionType });
    } catch (e) {
      res.json({ ok: false, errors: e.validationErrors || [e.message] });
    }
  });

  // Generate + persist the canonical xhtml on the row
  app.post("/admin/arsredovisningar/:id/generate", requireAdmin, async (req, res) => {
    const { data: row, error: fetchErr } = await supabase
      .from(TABLE)
      .select("inputs")
      .eq("id", req.params.id)
      .maybeSingle();
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!row) return res.status(404).json({ error: "not_found" });
    const errors = validate(row.inputs);
    if (errors.length) return res.status(422).json({ ok: false, errors });
    const { xhtml, derived } = generate(row.inputs);
    const { error } = await supabase
      .from(TABLE)
      .update({ ixbrl_xhtml: xhtml, derived, status: "generated", updated_at: new Date().toISOString() })
      .eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, derived });
  });

  // Download the generated iXBRL file
  app.get("/admin/arsredovisningar/:id/ixbrl", requireAdmin, async (req, res) => {
    const { data, error } = await supabase
      .from(TABLE)
      .select("ixbrl_xhtml, orgnr, fiscal_year_end")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data?.ixbrl_xhtml) return res.status(404).json({ error: "not_generated" });
    const year = String(data.fiscal_year_end).slice(0, 4);
    res.setHeader("Content-Type", "application/xhtml+xml; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="arsredovisning-${year}-${data.orgnr.replace("-", "")}.xhtml"`
    );
    res.send(data.ixbrl_xhtml);
  });

  // Submit to Bolagsverket — STUB until the avtal + klientcertifikat exist.
  // The real flow: POST the iXBRL to Bolagsverket's inlämning API → receive
  // an eget-utrymme URL → the signatory opens it, signs with their own
  // BankID on Bolagsverket's site, submits. Nothing to build client-side
  // for BankID; the gate is purely the supplier agreement.
  app.post("/admin/arsredovisningar/:id/submit", requireAdmin, async (req, res) => {
    if (!bolagsverket.isConfigured()) {
      return res.status(501).json({
        error: "not_configured",
        message:
          "Digital inlämning väntar på Bolagsverket-avtal och klientcertifikat. Ladda ner iXBRL-filen och arkivera, eller lämna in via ombud tills vidare.",
      });
    }
    const pnr = req.body?.undertecknarePnr;
    const epost = req.body?.epost ? [req.body.epost] : [];
    if (!pnr) return res.status(400).json({ error: "undertecknarePnr required" });
    const { data: row, error: fetchErr } = await supabase
      .from(TABLE)
      .select("ixbrl_xhtml, orgnr")
      .eq("id", req.params.id)
      .maybeSingle();
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!row?.ixbrl_xhtml) return res.status(422).json({ error: "not_generated", message: "Generera dokumentet först." });
    try {
      const result = await bolagsverket.submit({ pnr, orgnr: row.orgnr, xhtml: row.ixbrl_xhtml, epost });
      await supabase
        .from(TABLE)
        .update({ status: "submitted", updated_at: new Date().toISOString() })
        .eq("id", req.params.id);
      // egetUtrymmeUrl is where the signatory signs with BankID on Bolagsverket's site
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(502).json({ error: "bolagsverket_error", message: e.message, utfall: e.utfall || e.body || null });
    }
  });
}
