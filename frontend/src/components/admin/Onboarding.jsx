import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authenticatedFetch } from "../../lib/api.js";
import { setCurrentBrandId } from "../../lib/brand.js";

/* The first thing a new account sees: what's the brand called? Guests see
   that name as the organiser and as the sender of its mail. Then straight on
   to the first event. More brands come later, from the switcher in the bar.
   (A returning account never sees this: AdminShell shows it only when the
   account has no brand yet.) */
export function Onboarding({ email, onDone }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await authenticatedFetch("/admin/brands", { method: "POST", body: JSON.stringify({ name }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.message || "Det gick inte att spara. Försök igen.");
      setCurrentBrandId(out.brand.id);
      await onDone?.();
      navigate("/admin/events/new", { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="ob">
      <style>{CSS}</style>
      <form onSubmit={submit}>
        <p className="ob-kicker">Välkommen till PullUp</p>
        <h1>Vem bjuder in?</h1>
        <p className="ob-sub">
          Namnet på varumärket, föreningen eller dig själv. Gästerna ser det som arrangör och avsändare.
          Har du flera varumärken lägger du till dem sen, under samma inloggning.
        </p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="T.ex. Aperol Sverige" maxLength={80} autoFocus required />
        <button type="submit" disabled={busy || !name.trim()}>{busy ? "Sparar…" : "Fortsätt"}</button>
        {error && <p className="ob-err">{error}</p>}
        <p className="ob-fine">
          Inloggad som {email}. Event, anmälningar, CRM och agenter är gratis. Du betalar bara för utskick till många.
        </p>
      </form>
    </div>
  );
}

const CSS = `
  .ob { min-height: calc(100dvh - 56px); display: grid; place-items: center; padding: 32px 16px; box-sizing: border-box; }
  .ob form { width: min(420px, 100%); display: grid; gap: 12px; }
  .ob-kicker { margin: 0; font-size: 13px; font-weight: 600; letter-spacing: 0.02em; color: #6e6e73; }
  .ob h1 { margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.03em; }
  .ob-sub { margin: 0 0 6px; font-size: 15px; line-height: 1.5; color: #6e6e73; }
  .ob input { font: inherit; font-size: 16px; padding: 13px 16px; border: 1px solid rgba(0,0,0,0.16); border-radius: 12px; outline: none; }
  .ob input:focus { border-color: #000; }
  .ob button { font: inherit; font-size: 15px; font-weight: 600; padding: 13px 16px; border: 0; border-radius: 999px; background: #000; color: #fff; cursor: pointer; }
  .ob button:disabled { opacity: 0.4; cursor: default; }
  .ob-err { margin: 0; font-size: 14px; color: #D9480F; }
  .ob-fine { margin: 8px 0 0; font-size: 13px; line-height: 1.5; color: #8a8a8e; }
`;
