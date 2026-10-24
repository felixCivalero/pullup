import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, MapPin, Sparkles, Type, Users, X } from "lucide-react";
import { fromZonedInput } from "../../../lib/zonedTime.js";
import { colors } from "./editorStyles.js";

/* The basics, one question at a time (the old app's CreateWizard): name,
   when, where, how many. Every step but the name can be skipped. "Start
   designing" creates the event (a draft) and opens the editor, where the page
   itself is designed. */
const STEPS = [
  { key: "name", icon: Type, eyebrow: "Grunderna", q: "Vad heter eventet?" },
  { key: "when", icon: CalendarDays, eyebrow: "Grunderna", q: "När är det?" },
  { key: "where", icon: MapPin, eyebrow: "Grunderna", q: "Var är det?" },
  { key: "who", icon: Users, eyebrow: "Anmälan", q: "Hur många får plats?" },
];

export function BasicsWizard({ onDone, onCancel, busy = false, error = "" }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ title: "", start: "", end: "", location: "", capacity: "" });
  const firstRef = useRef(null);
  useEffect(() => { if (step === 0) firstRef.current?.focus(); }, [step]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const cur = STEPS[step];
  const last = step === STEPS.length - 1;
  const canNext = step === 0 ? !!f.title.trim() : step === 1 ? !!f.start : true;

  const next = () => {
    if (!canNext || busy) return;
    if (!last) { setStep(step + 1); return; }
    onDone({
      title: f.title.trim(),
      startsAt: fromZonedInput(f.start),
      endsAt: f.end ? fromZonedInput(f.end) : null,
      location: f.location.trim(),
      capacity: f.capacity ? Number(f.capacity) : null,
    });
  };

  return (
    <div className="bw-bg">
      <style>{CSS}</style>
      <form className="bw" onSubmit={(e) => { e.preventDefault(); next(); }}>
        <button type="button" className="bw-close" onClick={onCancel} aria-label="Avbryt"><X size={18} /></button>
        <div className="bw-dots">{STEPS.map((s, i) => <i key={s.key} className={i <= step ? "is-on" : ""} />)}</div>
        <p className="bw-eyebrow"><cur.icon size={14} /> {cur.eyebrow}</p>
        <h2>{cur.q}</h2>

        {cur.key === "name" && <input ref={firstRef} className="bw-input" value={f.title} onChange={set("title")} placeholder="Release party, middag, listening session…" />}
        {cur.key === "when" && (
          <div className="bw-two">
            <label><span>Startar</span><input className="bw-input" type="datetime-local" value={f.start} onChange={set("start")} /></label>
            <label><span>Slutar (valfritt)</span><input className="bw-input" type="datetime-local" value={f.end} onChange={set("end")} /></label>
          </div>
        )}
        {cur.key === "where" && <input className="bw-input" value={f.location} onChange={set("location")} placeholder="Adress eller ställe. Kan avslöjas senare." autoFocus />}
        {cur.key === "who" && (
          <>
            <input className="bw-input" type="number" min="1" value={f.capacity} onChange={set("capacity")} placeholder="Obegränsat" autoFocus />
            <p className="bw-hint">Gästerna anmäler sig med namn och e-post. När det är fullt hamnar nya på väntelistan.</p>
          </>
        )}
        {error && <p className="bw-error">{error}</p>}

        <div className="bw-foot">
          <button type="button" className="bw-back" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={16} /> Tillbaka</button>
          <div style={{ display: "flex", gap: 8 }}>
            {step >= 2 && !last && <button type="button" className="bw-skip" onClick={() => setStep(step + 1)}>Hoppa över</button>}
            <button type="submit" className="bw-next" disabled={!canNext || busy}>
              {last ? (busy ? "Skapar…" : <><Sparkles size={16} /> Börja designa</>) : <>Nästa <ArrowRight size={16} /></>}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

const CSS = `
  .bw-bg { min-height: calc(100dvh - 56px); display: grid; place-items: center; padding: 24px 16px; box-sizing: border-box; background: ${colors.surfaceMuted}; }
  .bw { position: relative; width: min(520px, 100%); background: #fff; border-radius: 22px; padding: 28px 26px 22px; box-shadow: 0 20px 60px rgba(0,0,0,0.08); display: grid; gap: 14px; }
  .bw-close { position: absolute; top: 16px; right: 14px; border: 0; background: none; cursor: pointer; color: ${colors.textSubtle}; }
  .bw-dots { display: flex; gap: 6px; }
  .bw-dots i { width: 28px; height: 4px; border-radius: 999px; background: ${colors.border}; }
  .bw-dots i.is-on { background: ${colors.text}; }
  .bw-eyebrow { margin: 6px 0 0; display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${colors.secondary}; }
  .bw h2 { margin: 0; font-size: clamp(24px, 5vw, 30px); letter-spacing: -0.03em; }
  .bw-input { width: 100%; box-sizing: border-box; font: inherit; font-size: 17px; padding: 14px 15px; border-radius: 12px; border: 1px solid ${colors.borderStrong}; outline: none; }
  .bw-input:focus { border-color: ${colors.text}; }
  .bw-two { display: grid; gap: 10px; }
  .bw-two label { display: grid; gap: 6px; font-size: 12px; font-weight: 600; color: ${colors.textSubtle}; }
  .bw-hint { margin: 0; font-size: 13px; color: ${colors.textSubtle}; line-height: 1.5; }
  .bw-error { margin: 0; font-size: 14px; color: ${colors.secondary}; }
  .bw-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
  .bw-back, .bw-skip { font: inherit; font-size: 13.5px; font-weight: 600; border: 0; background: none; color: ${colors.textSubtle}; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 8px 6px; }
  .bw-back:disabled { opacity: 0; cursor: default; }
  .bw-next { font: inherit; font-size: 14.5px; font-weight: 700; border: 0; border-radius: 999px; padding: 12px 20px; background: ${colors.text}; color: #fff; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
  .bw-next:disabled { opacity: 0.4; cursor: default; }
`;
