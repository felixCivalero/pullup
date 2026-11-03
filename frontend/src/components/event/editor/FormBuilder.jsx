import { ArrowUp, Plus, X } from "lucide-react";

/* What the sign-up asks (backend lib/eventForm.js): how many fit, guests
   brought along, phone and Instagram (off / optional / required), and the
   organiser's own questions — free text, one of a few options, or a yes box.
   Ready-made questions are one tap away. Used in the new-event wizard and in
   the editor's Anmälan tab. form: { phone, instagram, plusOnes, questions }. */

const EMPTY_FORM = { phone: "off", instagram: "off", plusOnes: 0, questions: [] };

const READY = [
  { label: "Allergier eller specialkost?", type: "text" },
  { label: "Kost", type: "choice", options: ["Äter allt", "Vegetarisk", "Vegansk"] },
  { label: "Företag", type: "text" },
  { label: "Hur hittade du hit?", type: "choice", options: ["Instagram", "En vän", "Nyhetsbrev", "Annat"] },
  { label: "Får vi fota dig under kvällen?", type: "check" },
];
const LEVELS = [["off", "Av"], ["optional", "Valfritt"], ["required", "Krävs"]];
const TYPES = [["text", "Fritext"], ["choice", "Flerval"], ["check", "Kryssruta"]];
const qid = () => `q_${Math.random().toString(16).slice(2, 10)}`;

