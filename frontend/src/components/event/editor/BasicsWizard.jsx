import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, MapPin, Network, Sparkles, Type, Users, X } from "lucide-react";
import { fromZonedInput } from "../../../lib/zonedTime.js";
import { colors } from "./editorStyles.js";
import { PlaceField } from "./PlaceField.jsx";
import { FormBuilder } from "./FormBuilder.jsx";

/* The basics, one question at a time (the old app's CreateWizard): name,
   when, where, how many. Every step but the name can be skipped. "Start
   designing" creates the event (a draft) and opens the editor, where the page
   itself is designed. A main brand with brands under it is first asked whose
   event it is (`brands`: the ones under it, `root`: the main brand's name,
   drawn on top as the admin it is, not a choice). */
const WHOSE = { key: "whose", icon: Network, eyebrow: "Varumärke", q: "Vems event är det?" };
const STEPS = [
  { key: "name", icon: Type, eyebrow: "Grunderna", q: "Vad heter eventet?" },
  { key: "when", icon: CalendarDays, eyebrow: "Grunderna", q: "När är det?" },
  { key: "where", icon: MapPin, eyebrow: "Grunderna", q: "Var är det?" },
  { key: "who", icon: Users, eyebrow: "Anmälan", q: "Vem kommer, och vad vill ni veta?" },
];

