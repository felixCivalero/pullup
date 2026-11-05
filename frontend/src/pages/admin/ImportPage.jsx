import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileUp } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { useCurrentBrand } from "../../lib/brand.js";
import { useLang } from "../../components/agency/i18n.js";
import { BrandKicker } from "../../components/admin/ByBrand.jsx";
import { DPA, DPA_VERSION } from "../../components/admin/dpaText.js";
import { AdminShell } from "./AdminShell.jsx";
import { EVENT_ADMIN_CSS } from "./eventAdminCss.js";

/* /admin/people/import — a brand brings its own contacts into the CRM (an old
   newsletter list, a customer register): first the data processing
   agreement, then the file (CSV, from Excel, Mailchimp, anywhere), which
   column is which, whether they said yes to mail from this brand and where
   that yes comes from. Consent stays per brand (backend repos/imports.js). */

export function ImportPage() {
  return (
    <AdminShell title="Importera kontakter">
      <Importer />
    </AdminShell>
  );
}

// A CSV as text → rows of cells. Quotes, doubled quotes, newlines in quotes;
// the delimiter is whichever of , ; or tab the first line uses most.
function parseCsv(text) {
  const src = text.replace(/^\uFEFF/, "");
  const first = src.split(/\r?\n/, 1)[0] || "";
  const delim = [",", ";", "\t"].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const FIELDS = [
  ["email", "E-post", /^(e-?post|e-?mail|mail|email address|e-postadress|epostadress)$/i],
  ["name", "Namn", /^(namn|name|full ?name|fullständigt namn|förnamn|first ?name)$/i],
  ["lastName", "Efternamn", /^(efternamn|last ?name|surname)$/i],
  ["phone", "Telefon", /^(telefon|telefonnummer|mobil|mobilnummer|phone|mobile|tel)$/i],
  ["instagram", "Instagram", /^(instagram|ig|insta)$/i],
  ["consent", "Samtycke", /^(samtycke|consent|marketing|nyhetsbrev|newsletter|opt-?in|subscribed|prenumerant)$/i],
];

function Importer() {
  const brand = useCurrentBrand();
  const lang = useLang();
  const dpa = DPA[lang] || DPA.sv;
  // A main brand imports into itself (a yes to it) or into a brand under it.
  const under = brand?.under?.length ? [{ id: brand.id, name: brand.name }, ...brand.under] : [];
  const [target, setTarget] = useState(under[0]?.id || "");
  const [accepted, setAccepted] = useState(false);
  const [file, setFile] = useState(null); // { name, rows: string[][] }
  const [hasHeader, setHasHeader] = useState(true);
  const [map, setMap] = useState({});
  const [consentMode, setConsentMode] = useState("all"); // all | column | none
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [history, setHistory] = useState([]);
  const inputRef = useRef(null);
  const intoName = under.length ? under.find((b) => b.id === target)?.name : brand?.name;

  const loadHistory = () => authenticatedFetch("/admin/imports").then((r) => (r.ok ? r.json() : { imports: [] })).then((d) => setHistory(d.imports || [])).catch(() => {});
  useEffect(() => { loadHistory(); }, []);

  const head = file && hasHeader ? file.rows[0] : null;
  const width = file ? Math.max(...file.rows.slice(0, 50).map((r) => r.length)) : 0;
  const body = useMemo(() => (file ? (hasHeader ? file.rows.slice(1) : file.rows) : []), [file, hasHeader]);

  const read = async (f) => {
    if (!f) return;
    setError("");
    setDone(null);
    if (!/\.(csv|txt|tsv)$/i.test(f.name) && !/csv|text/.test(f.type)) { setError("Spara listan som CSV först (i Excel: Arkiv → Spara som → CSV)."); return; }
    const rows = parseCsv(await f.text());
    if (rows.length < 1) { setError("Filen är tom."); return; }
    setFile({ name: f.name, rows });
    // Guess which column is which from the header.
    const guess = {};
    (rows[0] || []).forEach((h, i) => { for (const [k, , re] of FIELDS) if (guess[k] == null && re.test(String(h).trim())) guess[k] = i; });
    if (guess.email == null) {
      const i = (rows[1] || rows[0] || []).findIndex((c) => /@/.test(c));
      if (i >= 0) guess.email = i;
    }
    setMap(guess);
    setConsentMode(guess.consent != null ? "column" : "all");
  };

  const prepared = useMemo(() => body.map((r) => ({
    email: map.email != null ? r[map.email] : "",
    name: [map.name != null ? r[map.name] : "", map.lastName != null ? r[map.lastName] : ""].filter(Boolean).join(" ").trim(),
    phone: map.phone != null ? r[map.phone] : "",
    instagram: map.instagram != null ? r[map.instagram] : "",
    consent: consentMode === "column" && map.consent != null ? r[map.consent] : false,
  })), [body, map, consentMode]);
  const withEmail = prepared.filter((r) => /\S+@\S+\.\S+/.test(r.email || "")).length;

  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await authenticatedFetch("/admin/imports", {
        method: "POST",
        body: JSON.stringify({ brand: under.length ? target : undefined, source, fileName: file.name, dpaAccepted: DPA_VERSION, allConsent: consentMode === "all", rows: prepared.map((r) => ({ ...r, consent: consentMode === "none" ? false : r.consent })) }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.message || out.error);
      setDone(out);
      setFile(null);
      loadHistory();
    } catch (e) {
      setError(e.message || "Importen misslyckades.");
    } finally {
      setBusy(false);
    }
  };

  const ready = accepted && file && map.email != null && source.trim().length > 1 && withEmail > 0 && (!under.length || target);

  return (
    <>
      <style>{EVENT_ADMIN_CSS + IMPORT_CSS}</style>
      <div className="ea im">
        <Link to="/admin/people" className="ed-back"><ArrowLeft size={16} /> CRM</Link>
        <div className="ea-head"><div><BrandKicker /><h1>Importera kontakter</h1>
          <p className="ea-muted">Ta in era egna kontakter, till exempel en nyhetsbrevslista eller ett kundregister. Samtycket till mejl gäller varumärket de importeras till.</p></div></div>

        <section className="im-step">
          <h2><span>1</span> Avtalet</h2>
          <div className="im-dpa" data-no-translate>
            <b>{dpa.title}</b>
            <small>{dpa.note}</small>
            {dpa.sections.map(([h, p]) => <div key={h}><h4>{h}</h4><p>{p}</p></div>)}
          </div>
          <label className="im-check"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /> <span data-no-translate>{dpa.accept(brand?.parent?.name || brand?.name || "organisationen")}</span></label>
        </section>

        <section className={`im-step${accepted ? "" : " is-off"}`}>
          <h2><span>2</span> Listan</h2>
          {under.length > 0 && (
            <label className="im-row"><span>Till varumärke</span>
              <select className="ea-input" value={target} onChange={(e) => setTarget(e.target.value)}>{under.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </label>
          )}
          <div className="im-drop" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); read(e.dataTransfer.files?.[0]); }}>
            <FileUp size={20} />
            <b>{file ? file.name : "Välj eller släpp en CSV-fil"}</b>
            <span>{file ? `${body.length} rader` : "Från Excel, Google Sheets, Mailchimp eller annat. En rad per person."}</span>
            <input ref={inputRef} type="file" hidden accept=".csv,.txt,.tsv,text/csv" onChange={(e) => { read(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          {file && (
            <>
              <label className="im-check"><input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} /> <span>Första raden är rubriker</span></label>
              <div className="im-map">
                {FIELDS.map(([k, label]) => (k === "consent" && consentMode !== "column" ? null : (
                  <label key={k} className="im-row"><span>{label}{k === "email" ? " *" : ""}</span>
                    <select className="ea-input" value={map[k] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [k]: e.target.value === "" ? undefined : Number(e.target.value) }))}>
                      <option value="">—</option>
                      {Array.from({ length: width }, (_, i) => <option key={i} value={i}>{head ? head[i] || `Kolumn ${i + 1}` : `Kolumn ${i + 1}`}</option>)}
                    </select>
                  </label>
                )))}
              </div>
              <div className="ea-wrap im-preview">
                <table className="ea-table">
                  <thead><tr><th>E-post</th><th>Namn</th><th>Telefon</th><th>Instagram</th>{consentMode === "column" && <th>Samtycke</th>}</tr></thead>
                  <tbody>{prepared.slice(0, 5).map((r, i) => <tr key={i}><td>{r.email || "–"}</td><td>{r.name || "–"}</td><td>{r.phone || "–"}</td><td>{r.instagram || "–"}</td>{consentMode === "column" && <td>{String(r.consent || "–")}</td>}</tr>)}</tbody>
                </table>
              </div>
              <p className="ea-muted">{withEmail} av {body.length} rader har en e-postadress.</p>
            </>
          )}
        </section>

        <section className={`im-step${accepted && file ? "" : " is-off"}`}>
          <h2><span>3</span> Samtycke</h2>
          <div className="im-radios">
            <label><input type="radio" checked={consentMode === "all"} onChange={() => setConsentMode("all")} /> <span>Alla på listan har sagt ja till mejl från {intoName}</span></label>
            <label><input type="radio" checked={consentMode === "column"} onChange={() => setConsentMode("column")} /> <span>Det står i en kolumn vilka som sagt ja</span></label>
            <label><input type="radio" checked={consentMode === "none"} onChange={() => setConsentMode("none")} /> <span>Ingen har sagt ja än: bara till CRM:et, inga utskick</span></label>
          </div>
          <label className="im-row is-wide"><span>Varifrån kommer listan, och hur sa de ja? *</span>
            <input className="ea-input" maxLength={200} value={source} onChange={(e) => setSource(e.target.value)} placeholder="t.ex. Nyhetsbrevet i Mailchimp, anmälan via hemsidan 2021–2025" />
          </label>
          <p className="ea-muted">Sparas med varje kontakt. Den som avregistrerat sig får aldrig mejl, oavsett vad listan säger.</p>
          {error && <p className="ea-error">{error}</p>}
          <button type="button" className="ea-btn is-dark" disabled={!ready || busy} onClick={go}>{busy ? "Importerar…" : `Importera ${withEmail || ""} kontakter`}</button>
        </section>

        {done && (
          <section className="im-done">
            <b>Klart. {done.added} nya kontakter i {done.brand.name}.</b>
            <p>{done.matched} fanns redan · {done.consented} godkänner mejlutskick · {done.skipped} hoppades över (saknar giltig e-post eller fanns två gånger).</p>
            <Link to="/admin/people" className="ea-btn">Till CRM:et →</Link>
          </section>
        )}

        {history.length > 0 && (
          <section className="im-step">
            <h2>Tidigare importer</h2>
            <div className="ea-wrap"><table className="ea-table">
              <thead><tr><th>När</th><th>Källa</th><th className="num">Nya</th><th className="num">Godkänner mejl</th><th>Avtal</th></tr></thead>
              <tbody>{history.map((h) => <tr key={h.id}><td>{new Date(h.created_at).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" })}</td><td>{h.source}{h.file_name ? <span className="ea-muted"> · {h.file_name}</span> : null}</td><td className="num">{h.rows_added}</td><td className="num">{h.rows_consented}</td><td className="ea-muted">{h.dpa_version}</td></tr>)}</tbody>
            </table></div>
          </section>
        )}
      </div>
    </>
  );
}

const IMPORT_CSS = `
  .im { max-width: 880px; }
  .im .ed-back { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 600; color: #6e6e73; text-decoration: none; margin-bottom: 14px; }
  .im-step { margin: 0 0 26px; }
  .im-step.is-off { opacity: .4; pointer-events: none; }
  .im-step h2 { display: flex; align-items: center; gap: 10px; }
  .im-step h2 span { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 6px; background: #0d0d0d; color: #f2f1ec; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; }
  .im-dpa { max-height: 300px; overflow-y: auto; padding: 16px 18px; border: 1px solid #9b9a95; border-radius: 8px; background: #fff; box-shadow: inset 0 2px 4px rgba(0,0,0,.05); font-size: 13.5px; line-height: 1.55; }
  .im-dpa > b { display: block; font-size: 16px; }
  .im-dpa > small { display: block; margin: 2px 0 12px; color: #8a8a8e; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; }
  .im-dpa h4 { margin: 12px 0 2px; font-size: 13.5px; }
  .im-dpa p { margin: 0; color: #3a3a3c; }
  .im-check { display: flex; align-items: flex-start; gap: 9px; margin: 12px 0 0; font-size: 14px; cursor: pointer; }
  .im-check input { margin-top: 3px; accent-color: #ec178f; }
  .im-drop { display: grid; justify-items: center; gap: 5px; padding: 24px 16px; border: 1.5px dashed #9b9a95; border-radius: 10px; background: #fff; text-align: center; cursor: pointer; }
  .im-drop:hover { border-color: #ec178f; }
  .im-drop span { font-size: 13px; color: #6e6e73; }
  .im-map { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px 14px; margin: 14px 0; }
  .im-row { display: grid; gap: 5px; font-size: 12.5px; font-weight: 600; color: #4a4945; margin: 0 0 10px; }
  .im-row.is-wide { margin-top: 14px; }
  .im-preview { margin: 6px 0 8px; }
  .im-radios { display: grid; gap: 8px; margin: 0 0 6px; }
  .im-radios label { display: flex; gap: 9px; align-items: flex-start; font-size: 14.5px; cursor: pointer; padding: 10px 12px; border: 1px solid #d9d8d3; border-radius: 8px; background: #fff; }
  .im-radios input { margin-top: 3px; accent-color: #ec178f; }
  .im-done { margin: 0 0 26px; padding: 16px 18px; border: 1px solid #1f7a3a; border-radius: 8px; background: #f0faf3; display: grid; gap: 6px; justify-items: start; }
  .im-done p { margin: 0; font-size: 14px; color: #3a3a3c; }
`;
