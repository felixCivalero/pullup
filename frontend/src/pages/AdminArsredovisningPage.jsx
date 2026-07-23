// Admin Årsredovisning generator — enter a handful of atomic K2 amounts and
// PullUp derives every sum, refuses anything that doesn't balance, and
// generates a Bolagsverket-valid iXBRL annual report (validated against the
// live K2 taxonomy with Arelle). Admin-only today; becomes a free perk for
// creators with AB once the creator-facing phase ships. Digital submission
// is stubbed until PullUp holds the Bolagsverket avtal + klientcertifikat —
// until then: generate, download, archive.
// Backed by routes/adminArsredovisning.js + services/arsredovisning.js.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileCheck,
  Download,
  Save,
  Send,
  Scale,
  AlertTriangle,
  CheckCircle2,
  Plus,
  FolderOpen,
} from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

const EMPTY_YEAR = () => ({
  rr: { nettoomsattning: 0, ovrigaRorelseintakter: 0, personalkostnader: 0, ovrigaExternaKostnader: 0, avskrivningar: 0, ranteintakter: 0, rantekostnader: 0 },
  br: { inventarier: 0, ovrigaFordringar: 0, kassaBank: 0, aktiekapital: 25000, ovrigaLangfristigaSkulder: 0, ovrigaKortfristigaSkulder: 0 },
  ek: { balanseratResultatIngaende: 0, aretsResultatForegaende: 0, erhallnaAktieagartillskott: 0, utdelning: 0 },
  medelantalAnstallda: 0,
});

const EMPTY_INPUTS = () => ({
  company: { name: "", orgnr: "" },
  fiscalYear: { start: "", end: "" },
  stamma: { date: "" },
  signature: { firstName: "", lastName: "", role: "Verkställande direktör", city: "", date: "" },
  texts: { verksamheten: "", vasentligaHandelser: "", ovrigaUpplysningar: "", handelserEfterAret: "" },
  currentYear: EMPTY_YEAR(),
  previousYear: EMPTY_YEAR(),
  history: [],
});

// Example data: the real, Arelle-validated Kaijas Collective AB FY2025 filing.
const KAIJAS_EXAMPLE = {
  company: { name: "Kaijas Collective AB", orgnr: "556743-5986" },
  fiscalYear: { start: "2025-01-01", end: "2025-12-31" },
  stamma: { date: "2026-07-24" },
  signature: { firstName: "Felix", lastName: "Civalero Stolpe", role: "Verkställande direktör", city: "Stockholm", date: "2026-07-24" },
  texts: {
    verksamheten:
      "Företaget med säte i Stockholm registrerades år 2007 och bedriver sedan 2022 verksamhet inom programmering, automatisering och digitalisering av tjänster inom hälso- och sjukvård.",
    vasentligaHandelser:
      "Under året reglerades bolagets samtliga äldre skulder avseende skatter och avgifter. Aktieägaren tillförde 65 000 kr, varav 22 027 kr utgör ett ovillkorat aktieägartillskott.",
    ovrigaUpplysningar: "Nettomomsfordran per 2025-12-31 uppgår till 2 845 kr och ingår i posten Övriga fordringar.",
    handelserEfterAret:
      "Styrelsen har upprättat kontrollbalansräkning enligt 25 kap. 13 § aktiebolagslagen. Aktieägaren har utfärdat en kapitaltäckningsgaranti om högst 150 000 kr.",
  },
  currentYear: {
    rr: { nettoomsattning: 17800, ovrigaRorelseintakter: 16115, personalkostnader: 0, ovrigaExternaKostnader: 68173, avskrivningar: 0, ranteintakter: 77, rantekostnader: 3912 },
    br: { inventarier: 0, ovrigaFordringar: 21805, kassaBank: 2641, aktiekapital: 100000, ovrigaLangfristigaSkulder: 9714, ovrigaKortfristigaSkulder: 0 },
    ek: { balanseratResultatIngaende: -24016, aretsResultatForegaende: -45186, erhallnaAktieagartillskott: 22027, utdelning: 0 },
    medelantalAnstallda: 0,
  },
  previousYear: {
    rr: { nettoomsattning: 235170, ovrigaRorelseintakter: 0, personalkostnader: 108507, ovrigaExternaKostnader: 171849, avskrivningar: 0, ranteintakter: 0, rantekostnader: 0 },
    br: { inventarier: 0, ovrigaFordringar: 46203, kassaBank: 80016, aktiekapital: 100000, ovrigaLangfristigaSkulder: 9714, ovrigaKortfristigaSkulder: 85707 },
    ek: { balanseratResultatIngaende: -31323, aretsResultatForegaende: -9693, erhallnaAktieagartillskott: 17000, utdelning: 0 },
    medelantalAnstallda: 1,
  },
  history: [
    { year: "2023", nettoomsattning: 61648, resultatEfterFin: -9693, soliditet: 85.9 },
    { year: "2022", resultatEfterFin: -38522, soliditet: 100 },
  ],
};

