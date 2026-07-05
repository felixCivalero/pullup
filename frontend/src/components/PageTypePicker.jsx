import { useEffect, useState } from "react";
import { Calendar, DoorOpen, ShoppingBag, ArrowRight, X, Lock } from "lucide-react";
import { PAGE_KIND_LIST } from "../lib/pageKinds.js";
import { useSubscription } from "../lib/useSubscription.js";
import { colors } from "../theme/colors.js";

// ════════════════════════════════════════════════════════════════════════
// PageTypePicker — the "what do you want to create?" modal behind the Create
// menu. Reads the page-kind registry, so new page types appear here for free.
// Event/Community are live; Product is "coming soon" (non-clickable).
//
// The paywall meets the host HERE, not at publish: without an active tier
// (or the founding gift) the card swaps its options for an upgrade view, so
// nobody drafts a page they can't take live. Publish routes still 402 —
// this is the front door, the backend stays the lock.
//
//   onPick(kindId)  — a buildable kind was chosen
//   onClose()       — dismissed
// ════════════════════════════════════════════════════════════════════════

const ICONS = { event: Calendar, community: DoorOpen, product: ShoppingBag };
const DESCRIPTIONS = {
  event: "A night, a show, a dinner — date, place, and RSVPs.",
  community: "Your world's front door. People join — no date. One per creator.",
  product: "Sell to your community, right from the Room.",
};

