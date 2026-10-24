import { useState } from "react";
import { createPortal } from "react-dom";

/* Paid sends. Mail to a list costs one send per recipient, taken from a
   bought balance (backend lib/emailCredits.js, hook useEmailCredits.js).
   The paywall opens when a send needs more than the balance. */

const n = (x) => Number(x || 0).toLocaleString("sv-SE");

// "Saldo: 4 200 utskick · Köp fler" under a send button.
export function CreditsLine({ balance, needed, onBuy }) {
  if (balance == null) return null;
  const short = needed != null && needed > balance;
  return (
    <p className="ec-line">
      <style>{CSS}</style>
      Saldo: <b>{n(balance)}</b> utskick
      {short && <span className="ec-short"> · {n(needed - balance)} för lite för det här utskicket</span>}
      {" · "}
      <button type="button" className="ec-link" onClick={onBuy}>Köp utskick</button>
    </p>
  );
}

export function CreditsPaywall({ open, needed, balance, packs, onBuy, onClose }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  if (!open) return null;
  const missing = Math.max(0, (needed || 0) - (balance || 0));
  const fits = packs.find((p) => p.mails >= missing) || packs[packs.length - 1];
  const pick = async (id) => {
    setBusy(id);
    setError("");
    try { await onBuy(id); } catch { setError("Kunde inte öppna betalningen. Försök igen."); setBusy(null); }
  };
  return createPortal(
    <div className="ec-bg" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <style>{CSS}</style>
      <div className="ec-modal" role="dialog" aria-modal="true" aria-labelledby="ec-title">
        <h2 id="ec-title">{needed ? "Köp utskick för att skicka" : "Köp utskick"}</h2>
        <p className="ec-muted">
          {needed
            ? <>Det här utskicket går till <b>{n(needed)}</b> personer. Du har <b>{n(balance)}</b> utskick kvar.</>
            : <>Du har <b>{n(balance)}</b> utskick kvar.</>}
          {" "}Event, anmälan, gästlista och bekräftelser till gästerna är alltid gratis. Det du betalar för är mejl till din lista, nästan till självkostnad.
        </p>
        <div className="ec-packs">
          {packs.map((p) => (
            <button key={p.id} type="button" className={`ec-pack${needed && p.id === fits?.id ? " is-fit" : ""}`} disabled={!!busy} onClick={() => pick(p.id)}>
              <span className="ec-mails">{n(p.mails)} utskick</span>
              <span className="ec-price">{n(p.priceSek)} kr</span>
              <span className="ec-per">{(p.priceSek / p.mails * 100).toFixed(1).replace(".", ",")} öre/mejl</span>
              {busy === p.id && <span className="ec-per">Öppnar betalning…</span>}
            </button>
          ))}
        </div>
        <p className="ec-small">Priser exkl. moms. Utskicken går aldrig ut. Betalning via Stripe.</p>
        {error && <p className="ec-error">{error}</p>}
        <div className="ec-actions">
          <button type="button" className="ec-btn" disabled={!!busy} onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const CSS = `
  .ec-line { margin: 4px 0 0; font-size: 12.5px; color: #6e6e73; }
  .ec-line b { color: #0a0a0a; font-variant-numeric: tabular-nums; }
  .ec-short { color: #b4235a; }
  .ec-link { border: none; background: none; padding: 0; font: inherit; font-weight: 600; color: #0a0a0a; text-decoration: underline; cursor: pointer; }
  .ec-bg { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; background: rgba(10,10,10,0.42); }
  .ec-modal { width: min(560px, 100%); max-height: calc(100vh - 32px); overflow: auto; background: #fff; color: #0a0a0a; border-radius: 18px; padding: 22px; box-shadow: 0 20px 60px rgba(0,0,0,0.25); display: grid; gap: 14px; }
  .ec-modal h2 { margin: 0; font-size: 20px; letter-spacing: -0.01em; }
  .ec-muted { margin: 0; font-size: 14px; line-height: 1.5; color: #3a3a3c; }
  .ec-packs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  @media (max-width: 520px) { .ec-packs { grid-template-columns: 1fr; } }
  .ec-pack { display: grid; gap: 4px; text-align: left; padding: 14px; border-radius: 14px; border: 1px solid rgba(0,0,0,0.14); background: #fff; font: inherit; color: inherit; cursor: pointer; }
  .ec-pack:hover:not(:disabled) { border-color: #0a0a0a; }
  .ec-pack.is-fit { border: 2px solid #0a0a0a; padding: 13px; }
  .ec-pack:disabled { opacity: 0.6; cursor: wait; }
  .ec-mails { font-size: 13px; font-weight: 600; }
  .ec-price { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .ec-per { font-size: 12px; color: #6e6e73; }
  .ec-small { margin: 0; font-size: 12px; color: #6e6e73; }
  .ec-error { margin: 0; font-size: 13px; color: #b4235a; }
  .ec-actions { display: flex; justify-content: flex-end; }
  .ec-btn { padding: 9px 16px; border-radius: 999px; border: 1px solid rgba(0,0,0,0.18); background: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
`;
