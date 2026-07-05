// RoomProductManager — the host's "where does this product show" controls.
//
// Two scopes, one modal:
//   • scope='event' → toggle which of the host's products are assigned to THIS
//     event room (add/remove room_products rows).
//   • scope='main'  → toggle each live product's main-room visibility
//     (hide_from_main_room); drafts are shown with a "publish to show" hint.
//
// Products are global, so both scopes draw from the host's one product library;
// a "+ New product" link opens the product editor.

import { useEffect, useState } from "react";
import { X, Loader2, Plus, Check, ShoppingBag, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authenticatedFetch } from "../../lib/api.js";
import { colors } from "../../theme/colors.js";
import { priceOrFree } from "../../lib/money.js";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function priceLabel(p) {
  return priceOrFree(p?.price, p?.currency);
}

export function RoomProductManager({ scope = "main", eventId = null, onClose, onChanged }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [library, setLibrary] = useState([]);     // host's full product library
  const [assignedIds, setAssignedIds] = useState(new Set()); // event scope
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      if (scope === "event" && eventId) {
        const r = await authenticatedFetch(`/host/events/${eventId}/room-products`);
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || "load_failed");
        setLibrary(b.library || []);
        setAssignedIds(new Set((b.assigned || []).map((p) => p.id)));
      } else {
        const r = await authenticatedFetch(`/host/products`);
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || "load_failed");
        setLibrary(b.products || []);
      }
    } catch {
      setErr("Couldn't load your products.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scope, eventId]);

  async function toggleEventAssign(p) {
    if (busyId) return;
    setBusyId(p.id);
    setErr("");
    const isAssigned = assignedIds.has(p.id);
    try {
      const r = isAssigned
        ? await authenticatedFetch(`/host/events/${eventId}/room-products/${p.id}`, { method: "DELETE" })
        : await authenticatedFetch(`/host/events/${eventId}/room-products`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productEventId: p.id }),
          });
      if (!r.ok) throw new Error("save_failed");
      setAssignedIds((prev) => {
        const next = new Set(prev);
        if (isAssigned) next.delete(p.id); else next.add(p.id);
        return next;
      });
      onChanged?.();
    } catch {
      setErr("Couldn't save that change.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleMainHide(p) {
    if (busyId) return;
    setBusyId(p.id);
    setErr("");
    const nextHidden = !p.hideFromMainRoom;
    try {
      const r = await authenticatedFetch(`/host/products/${p.id}/main-room`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden: nextHidden }),
      });
      if (!r.ok) throw new Error("save_failed");
      setLibrary((prev) => prev.map((x) => (x.id === p.id ? { ...x, hideFromMainRoom: nextHidden } : x)));
      onChanged?.();
    } catch {
      setErr("Couldn't save that change.");
    } finally {
      setBusyId(null);
    }
  }

  // A product is just an event with kind=product, so the normal event editor
  // (with its live preview) edits it. This is the only way back into a draft.
  const openEditor = (p) => {
    onClose?.();
    navigate(`/app/events/${p.id}/edit`);
  };

  const pill = (active) => ({
    display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 800, fontFamily: SF,
    cursor: busyId ? "default" : "pointer", padding: "8px 14px", borderRadius: 999, border: "none",
    background: active ? colors.accent : colors.surfaceMuted,
    color: active ? "#fff" : colors.textMuted,
  });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto",
        background: colors.background, color: colors.text, borderRadius: 22,
        border: `1px solid ${colors.border}`, padding: "22px 20px 28px", fontFamily: SF,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, display: "flex", alignItems: "center", gap: 10 }}>
              {scope === "event" ? "Products in this room" : "Your products"}
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#b45309", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 999, padding: "2px 8px" }}>
                Early access
              </span>
            </div>
            <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 3, lineHeight: 1.4 }}>
              {scope === "event"
                ? "Pick which products appear in this event's room. Guests buy without leaving."
                : "Live products show in your main room automatically. Hide any you'd rather keep to specific event rooms."}
              {" "}Products are in early access while we make the buying flow bulletproof —{" "}
              <a href="mailto:hello@pullup.se?subject=Products%20early%20access" style={{ color: colors.accent, fontWeight: 600 }}>say hi</a> to join.
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: colors.textSubtle, cursor: "pointer", padding: 4 }}>
            <X size={22} />
          </button>
        </div>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: colors.textMuted, padding: "20px 0" }}>
            <Loader2 size={16} className="spin" /> Loading…
          </div>
        ) : (
          <>
            {err && <div style={{ fontSize: 13, color: colors.danger, marginBottom: 10 }}>{err}</div>}

            {library.length === 0 && (
              <div style={{ fontSize: 13.5, color: colors.textMuted, padding: "8px 0 16px", lineHeight: 1.5 }}>
                You haven't created any products yet.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {library.map((p) => {
                const assigned = assignedIds.has(p.id);
                const shownInMain = !p.hideFromMainRoom;
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14, border: `1px solid ${colors.border}`, background: colors.surface }}>
                    {/* Tap the product itself to open its editor (the live-preview
                        page) — works for drafts and live alike. */}
                    <button
                      type="button"
                      onClick={() => openEditor(p)}
                      title="Edit this product"
                      style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: SF, color: colors.text }}
                    >
                      {p.coverImageUrl ? (
                        <img src={p.coverImageUrl} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flex: "0 0 auto" }} />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: colors.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
                          <ShoppingBag size={18} color={colors.accent} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                          <Pencil size={12} color={colors.textSubtle} style={{ flex: "0 0 auto" }} />
                        </div>
                        <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
                          {priceLabel(p)}
                          {p.live === false && <span style={{ color: colors.textSubtle }}> · Draft</span>}
                        </div>
                      </div>
                    </button>

                    {scope === "event" ? (
                      <button type="button" onClick={() => toggleEventAssign(p)} disabled={!!busyId} style={pill(assigned)}>
                        {busyId === p.id ? <Loader2 size={13} className="spin" /> : assigned ? <><Check size={13} /> Added</> : <><Plus size={13} /> Add</>}
                      </button>
                    ) : p.live === false ? (
                      <button type="button" onClick={() => openEditor(p)} style={pill(false)} title="Open the editor to finish and publish">
                        <Pencil size={13} /> Edit
                      </button>
                    ) : (
                      <button type="button" onClick={() => toggleMainHide(p)} disabled={!!busyId} style={pill(shownInMain)}>
                        {busyId === p.id ? <Loader2 size={13} className="spin" /> : shownInMain ? <><Check size={13} /> Shown</> : "Hidden"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* EARLY ACCESS (2026-07-06, Felix): creating new products is
                request-based until the buying flow is 100% — existing products
                stay fully manageable. Flip back: restore the /create?kind=product
                navigate button. */}
            <a
              href="mailto:hello@pullup.se?subject=Products%20early%20access"
              style={{ marginTop: 16, width: "100%", boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px", borderRadius: 12,
                border: `1px dashed ${colors.border}`, background: colors.surface, color: colors.textMuted, fontSize: 14, fontWeight: 700, textDecoration: "none", fontFamily: SF }}
            >
              <Plus size={16} /> New products are in early access — say hi to join
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export default RoomProductManager;