export function PageTypePicker({ onPick, onClose }) {
  const { sub, loading, startCheckout } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Only lock when we KNOW they can't host — while the status loads (or if it
  // fails) the options show, and the publish-time 402 remains the real gate.
  const locked = !loading && !!sub?.enforced && sub?.entitlement?.canHost === false;
  const price = sub?.tier?.priceSek ?? 125;

  async function subscribe() {
    setBusy(true);
    setError("");
    try {
      const ok = await startCheckout(); // navigates to Stripe; returns false on failure
      if (!ok) {
        setError("Couldn't open checkout — try again in a moment.");
        setBusy(false);
      }
    } catch {
      setError("Couldn't open checkout — try again in a moment.");
      setBusy(false);
    }
  }

  return (
    <div className="ptp-backdrop" onClick={onClose}>
      <style>{STYLES}</style>
      <div className="ptp-card" role="dialog" aria-modal="true" aria-label="Create a page" onClick={(e) => e.stopPropagation()}>
        <div className="ptp-head">
          <div>
            <p className="ptp-kicker">{locked ? "Creator tier" : "Create"}</p>
            <h2 className="ptp-title">{locked ? "Upgrade to host" : "What are you making?"}</h2>
          </div>
          <button type="button" className="ptp-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {locked ? (
          <div className="ptp-wall">
            <p className="ptp-wall-copy">
              Being a guest on PullUp is free, forever. Creating — event pages, your
              community page, products — runs on one flat subscription.
            </p>
            <div className="ptp-wall-price">
              <span className="ptp-wall-amount">{price} kr</span>
              <span className="ptp-wall-per">/month · cancel anytime</span>
            </div>
            {error && <div className="ptp-wall-error">{error}</div>}
            <button type="button" className="ptp-wall-cta" onClick={subscribe} disabled={busy}>
              <Lock size={15} />
              {busy ? "Opening secure checkout…" : `Subscribe — ${price} kr/month`}
            </button>
            <button type="button" className="ptp-wall-later" onClick={onClose}>Not now</button>
            <p className="ptp-wall-fine">Secure payment by Stripe. Manage or cancel from Settings → Billing.</p>
          </div>
        ) : (
        <div className="ptp-list">
          {PAGE_KIND_LIST.map((k) => {
            const Icon = ICONS[k.id] || Calendar;
            const soon = k.comingSoon;
            return (
              <button
                key={k.id}
                type="button"
                className={`ptp-item${soon ? " is-soon" : ""}`}
                onClick={soon ? undefined : () => onPick?.(k.id)}
                disabled={soon}
                aria-disabled={soon}
              >
                <span className="ptp-ic"><Icon size={20} /></span>
                <span className="ptp-txt">
                  <span className="ptp-name">
                    {k.label}
                    {soon && <span className="ptp-soon">Coming soon</span>}
                  </span>
                  <span className="ptp-desc">{DESCRIPTIONS[k.id]}</span>
                </span>
                {!soon && <ArrowRight size={17} className="ptp-arrow" />}
              </button>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}

const PINK = colors.accent;
const STYLES = `
  .ptp-backdrop { position: fixed; inset: 0; z-index: 240; display: flex; align-items: center; justify-content: center; padding: 22px;
    background: rgba(10,10,12,0.45); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); animation: ptp-fade 0.2s ease; }
  .ptp-card { width: 100%; max-width: 460px; background: #fff; border: 1px solid rgba(10,10,10,0.08); border-radius: 22px;
    box-shadow: 0 30px 80px -16px rgba(10,10,10,0.4); padding: 22px; box-sizing: border-box; animation: ptp-pop 0.28s cubic-bezier(0.16,1,0.3,1); }
  @keyframes ptp-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ptp-pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }

  .ptp-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
  .ptp-kicker { margin: 0 0 4px; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(10,10,10,0.42); }
  .ptp-title { margin: 0; font-size: 22px; font-weight: 850; letter-spacing: -0.02em; color: #0a0a0a; }
  .ptp-x { flex: 0 0 auto; width: 32px; height: 32px; border-radius: 9px; border: none; background: transparent; color: rgba(10,10,10,0.5); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
  .ptp-x:hover { background: rgba(10,10,10,0.05); }

  .ptp-list { display: flex; flex-direction: column; gap: 10px; }
  .ptp-item { display: flex; align-items: center; gap: 14px; width: 100%; padding: 15px 16px; border-radius: 15px; text-align: left; cursor: pointer;
    border: 1px solid rgba(10,10,10,0.12); background: #fff; font: inherit; transition: border-color 0.16s, box-shadow 0.16s, background 0.16s; }
  .ptp-item:hover:not(.is-soon) { border-color: ${PINK}; box-shadow: 0 0 0 3px rgba(236,23,143,0.1); }
  .ptp-item.is-soon { cursor: default; opacity: 0.6; }
  .ptp-ic { flex: 0 0 auto; width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: rgba(236,23,143,0.09); color: ${PINK}; }
  .ptp-item.is-soon .ptp-ic { background: rgba(10,10,10,0.05); color: rgba(10,10,10,0.45); }
  .ptp-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .ptp-name { display: flex; align-items: center; gap: 9px; font-size: 15.5px; font-weight: 800; color: #0a0a0a; }
  .ptp-soon { font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(10,10,10,0.5); background: rgba(10,10,10,0.07); padding: 3px 8px; border-radius: 999px; }
  .ptp-desc { font-size: 13px; color: rgba(10,10,10,0.55); line-height: 1.4; }
  .ptp-arrow { flex: 0 0 auto; color: rgba(10,10,10,0.3); }
  .ptp-item:hover:not(.is-soon) .ptp-arrow { color: ${PINK}; }

  .ptp-wall { display: flex; flex-direction: column; }
  .ptp-wall-copy { margin: 0 0 16px; font-size: 14px; line-height: 1.55; color: rgba(10,10,10,0.62); }
  .ptp-wall-price { display: flex; align-items: baseline; gap: 8px; margin-bottom: 16px; }
  .ptp-wall-amount { font-size: 32px; font-weight: 900; color: #0a0a0a; }
  .ptp-wall-per { font-size: 14px; color: rgba(10,10,10,0.55); }
  .ptp-wall-error { margin-bottom: 12px; padding: 10px 12px; border-radius: 8px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); font-size: 13px; color: #ef4444; }
  .ptp-wall-cta { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 13px 18px; border-radius: 12px; border: none;
    background: #0a0a0a; color: #fff; font: inherit; font-size: 14.5px; font-weight: 800; cursor: pointer; }
  .ptp-wall-cta:disabled { opacity: 0.6; cursor: default; }
  .ptp-wall-later { width: 100%; margin-top: 8px; padding: 10px; border-radius: 12px; border: none; background: none; color: rgba(10,10,10,0.55); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .ptp-wall-fine { margin: 10px 0 0; font-size: 11.5px; color: rgba(10,10,10,0.4); text-align: center; }
`;
