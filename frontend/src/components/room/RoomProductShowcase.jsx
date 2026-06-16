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

export function RoomProductShowcase({
  products = [],
  isHost = false,
  theme = "light",
  scope = "main", // 'main' | 'event'
  prefill = {},
  onManage,
  heading = "Shop",
}) {
  const t = tokens(theme);
  const [buying, setBuying] = useState(null); // a product card

  // Nothing to show + not a host → render nothing (don't crowd a visitor's room).
  if (!products.length && !isHost) return null;

  const single = products.length === 1;

  const card = (p) => {
    const draft = isHost && p.live === false;
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => (isHost ? onManage?.(p) : setBuying(p))}
        style={{
          flex: single ? "1 1 auto" : "0 0 auto",
          width: single ? "100%" : 190,
          display: "flex", flexDirection: "column", textAlign: "left",
          background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16,
          overflow: "hidden", cursor: "pointer", fontFamily: SF, color: t.text,
          padding: 0, boxSizing: "border-box",
        }}
      >
        {p.coverImageUrl ? (
          <div style={{ width: "100%", aspectRatio: single ? "16 / 9" : "1 / 1", background: `url(${p.coverImageUrl}) center/cover` }} />
        ) : (
          <div style={{ width: "100%", aspectRatio: single ? "16 / 9" : "1 / 1", background: t.accent + "14", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShoppingBag size={28} color={t.accent} />
          </div>
        )}
        <div style={{ padding: "12px 13px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
            {draft && (
              <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: t.subtle, border: `1px solid ${t.border}`, borderRadius: 999, padding: "2px 7px" }}>Draft</span>
            )}
          </div>
          {single && p.description && (
            <div style={{ fontSize: 13, color: t.muted, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.description}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: t.accent }}>{priceLabel(p)}</span>
            {isHost ? (
              <span style={{ fontSize: 11.5, color: t.subtle, marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}>
                {p.hideFromMainRoom && scope === "main" && <EyeOff size={12} />}
                {typeof p.unitsSold === "number" ? `${p.unitsSold} sold` : ""}
              </span>
            ) : (
              <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 800, color: "#fff", background: t.accent, borderRadius: 999, padding: "6px 13px" }}>Buy</span>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: t.subtle, fontFamily: SF }}>{heading}</span>
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
      ) : single ? (
        card(products[0])
      ) : (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
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