export function BasicsWizard({ onDone, onCancel, busy = false, error = "", brands = [], root = "", brandId = "" }) {
  const choose = brands.length > 1;
  const steps = choose ? [WHOSE, ...STEPS] : STEPS;
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ title: "", start: "", end: "", location: "", locationLat: null, locationLng: null, placeId: null, capacity: "", form: { phone: "off", instagram: "off", plusOnes: 0, questions: [] } });
  const [whose, setWhose] = useState(brandId || (brands.length === 1 ? brands[0].id : ""));
  const firstRef = useRef(null);
  const cur = steps[step];
  useEffect(() => { if (cur.key === "name") firstRef.current?.focus(); }, [cur.key]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const last = step === steps.length - 1;
  const canNext = cur.key === "whose" ? !!whose : cur.key === "name" ? !!f.title.trim() : cur.key === "when" ? !!f.start : true;
  const skippable = cur.key === "where" || cur.key === "who";
  const whoseName = brands.find((b) => b.id === whose)?.name;

  const next = () => {
    if (!canNext || busy) return;
    if (!last) { setStep(step + 1); return; }
    onDone({
      ...(brands.length && whose ? { brandId: whose } : {}),
      title: f.title.trim(),
      startsAt: fromZonedInput(f.start),
      endsAt: f.end ? fromZonedInput(f.end) : null,
      location: f.location.trim(),
      locationLat: f.locationLat,
      locationLng: f.locationLng,
      placeId: f.placeId,
      capacity: f.capacity ? Number(f.capacity) : null,
      form: f.form,
    });
  };

  return (
    <div className="bw-bg">
      <style>{CSS}</style>
      <form
        className={`bw${cur.key === "who" ? " is-wide" : ""}`}
        onSubmit={(e) => { e.preventDefault(); next(); }}
        // Enter while writing a question doesn't create the event.
        onKeyDown={(e) => { if (e.key === "Enter" && cur.key === "who" && e.target.tagName === "INPUT") e.preventDefault(); }}
      >
        <button type="button" className="bw-close" onClick={onCancel} aria-label="Avbryt"><X size={18} /></button>
        <div className="bw-dots">{steps.map((s, i) => <i key={s.key} className={i <= step ? "is-on" : ""} />)}</div>
        <p className="bw-eyebrow"><cur.icon size={14} /> {cur.eyebrow}{brands.length > 0 && cur.key !== "whose" && whoseName ? <span className="bw-for">· {whoseName}</span> : null}</p>
        <h2>{cur.q}</h2>

        {cur.key === "whose" && (
          // The umbrella, as in the onboarding: the main brand on top, the
          // brands under it hanging below. A tap picks and moves on.
          <div className="bw-tree">
            {root && (
              <div className="bw-node is-main is-root">
                <span className="bw-node-name">{root}</span>
                <span className="bw-node-sub">Huvudkonto · admin</span>
              </div>
            )}
            {brands.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`bw-node is-under${whose === b.id ? " is-on" : ""}`}
                onClick={() => { setWhose(b.id); setStep(step + 1); }}
              >
                <span className="bw-node-name">{b.name}</span>
                <span className="bw-node-sub">{root ? `Under ${root}` : "Varumärke"}</span>
                {whose === b.id && <Check size={16} className="bw-node-check" />}
              </button>
            ))}
          </div>
        )}

        {cur.key === "name" && <input ref={firstRef} className="bw-input" value={f.title} onChange={set("title")} placeholder="Release party, middag, listening session…" />}
        {cur.key === "when" && (
          <div className="bw-two">
            <label><span>Startar</span><input className="bw-input" type="datetime-local" value={f.start} onChange={set("start")} /></label>
            <label><span>Slutar (valfritt)</span><input className="bw-input" type="datetime-local" value={f.end} onChange={set("end")} /></label>
          </div>
        )}
        {cur.key === "where" && (
          <PlaceField
            value={f}
            onChange={(p) => setF((x) => ({ ...x, ...p }))}
            inputClassName="bw-input"
            placeholder="Sök adress eller ställe. Kan avslöjas senare."
            autoFocus
          />
        )}
        {cur.key === "who" && (
          <>
            <FormBuilder
              form={f.form}
              onChange={(form) => setF((x) => ({ ...x, form }))}
              capacity={f.capacity === "" ? null : Number(f.capacity)}
              onCapacity={(v) => setF((x) => ({ ...x, capacity: v == null ? "" : String(v) }))}
            />
            <p className="bw-hint">Gästerna anmäler sig alltid med namn och e-post. När det är fullt hamnar nya på väntelistan, och de som tas med räknas som platser.</p>
          </>
        )}
        {error && <p className="bw-error">{error}</p>}

        <div className="bw-foot">
          <button type="button" className="bw-back" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={16} /> Tillbaka</button>
          <div style={{ display: "flex", gap: 8 }}>
            {skippable && !last && <button type="button" className="bw-skip" onClick={() => setStep(step + 1)}>Hoppa över</button>}
            <button type="submit" className="bw-next" disabled={!canNext || busy}>
              {last ? (busy ? "Skapar…" : <><Sparkles size={16} /> Vidare till design</>) : <>Nästa <ArrowRight size={16} /></>}
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
  .bw.is-wide { width: min(640px, 100%); }
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
  .bw-for { text-transform: none; letter-spacing: 0; font-weight: 600; color: ${colors.textSubtle}; margin-left: 2px; }
  .bw-tree { display: grid; gap: 8px; position: relative; }
  .bw-node { font: inherit; position: relative; display: grid; gap: 2px; text-align: left; padding: 13px 44px 13px 16px; border-radius: 14px; border: 1px solid ${colors.borderStrong}; background: #fff; color: ${colors.text}; cursor: pointer; }
  .bw-node:hover { border-color: ${colors.text}; }
  .bw-node.is-root { cursor: default; }
  .bw-node.is-main { background: #0a0a0a; border-color: #0a0a0a; color: #fff; box-shadow: 0 10px 30px rgba(236,23,143,0.18); }
  .bw-node.is-under { margin-left: 28px; background: linear-gradient(180deg, #f1f0ec, #e4e3df); border-color: rgba(0,0,0,0.12); }
  .bw-node.is-under::before { content: ""; position: absolute; left: -18px; top: -10px; width: 14px; height: calc(50% + 10px); border-left: 1.5px solid rgba(0,0,0,0.22); border-bottom: 1.5px solid rgba(0,0,0,0.22); border-bottom-left-radius: 8px; }
  .bw-node.is-on { outline: 2px solid #ec178f; outline-offset: 2px; }
  .bw-node-name { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
  .bw-node-sub { font-size: 12px; opacity: 0.6; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .bw-node-check { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); color: #ec178f; }
`;