const kr = (n) => (n == null ? "–" : `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("sv-SE")} kr`);

// ── Field descriptors: [label, path]. Paths are dotted into the year object.
const RR_FIELDS = [
  ["Nettoomsättning", "rr.nettoomsattning"],
  ["Övriga rörelseintäkter", "rr.ovrigaRorelseintakter"],
  ["Personalkostnader", "rr.personalkostnader"],
  ["Övriga externa kostnader", "rr.ovrigaExternaKostnader"],
  ["Av- och nedskrivningar", "rr.avskrivningar"],
  ["Ränteintäkter", "rr.ranteintakter"],
  ["Räntekostnader", "rr.rantekostnader"],
];
const BR_FIELDS = [
  ["Inventarier, verktyg och installationer", "br.inventarier"],
  ["Övriga fordringar", "br.ovrigaFordringar"],
  ["Kassa och bank", "br.kassaBank"],
  ["Aktiekapital", "br.aktiekapital"],
  ["Övriga långfristiga skulder", "br.ovrigaLangfristigaSkulder"],
  ["Övriga kortfristiga skulder", "br.ovrigaKortfristigaSkulder"],
];
const EK_FIELDS = [
  ["Balanserat resultat, ingående", "ek.balanseratResultatIngaende"],
  ["Föregående års resultat (balanseras)", "ek.aretsResultatForegaende"],
  ["Erhållet aktieägartillskott", "ek.erhallnaAktieagartillskott"],
  ["Utdelning", "ek.utdelning"],
  ["Medelantal anställda", "medelantalAnstallda"],
];

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  const clone = structuredClone(obj);
  let cur = clone;
  for (const k of keys.slice(0, -1)) cur = cur[k];
  cur[keys[keys.length - 1]] = value;
  return clone;
}

const S = {
  page: { padding: "24px 28px", maxWidth: 1400, margin: "0 auto", color: colors.text },
  h1: { fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 10, margin: 0 },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  layout: { display: "grid", gridTemplateColumns: "minmax(420px, 1fr) minmax(380px, 520px)", gap: 24, marginTop: 20, alignItems: "start" },
  card: { background: colors.surface, border: `1px solid ${colors.accentBorder || "#eee"}`, borderRadius: 12, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: colors.textMuted, marginBottom: 10 },
  row: { display: "grid", gridTemplateColumns: "1fr 120px 120px", gap: 8, alignItems: "center", marginBottom: 6 },
  rowLabel: { fontSize: 13 },
  input: { border: "1px solid #ddd", borderRadius: 8, padding: "6px 8px", fontSize: 13, width: "100%", boxSizing: "border-box" },
  numInput: { border: "1px solid #ddd", borderRadius: 8, padding: "6px 8px", fontSize: 13, width: "100%", textAlign: "right", boxSizing: "border-box", fontVariantNumeric: "tabular-nums" },
  colHead: { fontSize: 11, fontWeight: 700, color: colors.textMuted, textAlign: "right" },
  btn: (variant = "primary") => ({
    display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10,
    fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid transparent",
    ...(variant === "primary" && { background: colors.accent, color: "#fff" }),
    ...(variant === "ghost" && { background: "transparent", color: colors.text, border: "1px solid #ddd" }),
    ...(variant === "disabled" && { background: "#f1f1f1", color: "#999", cursor: "not-allowed" }),
  }),
};

