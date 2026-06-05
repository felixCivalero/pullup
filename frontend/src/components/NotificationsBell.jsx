// frontend/src/components/NotificationsBell.jsx
//
// The top-bar notifications bell. Notifications are ambient FACTS ("Eric signed
// up") — distinct from actionables, which live inside the Room. So they belong
// up here next to Settings, not in the Room body: a bell, a red dot when
// there's something unread, and a dropdown list on click.
//
// Unread is tracked by signal id in localStorage (the room signals don't carry
// absolute timestamps). Opening the dropdown marks everything seen.

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const SEEN_KEY = "pullup_seen_notifications";

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveSeen(set) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
}

export function NotificationsBell() {
  const navigate = useNavigate();
  const [signals, setSignals] = useState([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(loadSeen);
  const ref = useRef(null);

  const load = useCallback(() => {
    authenticatedFetch("/host/room")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.signals) setSignals(data.signals); })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const unread = signals.filter((s) => !seen.has(s.id)).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && signals.length) {
      // Mark everything currently shown as seen.
      const ns = new Set(seen);
      signals.forEach((s) => ns.add(s.id));
      setSeen(ns);
      saveSeen(ns);
    }
  }

  function onItem(s) {
    setOpen(false);
    // Take the host to where they can act on it. A message → pop the Messages
    // dock open on that exact person's thread. An RSVP / waitlist / attendance
    // → the event's guest list. Else → the Room.
    // Message / thank-a-guest → pop their thread (the action is to reply).
    if ((s.type === "message_in" || s.type === "attended") && s.personId) {
      window.dispatchEvent(new CustomEvent("pullup:open-thread", { detail: { personId: s.personId } }));
      return;
    }
    // RSVP / waitlist → the event's guest list (the action is to see/manage).
    if (s.eventId) { navigate(`/app/events/${s.eventId}/guests`); return; }
    navigate("/room");
  }

  const dot = { urgent: colors.accent, warm: colors.secondary, plain: colors.textSubtle };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        style={{
          width: 32, height: 32, borderRadius: "999px",
          border: `1px solid ${colors.border}`, background: open ? colors.surfaceMuted : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
          position: "relative", transition: "background 0.2s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = colors.surfaceMuted; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >
        <Bell size={16} style={{ color: colors.text, opacity: 0.85 }} />
        {unread > 0 && (
          <span style={{ position: "absolute", top: 4, right: 5, width: 8, height: 8, borderRadius: "50%", background: colors.accent, border: "1.5px solid #fff" }} />
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute", top: 40, right: 0, width: 340, maxHeight: 420, overflowY: "auto",
            background: "#fff", border: `1px solid ${colors.border}`, borderRadius: "16px",
            boxShadow: "0 16px 48px rgba(10,10,10,0.16)", zIndex: 40, fontFamily: SF, padding: "8px",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: colors.textSubtle, padding: "8px 10px 10px" }}>
            Notifications
          </div>
          {signals.length === 0 ? (
            <div style={{ padding: "14px 10px 18px", fontSize: "13px", color: colors.textSubtle }}>
              Nothing new.
            </div>
          ) : (
            signals.map((s) => (
              <button
                key={s.id}
                onClick={() => onItem(s)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: "10px", width: "100%", textAlign: "left",
                  background: "transparent", border: "none", borderRadius: "10px", padding: "10px",
                  cursor: "pointer", fontFamily: SF,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = colors.surfaceMuted; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot[s.kind] || dot.plain, marginTop: "5px", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "13px", lineHeight: 1.4, color: colors.text }}>{s.text}</span>
                  <span style={{ fontSize: "11px", color: colors.textSubtle }}>{s.time}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
