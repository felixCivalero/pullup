// RoomProductShowcase — the storefront inside a room.
//
// ONE component, two faces, any count:
//   • Visitor → tap a product to buy it inline (ProductPurchaseModal). Never sees
//     drafts; the room's RSVP gate is the access control.
//   • Host → the same cards plus a "Manage" affordance (and per-card stats), which
//     calls onManage so the parent can open the placement manager.
//   • 1 product → a featured single card. Many → a horizontal shelf.
//
// theme adapts to where it lives: 'light' on the host home / person room, 'dark'
// in the event room interior.

import { useState } from "react";
import { ShoppingBag, Plus, Settings2, EyeOff } from "lucide-react";
import { ProductPurchaseModal } from "./ProductPurchaseModal.jsx";
import { priceOrFree } from "../../lib/money.js";

function tokens(theme) {
  const dark = theme === "dark";
  return {
    text: dark ? "#fff" : "#0a0a0a",
    muted: dark ? "rgba(255,255,255,0.62)" : "rgba(10,10,10,0.62)",
    subtle: dark ? "rgba(255,255,255,0.45)" : "rgba(10,10,10,0.45)",
    surface: dark ? "rgba(255,255,255,0.04)" : "#fff",
    border: dark ? "rgba(255,255,255,0.12)" : "rgba(10,10,10,0.10)",
    accent: "#ec178f",
  };
}

function priceLabel(p) {
  return priceOrFree(p?.price, p?.currency);
}

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// A storefront tile — the product image IS the card (clean 4:5, no border
// box), name + price below like an actual shop. Hover zooms the image a beat;
// drafts wear an amber pill and read slightly muted. Guests get a Buy pill on
// the image; hosts see sold count and click through to manage.
function ShopTile({ p, t, isHost, scope, onClick }) {
  const [hover, setHover] = useState(false);
  const draft = isHost && p.live === false;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: "flex", flexDirection: "column", gap: 9, padding: 0, border: "none", background: "none", textAlign: "left", cursor: "pointer", fontFamily: SF, color: t.text, width: "100%" }}
    >
      <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 5", borderRadius: 14, overflow: "hidden", background: t.accent + "10", boxShadow: hover ? "0 10px 26px rgba(10,10,10,0.14)" : "0 1px 6px rgba(10,10,10,0.06)", transition: "box-shadow 0.2s ease" }}>
        {p.coverImageUrl ? (
          <img
            src={p.coverImageUrl}
            alt=""
            onError={(e) => { e.currentTarget.style.display = "none"; }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: hover ? "scale(1.045)" : "scale(1)", transition: "transform 0.3s ease", filter: draft ? "grayscale(35%)" : "none", opacity: draft ? 0.85 : 1 }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShoppingBag size={28} color={t.accent} />
          </div>
        )}
        {draft && (
          <span style={{ position: "absolute", top: 8, left: 8, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fff", background: "rgba(180,83,9,0.9)", padding: "3px 8px", borderRadius: 999, backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>Draft</span>
        )}
        {isHost && p.hideFromMainRoom && scope === "main" && (
          <span title="Hidden from your main room" style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,10,10,0.5)", color: "#fff", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>
            <EyeOff size={13} />
          </span>
        )}
        {!isHost && (
          <span style={{ position: "absolute", right: 8, bottom: 8, fontSize: 12, fontWeight: 800, color: "#fff", background: t.accent, borderRadius: 999, padding: "6px 14px", boxShadow: "0 4px 14px rgba(10,10,10,0.25)" }}>Buy</span>
        )}
      </div>
      <div style={{ padding: "0 2px", width: "100%", boxSizing: "border-box" }}>
        <div style={{ fontSize: 13.5, fontWeight: 650, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: t.accent }}>{priceLabel(p)}</span>
          {isHost && typeof p.unitsSold === "number" && (
            <span style={{ fontSize: 11.5, color: t.subtle, marginLeft: "auto" }}>{p.unitsSold} sold</span>
          )}
        </div>
      </div>
    </button>
  );
}

export function RoomProductShowcase({
  products = [],
  isHost = false,
  theme = "light",
  scope = "main", // 'main' | 'event'
  prefill = {},
  onManage,
  heading = "Shop",
  // Home-room styling: the big section-header language (real title + hint)
  // instead of the small-caps room label. Event rooms keep the default.
  homeHeader = false,
  hint = null,
}) {
  const t = tokens(theme);
  const [buying, setBuying] = useState(null); // a product card

  // Nothing to show + not a host → render nothing (don't crowd a visitor's room).
  if (!products.length && !isHost) return null;

  const card = (p) => (
    <ShopTile
      key={p.id}
      p={p}
      t={t}
      isHost={isHost}
      scope={scope}
      onClick={() => (isHost ? onManage?.(p) : setBuying(p))}
    />
  );

  return (
    <div style={{ marginTop: homeHeader ? 0 : 30 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: homeHeader ? 14 : 10, minHeight: homeHeader ? 32 : undefined }}>
        {homeHeader ? (
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.015em", color: t.text, fontFamily: SF, whiteSpace: "nowrap" }}>{heading}</span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: t.subtle, fontFamily: SF }}>{heading}</span>
        )}
        {hint && <span style={{ fontSize: 12.5, color: t.subtle, fontFamily: SF, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>· {hint}</span>}
        {isHost && (
          <button
            type="button"
            onClick={() => onManage?.(null)}
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, fontFamily: SF,
              cursor: "pointer", padding: "6px 11px", borderRadius: 999, border: `1px solid ${t.border}`, background: t.surface, color: t.muted }}
          >
            {scope === "event" ? <><Plus size={13} /> Add product</> : <><Settings2 size={13} /> Manage</>}
          </button>
        )}
      </div>

      {products.length === 0 && isHost ? (
        <button
          type="button"
          onClick={() => onManage?.(null)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "16px", borderRadius: 16, cursor: "pointer",
            textAlign: "left", fontFamily: SF, border: `1px dashed ${t.border}`, background: t.surface, color: t.text, boxSizing: "border-box" }}
        >
          <span style={{ width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: t.accent + "1f", color: t.accent, flex: "0 0 auto" }}>
            <ShoppingBag size={20} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14.5, fontWeight: 700 }}>
              {scope === "event" ? "Sell a product in this room" : "Sell to your room"}
            </span>
            <span style={{ display: "block", fontSize: 12.5, color: t.muted, marginTop: 2 }}>
              {scope === "event" ? "Add one of your products — visitors buy without leaving." : "Live products show here automatically."}
            </span>
          </span>
          <span style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800, color: "#fff", background: t.accent, padding: "7px 13px", borderRadius: 999 }}>
            <Plus size={13} /> Add
          </span>
        </button>
      ) : (
        // The storefront grid — image-first tiles that auto-fit the row, one
        // and many products alike (a lone product just holds one slot).
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
          {products.map(card)}
        </div>
      )}

      {buying && (
        <ProductPurchaseModal product={buying} prefill={prefill} onClose={() => setBuying(null)} />
      )}
    </div>
  );
}

export default RoomProductShowcase;