export default function AdminArsredovisningPage() {
  const [inputs, setInputs] = useState(EMPTY_INPUTS);
  const [rowId, setRowId] = useState(null);
  const [saved, setSaved] = useState([]);
  const [preview, setPreview] = useState(null); // { ok, errors, xhtml, derived }
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const debounceRef = useRef(null);

  const loadList = useCallback(async () => {
    try {
      const res = await authenticatedFetch("/admin/arsredovisningar");
      if (res.ok) setSaved((await res.json()).arsredovisningar || []);
    } catch { /* list is cosmetic */ }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  // Live validate + preview, debounced against typing
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!inputs.company.orgnr) { setPreview(null); return; }
      try {
        const res = await authenticatedFetch("/admin/arsredovisningar/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputs }),
        });
        if (res.ok) setPreview(await res.json());
      } catch { /* preview is best-effort */ }
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [inputs]);

  const save = async () => {
    setBusy(true);
    try {
      const url = rowId ? `/admin/arsredovisningar/${rowId}` : "/admin/arsredovisningar";
      const res = await authenticatedFetch(url, {
        method: rowId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "save failed");
      if (!rowId) setRowId(body.id);
      setNotice("Sparad");
      loadList();
    } catch (e) {
      setNotice(`Fel: ${e.message}`);
    } finally {
      setBusy(false);
      setTimeout(() => setNotice(null), 2500);
    }
  };

  const generateAndDownload = async () => {
    setBusy(true);
    try {
      let id = rowId;
      if (!id) {
        const res = await authenticatedFetch("/admin/arsredovisningar", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "save failed");
        id = body.id;
        setRowId(id);
      } else {
        await authenticatedFetch(`/admin/arsredovisningar/${id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs }),
        });
      }
      const gen = await authenticatedFetch(`/admin/arsredovisningar/${id}/generate`, { method: "POST" });
      const genBody = await gen.json();
      if (!gen.ok) throw new Error((genBody.errors || [genBody.error]).join(" · "));
      const dl = await authenticatedFetch(`/admin/arsredovisningar/${id}/ixbrl`);
      const blob = await dl.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `arsredovisning-${inputs.fiscalYear.end?.slice(0, 4)}-${inputs.company.orgnr?.replace("-", "")}.xhtml`;
      a.click();
      URL.revokeObjectURL(a.href);
      setNotice("Genererad och nedladdad — Bolagsverket-valid iXBRL");
      loadList();
    } catch (e) {
      setNotice(`Fel: ${e.message}`);
    } finally {
      setBusy(false);
      setTimeout(() => setNotice(null), 4000);
    }
  };

  const loadRow = async (id) => {
    const res = await authenticatedFetch(`/admin/arsredovisningar/${id}`);
    if (!res.ok) return;
    const { arsredovisning } = await res.json();
    setInputs(arsredovisning.inputs);
    setRowId(arsredovisning.id);
  };

  const field = (path, type = "text") => ({
    value: getPath(inputs, path) ?? "",
    onChange: (e) => setInputs((cur) => setPath(cur, path, e.target.value)),
    style: S.input,
    type,
  });
  const numField = (yearKey, path) => ({
    value: getPath(inputs[yearKey], path) ?? 0,
    onChange: (e) => {
      const v = parseInt(String(e.target.value).replace(/[^\d-]/g, ""), 10);
      setInputs((cur) => ({ ...cur, [yearKey]: setPath(cur[yearKey], path, Number.isNaN(v) ? 0 : v) }));
    },
    style: S.numInput,
    inputMode: "numeric",
  });

  const yearTable = (title, fields) => (
    <div style={S.card}>
      <div style={S.cardTitle}>{title}</div>
      <div style={S.row}>
        <span />
        <span style={S.colHead}>I år</span>
        <span style={S.colHead}>Föregående år</span>
      </div>
      {fields.map(([label, path]) => (
        <div key={path} style={S.row}>
          <span style={S.rowLabel}>{label}</span>
          <input {...numField("currentYear", path)} />
          <input {...numField("previousYear", path)} />
        </div>
      ))}
    </div>
  );

  const d = preview?.derived?.current;
  const balanced = preview?.ok;

  return (
    <div style={S.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={S.h1}><Scale size={22} color={colors.accent} /> Årsredovisning</h1>
          <div style={S.sub}>
            K2 iXBRL-generator — Bolagsverket-valid digital årsredovisning. Framtida creator-förmån: gratis för creators med AB.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={S.btn("ghost")} onClick={() => { setInputs(EMPTY_INPUTS()); setRowId(null); }}>
            <Plus size={14} /> Ny
          </button>
          <button style={S.btn("ghost")} onClick={() => { setInputs(structuredClone(KAIJAS_EXAMPLE)); setRowId(null); }}>
            <FolderOpen size={14} /> Ladda exempel
          </button>
        </div>
      </div>

      {saved.length > 0 && (
        <div style={{ ...S.card, marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ ...S.cardTitle, marginBottom: 0 }}>Sparade</span>
          {saved.map((r) => (
            <button key={r.id} style={{ ...S.btn("ghost"), padding: "4px 10px", fontSize: 12, ...(r.id === rowId && { borderColor: colors.accent, color: colors.accent }) }} onClick={() => loadRow(r.id)}>
              {r.company_name || r.orgnr} · {String(r.fiscal_year_end).slice(0, 4)}
              <span style={{ fontSize: 10, color: r.status === "generated" ? "#16a34a" : colors.textMuted }}>{r.status}</span>
            </button>
          ))}
        </div>
      )}

      <div style={S.layout}>
        {/* ── Left: the form ─────────────────────────────────────────── */}
        <div>
          <div style={S.card}>
            <div style={S.cardTitle}>Företag & räkenskapsår</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input placeholder="Företagsnamn" {...field("company.name")} />
              <input placeholder="Org.nr (123456-1234)" {...field("company.orgnr")} />
              <input title="Räkenskapsårets första dag" {...field("fiscalYear.start", "date")} />
              <input title="Räkenskapsårets sista dag" {...field("fiscalYear.end", "date")} />
            </div>
          </div>

          {yearTable("Resultaträkning — belopp i kr (kostnader som positiva tal)", RR_FIELDS)}
          {yearTable("Balansräkning", BR_FIELDS)}
          {yearTable("Eget kapital", EK_FIELDS)}

          <div style={S.card}>
            <div style={S.cardTitle}>Förvaltningsberättelse & noter</div>
            <textarea rows={3} placeholder="Allmänt om verksamheten (obligatorisk)" {...field("texts.verksamheten")} style={{ ...S.input, resize: "vertical", marginBottom: 8 }} />
            <textarea rows={2} placeholder="Väsentliga händelser under räkenskapsåret (valfri)" {...field("texts.vasentligaHandelser")} style={{ ...S.input, resize: "vertical", marginBottom: 8 }} />
            <textarea rows={2} placeholder="Not: Övriga upplysningar (valfri)" {...field("texts.ovrigaUpplysningar")} style={{ ...S.input, resize: "vertical", marginBottom: 8 }} />
            <textarea rows={2} placeholder="Not: Väsentliga händelser efter räkenskapsårets slut (valfri)" {...field("texts.handelserEfterAret")} style={{ ...S.input, resize: "vertical" }} />
          </div>

          <div style={S.card}>
            <div style={S.cardTitle}>Stämma & underskrift</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input title="Datum för årsstämma" {...field("stamma.date", "date")} />
              <input title="Datum för undertecknande" {...field("signature.date", "date")} />
              <input placeholder="Tilltalsnamn" {...field("signature.firstName")} />
              <input placeholder="Efternamn" {...field("signature.lastName")} />
              <input placeholder="Roll (t.ex. Verkställande direktör)" {...field("signature.role")} />
              <input placeholder="Ort" {...field("signature.city")} />
            </div>
          </div>
        </div>

        {/* ── Right: live status + preview + actions ─────────────────── */}
        <div style={{ position: "sticky", top: 16 }}>
          <div style={{ ...S.card, borderColor: balanced ? "#bbf7d0" : preview ? "#fecaca" : undefined }}>
            <div style={S.cardTitle}>Kontroll</div>
            {!preview && <div style={{ fontSize: 13, color: colors.textMuted }}>Fyll i org.nr för live-kontroll…</div>}
            {preview && balanced && (
              <div style={{ fontSize: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#16a34a", fontWeight: 700, marginBottom: 8 }}>
                  <CheckCircle2 size={16} /> Balanserar — dokumentet kan genereras
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "2px 16px", fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: colors.textMuted }}>Årets resultat</span><span style={{ textAlign: "right" }}>{kr(d?.aretsResultat)}</span>
                  <span style={{ color: colors.textMuted }}>Eget kapital</span><span style={{ textAlign: "right" }}>{kr(d?.egetKapital)}</span>
                  <span style={{ color: colors.textMuted }}>Balansomslutning</span><span style={{ textAlign: "right" }}>{kr(d?.tillgangar)}</span>
                  <span style={{ color: colors.textMuted }}>Soliditet</span><span style={{ textAlign: "right" }}>{d?.soliditet != null ? `${String(d.soliditet).replace(".", ",")} %` : "–"}</span>
                </div>
                {d && d.egetKapital < (getPath(inputs, "currentYear.br.aktiekapital") || 0) / 2 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 10, color: "#b45309", fontSize: 12 }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    Eget kapital under halva aktiekapitalet — kontrollbalansräkning enligt ABL 25:13 kan krävas.
                  </div>
                )}
              </div>
            )}
            {preview && !balanced && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#dc2626" }}>
                {(preview.errors || []).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <button style={S.btn("ghost")} disabled={busy} onClick={save}><Save size={14} /> Spara utkast</button>
            <button style={balanced && !busy ? S.btn("primary") : S.btn("disabled")} disabled={!balanced || busy} onClick={generateAndDownload}>
              <Download size={14} /> Generera & ladda ner iXBRL
            </button>
            <button style={S.btn("disabled")} disabled title="Digital inlämning aktiveras när PullUps Bolagsverket-avtal och klientcertifikat är på plats.">
              <Send size={14} /> Skicka in digitalt — väntar på Bolagsverket-avtal
            </button>
          </div>
          {notice && (
            <div style={{ ...S.card, padding: 10, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
              <FileCheck size={15} color={colors.secondary} /> {notice}
            </div>
          )}

          {preview?.xhtml && (
            <div style={{ ...S.card, padding: 8 }}>
              <div style={{ ...S.cardTitle, padding: "4px 8px" }}>Förhandsgranskning — exakt det dokument som lämnas in</div>
              <iframe
                title="Förhandsgranskning årsredovisning"
                srcDoc={preview.xhtml}
                sandbox=""
                style={{ width: "100%", height: 560, border: "1px solid #eee", borderRadius: 8, background: "#fff" }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