function Levels({ value, onChange, label }) {
  return (
    <div className="fb-row">
      <span className="fb-label">{label}</span>
      <div className="fb-seg" role="radiogroup" aria-label={label}>
        {LEVELS.map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? "is-on" : ""} onClick={() => onChange(k)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export function FormBuilder({ form: raw, onChange, capacity, onCapacity }) {
  const form = { ...EMPTY_FORM, ...(raw || {}) };
  const set = (patch) => onChange({ ...form, ...patch });
  const qs = form.questions || [];
  const setQ = (i, patch) => set({ questions: qs.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const add = (q) => set({ questions: [...qs, { id: qid(), required: false, ...q }] });
  const unused = READY.filter((r) => !qs.some((q) => q.label.toLowerCase() === r.label.toLowerCase()));

  return (
    <div className="fb">
      <style>{FB_CSS}</style>
      {onCapacity && (
        <div className="fb-row">
          <span className="fb-label">Max antal</span>
          <input className="fb-num" type="number" min="1" value={capacity ?? ""} placeholder="Obegränsat" onChange={(e) => onCapacity(e.target.value === "" ? null : Number(e.target.value))} />
        </div>
      )}
      <div className="fb-row">
        <span className="fb-label">Får ta med sig</span>
        <select className="fb-sel" value={form.plusOnes} onChange={(e) => set({ plusOnes: Number(e.target.value) })}>
          <option value={0}>Bara sig själv</option>
          {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>Upp till {n} {n === 1 ? "gäst" : "gäster"}</option>)}
        </select>
      </div>
      <Levels label="Telefon" value={form.phone} onChange={(v) => set({ phone: v })} />
      <Levels label="Instagram" value={form.instagram} onChange={(v) => set({ instagram: v })} />

      <div className="fb-qhead">
        <span className="fb-label">Egna frågor</span>
        <small>Namn och e-post frågas alltid.</small>
      </div>
      {qs.map((q, i) => (
        <div key={q.id || i} className="fb-q">
          <div className="fb-qtop">
            <input className="fb-in" value={q.label} maxLength={140} placeholder="Frågan, t.ex. Allergier?" onChange={(e) => setQ(i, { label: e.target.value })} />
            {i > 0 && <button type="button" className="fb-icon" aria-label="Flytta upp" onClick={() => { const n = [...qs]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set({ questions: n }); }}><ArrowUp size={14} /></button>}
            <button type="button" className="fb-icon" aria-label="Ta bort frågan" onClick={() => set({ questions: qs.filter((_, j) => j !== i) })}><X size={14} /></button>
          </div>
          <div className="fb-qbar">
            <div className="fb-seg is-small">
              {TYPES.map(([k, l]) => (
                <button key={k} type="button" className={q.type === k ? "is-on" : ""} onClick={() => setQ(i, { type: k, ...(k === "choice" && !(q.options || []).length ? { options: ["", ""] } : {}) })}>{l}</button>
              ))}
            </div>
            <label className="fb-req"><input type="checkbox" checked={!!q.required} onChange={(e) => setQ(i, { required: e.target.checked })} /> {q.type === "check" ? "Måste kryssas" : "Obligatorisk"}</label>
          </div>
          {q.type === "choice" && (
            <textarea
              className="fb-in fb-opts"
              rows={Math.max(2, (q.options || []).length)}
              value={(q.options || []).join("\n")}
              placeholder={"Ett alternativ per rad\nVegetarisk\nVegansk"}
              onChange={(e) => setQ(i, { options: e.target.value.split("\n").slice(0, 12) })}
            />
          )}
        </div>
      ))}
      <div className="fb-add">
        <button type="button" className="fb-new" onClick={() => add({ label: "", type: "text" })}><Plus size={14} /> Egen fråga</button>
        {unused.map((r) => (
          <button key={r.label} type="button" className="fb-chip" onClick={() => add(r)}>+ {r.label}</button>
        ))}
      </div>
    </div>
  );
}

const FB_CSS = `
  .fb { display: grid; gap: 12px; }
  .fb-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .fb-label { font-size: 13.5px; font-weight: 600; color: #3a3a3c; }
  .fb-num, .fb-sel, .fb-in { font: inherit; font-size: 14.5px; padding: 9px 11px; border: 1px solid #c9c8c3; border-radius: 8px; background: #fbfaf7; color: #0a0a0a; outline: none; box-sizing: border-box; box-shadow: inset 0 1px 2px rgba(0,0,0,.06); }
  .fb-num { width: 140px; }
  .fb-sel { min-width: 180px; }
  .fb-num:focus, .fb-sel:focus, .fb-in:focus { border-color: #0a0a0a; box-shadow: inset 0 1px 2px rgba(0,0,0,.06), 0 0 0 2px rgba(236,23,143,.35); }
  .fb-seg { display: inline-flex; padding: 3px; gap: 2px; border: 1px solid #b9b8b3; border-radius: 8px; background: linear-gradient(180deg, #efeee9, #e1e0db); }
  .fb-seg button { font: inherit; font-size: 12.5px; font-weight: 600; padding: 5px 11px; border: 0; border-radius: 6px; background: none; color: #3a3a3c; cursor: pointer; }
  .fb-seg button.is-on { background: #0a0a0a; color: #fff; }
  .fb-seg.is-small button { font-size: 12px; padding: 4px 9px; }
  .fb-qhead { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-top: 6px; padding-top: 12px; border-top: 1px dashed #d9d8d3; }
  .fb-qhead small { font-size: 12px; color: #8a8a8e; }
  .fb-q { display: grid; gap: 8px; padding: 10px; border: 1px solid #d9d8d3; border-radius: 10px; background: #fff; box-shadow: 2px 2px 0 rgba(0,0,0,.05); }
  .fb-qtop { display: flex; gap: 6px; align-items: center; }
  .fb-qtop .fb-in { flex: 1; min-width: 0; font-weight: 600; }
  .fb-icon { display: grid; place-items: center; width: 30px; height: 30px; flex: none; border: 1px solid #d9d8d3; border-radius: 7px; background: #fff; color: #6e6e73; cursor: pointer; }
  .fb-icon:hover { color: #0a0a0a; border-color: #0a0a0a; }
  .fb-qbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .fb-req { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: #3a3a3c; cursor: pointer; }
  .fb-req input { accent-color: #ec178f; }
  .fb-opts { width: 100%; resize: vertical; line-height: 1.5; }
  .fb-add { display: flex; flex-wrap: wrap; gap: 6px; }
  .fb-new, .fb-chip { font: inherit; display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; padding: 6px 11px; border-radius: 999px; cursor: pointer; }
  .fb-new { border: 1px solid #0a0a0a; background: #0a0a0a; color: #fff; }
  .fb-chip { border: 1px dashed #b9b8b3; background: #fff; color: #3a3a3c; }
  .fb-chip:hover { border-color: #ec178f; color: #0a0a0a; }
`;
