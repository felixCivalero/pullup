// ProductDelivery — the buyer-facing delivery block on a kind='product' page.
//
// Two states, one component:
//   • Not purchased → a teaser: locked content shows its title under a lock; a
//     short "delivered after purchase" line for download/secret.
//   • Purchased (?purchase=<rsvpId> in the URL, set by the success redirect or
//     the confirmation email) → fetch the GATED delivery endpoint and render the
//     real download link / revealed secret / unlocked content. The server only
//     returns these once the payment has settled.

import { useEffect, useState } from "react";
import { Download, KeyRound, Lock, Loader2, Check, Copy } from "lucide-react";
import { publicFetch } from "../lib/api.js";

export function ProductDelivery({ productDelivery, purchaseRsvpId }) {
  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!purchaseRsvpId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await publicFetch(`/public/rsvps/${purchaseRsvpId}/delivery`);
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "not_available");
        if (alive) setDelivery(body.delivery || null);
      } catch (e) {
        if (alive) setErr(e.message === "not_paid" ? "We couldn't confirm this purchase yet." : "Couldn't load your delivery.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [purchaseRsvpId]);

  const hasAny = productDelivery && (productDelivery.hasDownload || productDelivery.secretKind || productDelivery.unlock);
  if (!purchaseRsvpId && !hasAny) return null;

  const card = {
    marginTop: 24, padding: 20, borderRadius: 16,
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)",
  };
  const row = { display: "flex", alignItems: "center", gap: 12, marginTop: 12 };
  const btn = {
    display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 20px", borderRadius: 10,
    background: "var(--brand-primary, #fff)", color: "var(--brand-ink-on-primary, #000)",
    border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", textDecoration: "none",
  };
  const muted = { fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 };

  // ── Purchased: show the real delivery ──────────────────────────────────
  if (purchaseRsvpId) {
    return (
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
          <Check size={18} /> Your purchase
        </div>
        {loading && <div style={{ ...row, ...muted }}><Loader2 size={16} className="spin" /> Loading your delivery…</div>}
        {err && <div style={{ ...row, color: "#fca5a5", fontSize: 13 }}>{err}</div>}

        {delivery?.download?.url && (
          <div style={row}>
            <a href={delivery.download.url} style={btn} download>
              <Download size={16} /> Download{delivery.download.filename ? ` · ${delivery.download.filename}` : ""}
            </a>
          </div>
        )}

        {delivery?.secret?.value && (
          <div style={{ marginTop: 16 }}>
            <div style={{ ...muted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <KeyRound size={14} /> {delivery.secret.kind === "code" ? "Your code" : "Your link"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {delivery.secret.kind === "code" ? (
                <code style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 14, wordBreak: "break-all" }}>
                  {delivery.secret.value}
                </code>
              ) : (
                <a href={delivery.secret.value} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,0.3)", color: "var(--brand-primary, #fff)", fontSize: 14, wordBreak: "break-all", textDecoration: "underline" }}>
                  {delivery.secret.value}
                </a>
              )}
              <button type="button" onClick={() => { navigator.clipboard?.writeText(delivery.secret.value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                style={{ ...btn, padding: "10px 12px" }} aria-label="Copy">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        )}

        {delivery?.unlock?.body && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{delivery.unlock.title}</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, whiteSpace: "pre-line" }}>{delivery.unlock.body}</div>
          </div>
        )}

        {!loading && !err && delivery && !delivery.download && !delivery.secret && !delivery.unlock && (
          <div style={{ ...row, ...muted }}>Your purchase is confirmed.</div>
        )}
      </div>
    );
  }

  // ── Not purchased: a teaser of what they'll get ────────────────────────
  return (
    <div style={card}>
      {productDelivery.unlock && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Lock size={18} color="rgba(255,255,255,0.7)" />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{productDelivery.unlock.title}</div>
            <div style={muted}>Unlocks after purchase</div>
          </div>
        </div>
      )}
      {(productDelivery.hasDownload || productDelivery.secretKind) && (
        <div style={{ ...muted, marginTop: productDelivery.unlock ? 12 : 0, display: "flex", alignItems: "center", gap: 8 }}>
          {productDelivery.hasDownload ? <Download size={14} /> : <KeyRound size={14} />}
          Delivered instantly after purchase.
        </div>
      )}
    </div>
  );
}

export default ProductDelivery;
