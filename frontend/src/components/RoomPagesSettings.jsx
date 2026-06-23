// frontend/src/components/RoomPagesSettings.jsx
//
// The host's "Pages" fold-down — which tabs the room shows. The Wall is the
// hero and always on; Chat and Shop are toggles. Sits in the room's quick-CTA
// row next to Room access + Team, same pill + fold-down grammar.

import { useEffect, useState } from "react";
import { LayoutGrid, ChevronDown, Images, MessageSquare, ShoppingBag } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { useToast } from "./Toast";
import { colors } from "../theme/colors.js";

const PAGES = [
  { key: "wall", label: "The wall", sub: "Photos & clips from the room", Icon: Images, locked: true },
  { key: "chat", label: "Chat", sub: "The room's live conversation", Icon: MessageSquare },
  { key: "shop", label: "Shop", sub: "Products you placed in the room", Icon: ShoppingBag },
];

function Toggle({ on, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-pressed={on}
      style={{
        width: 38, height: 22, borderRadius: 999, border: "none",
        background: on ? colors.accent : "rgba(10,10,10,0.14)",
        opacity: disabled ? 0.5 : 1, cursor: disabled ? "default" : "pointer",
        position: "relative", transition: "background 0.15s", flexShrink: 0,
      }}
    >
      <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
    </button>
  );
}

export function RoomPagesSettings({ eventId, pages, onChange }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(() => pages || null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Seed/refresh from the room-view payload; fall back to a fetch if it wasn't
  // there (e.g. the page was reached without the composed view).
  useEffect(() => {
    if (pages) { setLocal((cur) => (dirty ? cur : pages)); return; }
    let alive = true;
    authenticatedFetch(`/host/events/${eventId}/room-pages`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (alive && d?.pages) setLocal(d.pages); })
      .catch(() => {});
    return () => { alive = false; };
  }, [eventId, pages, dirty]);

  function toggle(key) {
    setLocal((p) => ({ ...p, [key]: !p[key] }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const r = await authenticatedFetch(`/host/events/${eventId}/room-pages`, {
        method: "PUT", body: JSON.stringify({ pages: { chat: local.chat, shop: local.shop } }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      const fresh = d.pages || local;
      setLocal(fresh);
      setDirty(false);
      onChange?.(fresh);
      showToast("Pages saved", "success");
    } catch {
      showToast("Couldn't save pages", "error");
    } finally {
      setSaving(false);
    }
  }

  const pill = {
    display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px",
    borderRadius: 999, border: `1px solid ${open ? colors.accent : colors.border}`,
    background: open ? colors.accentSoft : "#fff",
    color: open ? colors.accent : colors.text, fontSize: 13, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  };

  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} style={pill}>
        <LayoutGrid size={15} /> Pages
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{ width: "100%", marginTop: 10, border: `1px solid ${colors.border}`, borderRadius: 14, background: "#fff", padding: "16px 18px" }}>
          <p style={{ fontSize: 12.5, color: colors.textMuted, lineHeight: 1.5, margin: "0 0 14px" }}>
            Which tabs the room shows. The wall is the room now — it stays on. Turn the rest on or off.
          </p>
          {!local ? (
            <div style={{ fontSize: 13, color: colors.textMuted, padding: "8px 0" }}>Loading…</div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {PAGES.map((p) => {
                  const PageIcon = p.Icon;
                  return (
                  <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: colors.surfaceMuted, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <PageIcon size={16} color={colors.textMuted} strokeWidth={2.1} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 650, color: colors.text }}>
                        {p.label}{p.locked && <span style={{ fontSize: 11, color: colors.textSubtle, fontWeight: 500 }}> · always on</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: colors.textSubtle }}>{p.sub}</div>
                    </div>
                    <Toggle on={p.locked ? true : !!local[p.key]} disabled={p.locked} onClick={() => toggle(p.key)} />
                  </div>
                  );
                })}
              </div>
              {dirty && (
                <button
                  type="button" onClick={save} disabled={saving}
                  style={{ width: "100%", padding: "12px", borderRadius: 999, border: "none", background: colors.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: saving ? "wait" : "pointer", marginTop: 14 }}
                >
                  {saving ? "Saving…" : "Save pages"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
