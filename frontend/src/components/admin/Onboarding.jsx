import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authenticatedFetch } from "../../lib/api.js";
import { setCurrentBrandId } from "../../lib/brand.js";
import { PendingInvites } from "./Team.jsx";

/* The first thing a new account sees, in two steps:
   1. what the organisation is called: its main brand, the name guests see as
      organiser and sender;
   2. the brands under it, drawn as an umbrella (migrations/155): Nigab on
      top, Aperol and Hendrick's underneath. Optional: one brand is fine.
   Nothing is saved until "Klar" (AdminShell stops showing this the moment the
   account has a brand), then the account lands on its events, empty, with
   the invitation to make the first one. Someone invited to a team sees the
   invite first: most of them came for that. */
export function Onboarding({ email, invites, onDone }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [main, setMain] = useState("");
  const [kids, setKids] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const top = main.trim();
  const addKid = (e) => {
    e?.preventDefault();
    const name = draft.trim().slice(0, 80);
    if (!name) return;
    const taken = [top, ...kids].some((n) => n.toLowerCase() === name.toLowerCase());
    if (!taken) setKids((k) => [...k, name]);
    setDraft("");
  };

  async function post(body) {
    const res = await authenticatedFetch("/admin/brands", { method: "POST", body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.message || "Det gick inte att spara. Försök igen.");
    return out.brand;
  }

  async function finish() {
    setBusy(true);
    setError("");
    try {
      const pending = draft.trim() && ![top, ...kids].some((n) => n.toLowerCase() === draft.trim().toLowerCase()) ? [...kids, draft.trim()] : kids;
      const brand = await post({ name: top });
      for (const name of pending) await post({ name, parentId: brand.id });
      setCurrentBrandId(brand.id);
      await onDone?.();
      navigate("/admin/events", { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="ob">
      <style>{CSS}</style>
      {step === 1 && invites?.length > 0 && (
        <div className="ob-invites">
          <p className="ob-kicker">Välkommen till PullUp</p>
          <h1>Du är inbjuden</h1>
          <PendingInvites invites={invites} onAnswered={onDone} compact />
          <p className="ob-or">Eller starta en egen organisation:</p>
        </div>
      )}

      {step === 1 ? (
        <form className="ob-step" onSubmit={(e) => { e.preventDefault(); if (top) setStep(2); }}>
          <p className="ob-count">1 / 2</p>
          <h1>Vad heter er organisation?</h1>
          <p className="ob-sub">Företaget, föreningen, byrån eller du själv. Gästerna ser namnet som arrangör och avsändare.</p>
          <div className="ob-panel">
            <div className="ob-panel-head"><i className="ob-led" aria-hidden="true" />Huvudvarumärke</div>
            <div className="ob-field">
              <input value={main} onChange={(e) => setMain(e.target.value)} placeholder="T.ex. Nigab" maxLength={80} autoFocus required aria-label="Organisationens namn" />
              <button type="submit" disabled={!top}>Nästa →</button>
            </div>
          </div>
          <p className="ob-fine">{`Inloggad som ${email}.`} Event, anmälningar, CRM och agenter är gratis. Du betalar bara för utskick till många.</p>
        </form>
      ) : (
        <div className="ob-step is-wide">
          <p className="ob-count">2 / 2</p>
          <h1>{`Har ${top} varumärken under sig?`}</h1>
          <p className="ob-sub">
            {`Lägg till dem här så blir ${top} huvudkontot: admin över allt, med alla event och hela CRM:et samlat. ${top} kan ha egna event och mejla alla som sagt ja till något av varumärkena, och den du bjuder in till ${top} jobbar i alla.`}
          </p>

          <div className="oc" aria-label={`Organisationen ${top}`}>
            <div className="oc-node is-root">
              <small>{kids.length ? "Huvudkonto · admin" : "Huvudvarumärke"}</small>
              <b>{top}</b>
            </div>
            <div className="oc-stem" aria-hidden="true" />
            <ul className={`oc-kids${kids.length ? "" : " is-empty"}`}>
              {kids.map((name) => (
                <li key={name} className="oc-kid">
                  <div className="oc-node">
                    <small>Varumärke</small>
                    <b>{name}</b>
                    <button type="button" className="oc-x" onClick={() => setKids((k) => k.filter((n) => n !== name))} aria-label={`Ta bort ${name}`}>×</button>
                  </div>
                </li>
              ))}
              <li className="oc-kid">
                <form className="oc-node is-add" onSubmit={addKid}>
                  <small>{kids.length ? "Ett till" : "Under " + top}</small>
                  <div className="oc-add">
                    <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="T.ex. Aperol" maxLength={80} autoFocus aria-label="Varumärke under" />
                    <button type="submit" disabled={!draft.trim()} aria-label="Lägg till">+</button>
                  </div>
                </form>
              </li>
            </ul>
          </div>

          <div className="ob-actions">
            <button type="button" className="ob-back" onClick={() => setStep(1)} disabled={busy}>← Tillbaka</button>
            <button type="button" className="ob-go" onClick={finish} disabled={busy}>
              {busy ? "Sparar…" : kids.length || draft.trim() ? "Klar" : `Bara ${top}, klar`}
            </button>
          </div>
          {error && <p className="ob-err">{error}</p>}
          <p className="ob-fine">Du kan alltid lägga till fler varumärken sen, från menyn uppe till höger.</p>
        </div>
      )}
    </div>
  );
}

const CSS = `
  .ob { --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace; min-height: calc(100dvh - 56px); display: grid; place-items: center; align-content: center; gap: 32px; padding: 40px 16px 56px; box-sizing: border-box;
    background: radial-gradient(90% 60% at 50% 0%, rgba(236,23,143,.10), transparent 70%); }
  .ob-invites { width: min(520px, 100%); display: grid; gap: 12px; }
  .ob-or { margin: 12px 0 0; padding-top: 20px; border-top: 1px solid rgba(0,0,0,0.08); font-size: 14px; color: #6e6e73; }
  .ob-step { width: min(520px, 100%); display: grid; gap: 14px; animation: ob-in .5s cubic-bezier(.16,1,.3,1) both; }
  .ob-step.is-wide { width: min(860px, 100%); }
  @keyframes ob-in { from { opacity: 0; transform: translateY(14px); } }
  .ob-kicker { margin: 0; font-size: 13px; font-weight: 600; color: #6e6e73; }
  .ob-count { margin: 0; font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: .1em; color: #ec178f; }
  .ob h1 { margin: 0; font-size: clamp(34px, 5vw, 56px); line-height: .98; font-weight: 700; letter-spacing: -0.045em; }
  .ob-sub { margin: 0 0 6px; max-width: 40em; font-size: 16px; line-height: 1.5; color: #6e6e73; }

  /* the grey technical panel, same family as the front page's tools */
  .ob-panel { padding: 14px; border-radius: 10px; border: 1px solid #8f8e89; background: linear-gradient(180deg, #e4e3df, #cfcec9); box-shadow: inset 0 1px 0 rgba(255,255,255,.85), inset 0 -2px 0 rgba(0,0,0,.12), 0 18px 40px -22px rgba(70,0,40,.45); }
  .ob-panel-head { display: flex; align-items: center; gap: 8px; padding-bottom: 12px; margin-bottom: 14px; border-bottom: 1px solid rgba(0,0,0,.14); box-shadow: 0 1px 0 rgba(255,255,255,.7); font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .ob-led { width: 7px; height: 7px; border-radius: 50%; background: #ec178f; box-shadow: 0 0 0 1px rgba(0,0,0,.25), 0 0 8px #ec178f; }
  .ob-field { display: flex; gap: 6px; }
  .ob input { min-width: 0; font-family: var(--mono); font-size: 16px; padding: 0 12px; height: 46px; border: 1px solid #7d7c77; border-radius: 6px; outline: none; background: #f7f6f1; color: #111; box-shadow: inset 0 2px 3px rgba(0,0,0,.14); }
  .ob input:focus { border-color: #111; box-shadow: inset 0 2px 3px rgba(0,0,0,.14), 0 0 0 2px #ec178f; }
  .ob-field input { flex: 1; }
  .ob-field button, .ob-go { flex: none; height: 46px; padding: 0 18px; border: 1px solid #000; border-radius: 6px; background: linear-gradient(180deg, #2a2a2a, #0d0d0d); color: #f2f1ec; font-family: var(--mono); font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 2px 0 rgba(0,0,0,.25); }
  .ob-field button:hover:not(:disabled), .ob-go:hover:not(:disabled) { background: linear-gradient(180deg, #f43aa5, #d90f80); color: #111; border-color: #8a0a52; }
  .ob button:disabled { opacity: .45; cursor: default; }
  .ob-err { margin: 0; font-size: 14px; color: #D9480F; }
  .ob-fine { margin: 6px 0 0; font-size: 13px; line-height: 1.5; color: #8a8a8e; }

  /* the umbrella: main brand on top, its brands underneath */
  .oc { display: grid; justify-items: center; padding: 28px 8px 8px; }
  .oc-node { position: relative; display: grid; gap: 4px; min-width: 150px; max-width: 220px; padding: 12px 14px; border-radius: 10px; border: 1px solid #8f8e89; background: linear-gradient(180deg, #e4e3df, #cfcec9); box-shadow: inset 0 1px 0 rgba(255,255,255,.85), inset 0 -2px 0 rgba(0,0,0,.1), 0 12px 26px -18px rgba(0,0,0,.5); text-align: left; animation: ob-pop .35s cubic-bezier(.16,1,.3,1) both; }
  @keyframes ob-pop { from { opacity: 0; transform: scale(.94); } }
  .oc-node small { font-family: var(--mono); font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #5d5c58; }
  .oc-node b { font-size: 18px; letter-spacing: -0.02em; overflow-wrap: anywhere; }
  .oc-node.is-root { min-width: 220px; max-width: 320px; padding: 16px 20px; background: #0a0a0a; border-color: #000; color: #fff; box-shadow: 0 0 0 4px rgba(236,23,143,.18), 0 18px 40px -16px rgba(236,23,143,.6); }
  .oc-node.is-root small { color: #ec178f; }
  .oc-node.is-root b { font-size: 24px; }
  .oc-stem { width: 2px; height: 28px; background: #0a0a0a; }
  .oc-kids { list-style: none; margin: 0; padding: 0; display: flex; justify-content: center; flex-wrap: nowrap; }
  .oc-kid { position: relative; padding: 26px 8px 0; display: flex; justify-content: center; }
  /* each child: a drop from the bar; the bar runs between the outer children */
  .oc-kid::before { content: ""; position: absolute; top: 0; left: 50%; width: 2px; height: 26px; margin-left: -1px; background: #0a0a0a; }
  .oc-kid::after { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: #0a0a0a; }
  .oc-kid:first-child::after { left: 50%; }
  .oc-kid:last-child::after { right: 50%; }
  .oc-kid:only-child::after { display: none; }
  .oc-node.is-add { border-style: dashed; background: rgba(255,255,255,.6); box-shadow: none; }
  .oc-node.is-add small { color: #ec178f; }
  .oc-add { display: flex; gap: 6px; }
  .oc-add input { width: 130px; height: 38px; font-size: 15px; }
  .oc-add button { flex: none; width: 38px; height: 38px; border: 1px solid #000; border-radius: 6px; background: #0a0a0a; color: #fff; font-size: 20px; line-height: 1; cursor: pointer; }
  .oc-add button:hover:not(:disabled) { background: #ec178f; color: #0a0a0a; }
  .oc-x { position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border: 0; border-radius: 50%; background: transparent; color: #5d5c58; font-size: 16px; line-height: 1; cursor: pointer; }
  .oc-x:hover { background: rgba(0,0,0,.1); color: #0a0a0a; }
  .ob-actions { display: flex; justify-content: space-between; gap: 10px; margin-top: 8px; }
  .ob-back { border: 0; background: none; font: inherit; font-size: 14px; color: #6e6e73; cursor: pointer; padding: 0; }
  .ob-back:hover { color: #0a0a0a; }

  /* phones and many brands: the umbrella turns into a tree down the left */
  @media (max-width: 700px) {
    .oc { justify-items: start; padding-top: 18px; }
    .oc-stem { margin-left: 24px; height: 12px; }
    .oc-kids { flex-direction: column; margin-left: 24px; }
    .oc-kid { padding: 12px 0 0 24px; justify-content: flex-start; }
    .oc-kid::before { left: 0; top: 40px; width: 24px; height: 2px; margin: 0; }
    .oc-kid::after, .oc-kid:first-child::after, .oc-kid:only-child::after { display: block; left: 0; right: auto; top: 0; bottom: 0; width: 2px; height: auto; }
    .oc-kid:last-child::after { bottom: auto; height: 42px; }
    .oc-node, .oc-node.is-root { max-width: none; }
  }
  @media (prefers-reduced-motion: reduce) { .ob-step, .oc-node { animation: none; } }
`;
