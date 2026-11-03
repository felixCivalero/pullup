import { Lock, Plus, X } from "lucide-react";

/* What the sign-up asks (backend lib/eventForm.js), read like the form the
   guest will see: a table of fields, one row each — name and email always
   (locked), phone and Instagram (off / optional / required), the guests they
   may bring, and the organiser's own questions: free text, free answer, each
   optional or required. Above it: how many fit. Used in the new-event wizard
   and the editor's 01 Praktiskt. form: { phone, instagram, plusOnes, questions }. */

const EMPTY_FORM = { phone: "off", instagram: "off", plusOnes: 0, questions: [] };
const READY = ["Allergier eller specialkost?", "Företag", "Hur hittade du hit?"];
const LEVELS = [["off", "Av"], ["optional", "Valfritt"], ["required", "Krävs"]];
const qid = () => `q_${Math.random().toString(16).slice(2, 10)}`;

function Seg({ options, value, onChange, label }) {
  return (
    <div className="fb-seg" role="radiogroup" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? "is-on" : ""} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

function Locked() {
  return <div className="fb-seg is-locked" title="Frågas alltid"><Lock size={12} /> Krävs</div>;
}

export function FormBuilder({ form: raw, onChange, capacity, onCapacity }) {
  const form = { ...EMPTY_FORM, ...(raw || {}) };
  const set = (patch) => onChange({ ...form, ...patch });
  const qs = form.questions || [];
  const setQ = (i, patch) => set({ questions: qs.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const add = (label = "") => set({ questions: [...qs, { id: qid(), label, type: "text", required: false }] });
  const unused = READY.filter((r) => !qs.some((q) => q.label.toLowerCase() === r.toLowerCase()));

  return (
    <div className="fb">
      <style>{FB_CSS}</style>
      <div className="fb-box">
        <div className="fb-cap">Platser</div>
        {onCapacity && (
          <div className="fb-tr">
            <span className="fb-name">Max antal<small>Tomt = obegränsat. Fullt → väntelista.</small></span>
            <input className="fb-ctl fb-in" type="number" min="1" value={capacity ?? ""} placeholder="Obegränsat" onChange={(e) => onCapacity(e.target.value === "" ? null : Number(e.target.value))} />
          </div>
        )}
        <div className="fb-tr">
          <span className="fb-name">Får ta med sig<small>Räknas som platser.</small></span>
          <select className="fb-ctl fb-in" value={form.plusOnes} onChange={(e) => set({ plusOnes: Number(e.target.value) })}>
            <option value={0}>Bara sig själv</option>
            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>Upp till {n} {n === 1 ? "gäst" : "gäster"}</option>)}
          </select>
        </div>
      </div>

      <div className="fb-box">
        <div className="fb-cap">Gästen fyller i</div>
        <div className="fb-tr is-locked"><span className="fb-name">Namn</span><div className="fb-ctl"><Locked /></div></div>
        <div className="fb-tr is-locked"><span className="fb-name">E-post</span><div className="fb-ctl"><Locked /></div></div>
        <div className="fb-tr"><span className="fb-name">Telefon</span><div className="fb-ctl"><Seg label="Telefon" options={LEVELS} value={form.phone} onChange={(v) => set({ phone: v })} /></div></div>
        <div className="fb-tr"><span className="fb-name">Instagram</span><div className="fb-ctl"><Seg label="Instagram" options={LEVELS} value={form.instagram} onChange={(v) => set({ instagram: v })} /></div></div>
        {qs.map((q, i) => (
          <div key={q.id || i} className="fb-tr is-q">
            <input className="fb-name fb-in fb-qin" value={q.label} maxLength={140} placeholder="Skriv frågan, t.ex. Allergier?" onChange={(e) => setQ(i, { label: e.target.value })} autoFocus={!q.label} />
            <div className="fb-ctl">
              <Seg label={q.label || "Fråga"} options={[["optional", "Valfritt"], ["required", "Krävs"]]} value={q.required ? "required" : "optional"} onChange={(v) => setQ(i, { required: v === "required" })} />
              <button type="button" className="fb-x" aria-label="Ta bort frågan" onClick={() => set({ questions: qs.filter((_, j) => j !== i) })}><X size={14} /></button>
            </div>
          </div>
        ))}
        <div className="fb-add">
          <button type="button" className="fb-new" onClick={() => add()}><Plus size={14} /> Egen fråga</button>
          {unused.map((r) => <button key={r} type="button" className="fb-chip" onClick={() => add(r)}>+ {r}</button>)}
        </div>
      </div>
    </div>
  );
}

const FB_CSS = `
  .fb { --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace; display: grid; gap: 14px; }
  .fb-box { border: 1px solid #9b9a95; border-radius: 9px; background: #fff; overflow: hidden; box-shadow: 3px 3px 0 rgba(0,0,0,.06); }
  .fb-cap { padding: 7px 12px; background: linear-gradient(180deg, #ecebe6, #d9d8d3); border-bottom: 1px solid #9b9a95; box-shadow: inset 0 1px 0 rgba(255,255,255,.85); font-family: var(--mono); font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #3a3935; }
  .fb-tr { display: grid; grid-template-columns: minmax(0, 1fr) 236px; align-items: center; gap: 12px; padding: 9px 12px; }
  .fb-tr + .fb-tr { border-top: 1px solid #ebeae5; }
  .fb-name { display: grid; gap: 2px; font-size: 14.5px; font-weight: 600; color: #0a0a0a; min-width: 0; }
  .fb-name small { font-size: 11.5px; font-weight: 400; color: #8a8a8e; }
  .fb-tr.is-locked .fb-name { color: #6e6e73; }
  .fb-ctl { display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: 0; }
  input.fb-ctl, select.fb-ctl { width: 100%; }
  .fb-in { font: inherit; font-size: 14.5px; height: 36px; padding: 0 10px; border: 1px solid #b9b8b3; border-radius: 7px; background: #fbfaf7; color: #0a0a0a; outline: none; box-sizing: border-box; box-shadow: inset 0 2px 3px rgba(0,0,0,.07); }
  .fb-in:focus { border-color: #0a0a0a; box-shadow: inset 0 2px 3px rgba(0,0,0,.07), 0 0 0 2px rgba(236,23,143,.4); }
  .fb-qin { font-weight: 600; }
  .fb-seg { flex: 1; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; height: 36px; padding: 3px; gap: 2px; box-sizing: border-box; border: 1px solid #b9b8b3; border-radius: 7px; background: linear-gradient(180deg, #efeee9, #e1e0db); }
  .fb-seg button { font-family: var(--mono); font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; border: 0; border-radius: 5px; background: none; color: #4a4945; cursor: pointer; padding: 0 4px; }
  .fb-seg button.is-on { background: #0d0d0d; color: #f2f1ec; box-shadow: inset 0 1px 0 rgba(255,255,255,.15); }
  .fb-seg.is-locked { display: flex; align-items: center; justify-content: center; gap: 6px; font-family: var(--mono); font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #6e6e73; background: repeating-linear-gradient(135deg, #ecebe6 0 6px, #e4e3de 6px 12px); cursor: default; }
  .fb-x { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid #d9d8d3; border-radius: 7px; background: #fff; color: #6e6e73; cursor: pointer; }
  .fb-x:hover { color: #0a0a0a; border-color: #0a0a0a; }
  .fb-tr.is-q .fb-ctl .fb-seg { max-width: 194px; }
  .fb-add { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px 12px; border-top: 1px dashed #d9d8d3; background: #fbfaf7; }
  .fb-new, .fb-chip { font: inherit; display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 11px; border-radius: 6px; cursor: pointer; font-size: 12.5px; font-weight: 600; }
  .fb-new { border: 1px solid #000; background: linear-gradient(180deg, #2a2a2a, #0d0d0d); color: #f2f1ec; font-family: var(--mono); font-size: 11px; letter-spacing: .05em; text-transform: uppercase; }
  .fb-new:hover { background: linear-gradient(180deg, #f43aa5, #d90f80); color: #111; border-color: #8a0a52; }
  .fb-chip { border: 1px dashed #b9b8b3; background: #fff; color: #3a3a3c; }
  .fb-chip:hover { border-color: #ec178f; color: #0a0a0a; }
  @media (max-width: 560px) {
    .fb-tr { grid-template-columns: 1fr; gap: 7px; }
    .fb-ctl { justify-content: stretch; }
    .fb-tr.is-q .fb-ctl .fb-seg { max-width: none; }
  }
`;
