// frontend/src/components/RoomAccessSettings.jsx
//
// The host's "Room access" grid — what RSVP'd (lobby) vs pulled-up guests can DO
// in the event room. The STATE (rsvp → pulled-up) is system-determined; this only
// sets capabilities. Deliberately tiny: 5 capabilities × 2 states. Lives in the
// host's event room (EventRoomPage).

import { useEffect, useState } from "react";
import { SlidersHorizontal, ChevronDown } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { useToast } from "./Toast";
import { colors } from "../theme/colors.js";

const CAP_LABELS = {
  read: "See the room",
  post: "Post messages",
  seeWho: "See who's here",
  upload: "Upload photos",
  download: "Download photos",
};
const CAP_ORDER = ["read", "post", "seeWho", "upload", "download"];

const STATES = [
  { key: "waitlist", label: "On the waitlist", sub: "Hoping for a spot — a peek by default" },
  { key: "rsvp", label: "Before the event", sub: "RSVP'd — the lobby" },
  { key: "pulledup", label: "At / after the event", sub: "Pulled up — earned the room" },
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
        opacity: disabled ? 0.45 : 1, cursor: disabled ? "default" : "pointer",
        position: "relative", transition: "background 0.15s", flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18,
        borderRadius: "50%", background: "#fff", transition: "left 0.15s",
        boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

export function RoomAccessSettings({ eventId }) {
  const { showToast } = useToast();
  const [perms, setPerms] = useState(null);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    authenticatedFetch(`/host/events/${eventId}/room-permissions`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (alive) setPerms(d.permissions); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [eventId]);

  function toggle(stateKey, cap) {
    // Pulled-up "read" is inviolable (they earned the room).
    if (stateKey === "pulledup" && cap === "read") return;
    setPerms((p) => ({ ...p, [stateKey]: { ...p[stateKey], [cap]: !p[stateKey][cap] } }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const r = await authenticatedFetch(`/host/events/${eventId}/room-permissions`, {
        method: "PUT", body: JSON.stringify({ permissions: perms }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      if (d.permissions) setPerms(d.permissions);
      setDirty(false);
      showToast("Room access saved", "success");
    } catch {
      showToast("Couldn't save room access", "error");
    } finally {
      setSaving(false);
    }
  }

  if (err) return null;

  // A pill that sits in the room's quick-CTA row (host only); clicking it folds
  // the access grid down full-width below the row. `width:100%` on the panel
  // makes it wrap onto its own line inside the flex-wrap CTA row.
  const pill = {
    display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px",
    borderRadius: 999, border: `1px solid ${open ? colors.accent : colors.border}`,
    background: open ? colors.accentSoft || "rgba(236,23,143,0.08)" : "#fff",
    color: open ? colors.accent : colors.text, fontSize: 13, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  };

  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} style={pill}>
        <SlidersHorizontal size={15} /> Room access
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{ width: "100%", marginTop: 10, border: `1px solid ${colors.border}`, borderRadius: 14, background: "#fff", padding: "16px 18px" }}>
          {!perms ? (
            <div style={{ fontSize: 13, color: colors.textMuted, padding: "8px 0" }}>Loading…</div>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: colors.textMuted, lineHeight: 1.5, margin: "0 0 14px" }}>
                The room is the same for everyone — this just sets what each state can do.
                Pulling up always opens the full room; you control the lobby.
              </p>
              {STATES.map((s) => (
                <div key={s.key} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 650, color: colors.text }}>{s.label}</div>
                  <div style={{ fontSize: 11.5, color: colors.textSubtle, marginBottom: 8 }}>{s.sub}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {CAP_ORDER.map((cap) => {
                      const locked = s.key === "pulledup" && cap === "read";
                      return (
                        <div key={cap} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 13.5, color: colors.text }}>
                            {CAP_LABELS[cap]}{locked && <span style={{ fontSize: 11, color: colors.textSubtle }}> · always on</span>}
                          </span>
                          <Toggle on={!!perms[s.key]?.[cap]} disabled={locked} onClick={() => toggle(s.key, cap)} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {dirty && (
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 999, border: "none",
                    background: colors.accent, color: "#fff", fontSize: 14, fontWeight: 700,
                    cursor: saving ? "wait" : "pointer", marginTop: 4,
                  }}
                >
                  {saving ? "Saving…" : "Save room access"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
