// ProductPurchaseModal — buy a product WITHOUT leaving the room.
//
// The room is the storefront. A visitor taps Buy on a product card and the whole
// purchase happens here: confirm identity → create a paid RSVP against the
// product event → pay via the rail-agnostic V2 checkout → see the delivery. It
// reuses the exact paid-RSVP path the standalone /p/:slug page uses, so a
// purchase is a settled RSVP with gated delivery — no new money model.
//
// External products (fulfillment.external) hand the money off to the host's own
// storefront: there's nothing to charge here, so Buy just opens the link.

import { useState } from "react";
import { X, Loader2, ExternalLink } from "lucide-react";
import { publicFetch } from "../../lib/api.js";
import { V2CheckoutPanel } from "../V2CheckoutPanel.jsx";
import { ProductDelivery } from "../ProductDelivery.jsx";
import { formatPrice } from "../../lib/money.js";

function priceLabel(product) {
  if (product?.price == null) return null;
  return formatPrice(product.price, product.currency);
}

export function ProductPurchaseModal({ product, prefill = {}, onClose }) {
  const externalUrl = product?.productDelivery?.external?.url || null;
  const [step, setStep] = useState("confirm"); // confirm | pay | done
  const [name, setName] = useState(prefill.name || "");
  const [email, setEmail] = useState(prefill.email || "");
  const [payment, setPayment] = useState(null); // body.paymentV2
  const [rsvpId, setRsvpId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function startPurchase() {
    if (busy) return;
    if (!name.trim() || !email.trim()) { setErr("Add your name and email."); return; }
    setErr("");
    setBusy(true);
    try {
      const res = await publicFetch(`/events/${product.slug}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && body.error === "duplicate") {
          // Already purchased — jump straight to their delivery.
          const existingId = body.rsvp?.id;
          if (existingId) { setRsvpId(existingId); setStep("done"); return; }
        }
        setErr(body.message || body.error || "Couldn't start the purchase.");
        return;
      }
      if (body.paymentV2?.required) {
        setPayment(body.paymentV2);
        setStep("pay");
        return;
      }
      // No charge required (free / checkout off): if we got an rsvp, show delivery.
      if (body.rsvp?.id) { setRsvpId(body.rsvp.id); setStep("done"); return; }
      setErr("Checkout isn't available right now. Try the product page.");
    } catch {
      setErr("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function onPaid() {
    setRsvpId(payment?.rsvpId || null);
    setStep("done");
  }

  // Card rail morphs into Stripe Elements on the full page — not supported inline.
  function onStripeCharge() {
    setErr("To pay by card, open the product page.");
  }

  const pl = priceLabel(product);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(8,8,10,0.66)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 460, maxHeight: "92vh", overflowY: "auto",
          background: "#121214", color: "#fff",
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none",
          padding: "8px 20px 28px",
          // The checkout reads --brand-primary; give it a sane on-dark default.
          ["--brand-primary"]: "#fff", ["--brand-ink-on-primary"]: "#000",
        }}
      >
        {/* grab handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 12px" }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)" }} />
        </div>

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          {product.coverImageUrl && (
            <img src={product.coverImageUrl} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover", flex: "0 0 auto" }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>{product.title}</div>
            {pl && <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 3 }}>{pl}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 4 }}>
            <X size={22} />
          </button>
        </div>

        {/* ── External handoff ── */}
        {externalUrl && step === "confirm" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {product.description && (
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.78)", lineHeight: 1.55, whiteSpace: "pre-line" }}>{product.description}</div>
            )}
            <a href={externalUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "15px", borderRadius: 12,
                background: "#fff", color: "#000", fontSize: 15, fontWeight: 800, textDecoration: "none" }}>
              Buy now <ExternalLink size={16} />
            </a>
          </div>
        )}

        {/* ── Confirm identity → start charge ── */}
        {!externalUrl && step === "confirm" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {product.description && (
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.78)", lineHeight: 1.55, whiteSpace: "pre-line", marginBottom: 4 }}>{product.description}</div>
            )}
            <Field label="Your name" value={name} onChange={setName} placeholder="Name" />
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@email.com" type="email" />
            {err && <div style={{ fontSize: 13, color: "#fca5a5" }}>{err}</div>}
            <button type="button" onClick={startPurchase} disabled={busy}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "15px", borderRadius: 12, border: "none",
                background: busy ? "rgba(255,255,255,0.15)" : "#fff", color: busy ? "rgba(255,255,255,0.5)" : "#000",
                fontSize: 15, fontWeight: 800, cursor: busy ? "default" : "pointer", marginTop: 4 }}>
              {busy ? <><Loader2 size={16} className="spin" /> Starting…</> : pl ? `Continue · ${pl}` : "Continue"}
            </button>
          </div>
        )}

        {/* ── Pay ── */}
        {step === "pay" && payment && (
          <V2CheckoutPanel
            payment={{ rsvpId: payment.rsvpId, rails: payment.rails, amount: payment.amount, currency: payment.currency }}
            onStripeCharge={onStripeCharge}
            onSuccess={onPaid}
            onError={() => {}}
          />
        )}
        {step === "pay" && err && <div style={{ fontSize: 13, color: "#fca5a5", marginTop: 10 }}>{err}</div>}

        {/* ── Delivered ── */}
        {step === "done" && (
          <ProductDelivery productDelivery={product.productDelivery} purchaseRsvpId={rsvpId} />
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" }}
      />
    </label>
  );
}

export default ProductPurchaseModal;
