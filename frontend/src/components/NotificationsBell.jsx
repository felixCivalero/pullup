// frontend/src/components/NotificationsBell.jsx
//
// The top-bar notifications bell. Notifications are ambient FACTS ("Eric signed
// up") — distinct from actionables, which live inside the Room. So they belong
// up here next to Settings, not in the Room body: a bell, a red dot when
// there's something unread, and a dropdown on click.
//
// LIVE like messages: a Supabase Realtime subscription on the host's own
// person_events fires the instant a notable row lands (RSVP / waitlist / inbound
// message / attendance), so a new notification appears WITHOUT a refresh. We
// also re-pull on open and on window focus as a safety net.
//
// The dropdown has two tabs: "Live" (the last 24h, newest first, grows in
// realtime) and "History" (older, scrollable, back to a 48h window). Unread is
// tracked by signal id in localStorage; opening marks everything seen.

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { useRoomRealtime } from "../lib/useRoomRealtime.js";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const SEEN_KEY = "pullup_seen_notifications";
const LIVE_WINDOW_MS = 24 * 60 * 60 * 1000; // newer than this = "Live"; older = "History"

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveSeen(set) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
}

export function NotificationsBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("live"); // 'live' | 'history'
  const [seen, setSeen] = useState(loadSeen);
  // The "now" used for the Live/History split — stamped each time we (re)pull, so
  // it stays fresh without calling Date.now() during render.
  const [nowTick, setNowTick] = useState(0);
  const ref = useRef(null);
  const refetchTimer = useRef(null);

  const load = useCallback(() => {
    // The dedicated feed (48h window) — lighter than the full room read and the
    // source of an absolute `at` per item so we can split Live vs History.
    authenticatedFetch("/host/notifications/feed?hours=48")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data?.items)) setItems(data.items);
        setNowTick(Date.now());
      })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  // LIVE: a notable row landing in the spine → re-pull the feed (debounced so a
  // burst of inserts coalesces into one fetch). This is what makes the bell feel
  // instant, exactly like the messages dock.
  useRoomRealtime({
    onNotable: () => {
      clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(load, 350);
    },
  });
  useEffect(() => () => clearTimeout(refetchTimer.current), []);

  // Safety net — refresh when the host returns to the tab (realtime can drop on
  // a backgrounded tab / flaky network).
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const atMs = (s) => (s.at ? new Date(s.at).getTime() : 0);
  const live = items.filter((s) => nowTick - atMs(s) < LIVE_WINDOW_MS);
  const history = items.filter((s) => nowTick - atMs(s) >= LIVE_WINDOW_MS);
  const unread = items.filter((s) => !seen.has(s.id)).length;

  function markAllSeen() {
    if (!items.length) return;
    const ns = new Set(seen);
    items.forEach((s) => ns.add(s.id));
    setSeen(ns);
    saveSeen(ns);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) { setTab("live"); load(); markAllSeen(); }
  }

  function onItem(s) {
    setOpen(false);
    // Take the host to where they can act on it. A message / thank-a-guest →
    // pop their thread (the action is to reply).
    if ((s.type === "message_in" || s.type === "access_request" || s.type === "attended") && s.personId) {
      window.dispatchEvent(new CustomEvent("pullup:open-thread", { detail: { personId: s.personId } }));
      return;
    }
    // RSVP / waitlist → the event's guest list (the action is to see/manage).
    if (s.eventId) { navigate(`/app/events/${s.eventId}/guests`); return; }
    navigate("/room");
  }

  const dot = { urgent: colors.accent, warm: colors.secondary, plain: colors.textSubtle };

  const row = (s) => (
    <button
      key={s.id}
      onClick={() => onItem(s)}
      style={{
        display: "flex", alignItems: "flex-start", gap: "10px", width: "100%", textAlign: "left",
        background: seen.has(s.id) ? "transparent" : colors.accentSoft, border: "none", borderRadius: "10px",
        padding: "10px", cursor: "pointer", fontFamily: SF,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = colors.surfaceMuted; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = seen.has(s.id) ? "transparent" : colors.accentSoft; }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot[s.kind] || dot.plain, marginTop: "5px", flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: "13px", lineHeight: 1.4, color: colors.text }}>{s.text}</span>
        <span style={{ fontSize: "11px", color: colors.textSubtle }}>{s.time}</span>
      </span>
    </button>
  );

  const shown = tab === "live" ? live : history;
  const tabBtn = (key, label, count) => {
    const active = tab === key;
    return (
      <button
        onClick={() => setTab(key)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SF, fontSize: "12px", fontWeight: 700,
          padding: "6px 12px", borderRadius: "999px", cursor: "pointer", border: "none",
          background: active ? colors.text : "transparent", color: active ? "#fff" : colors.textSubtle,
        }}
      >
        {label}
        {count > 0 && (
          <span style={{ fontSize: "10.5px", fontWeight: 800, color: active ? "#fff" : colors.textSubtle, opacity: active ? 0.85 : 1 }}>{count}</span>
        )}
      </button>
    );
  };

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
            position: "absolute", top: 40, right: 0, width: 340,
            background: "#fff", border: `1px solid ${colors.border}`, borderRadius: "16px",
            boxShadow: "0 16px 48px rgba(10,10,10,0.16)", zIndex: 40, fontFamily: SF,
            display: "flex", flexDirection: "column", maxHeight: 460,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 10px 8px", borderBottom: `1px solid ${colors.borderFaint}` }}>
            {tabBtn("live", "Live", live.length)}
            {tabBtn("history", "History", history.length)}
          </div>
          <div style={{ overflowY: "auto", padding: "6px", flex: 1 }}>
            {shown.length === 0 ? (
              <div style={{ padding: "16px 10px 20px", fontSize: "13px", color: colors.textSubtle }}>
                {tab === "live" ? "Nothing new." : "Nothing older (last 48h)."}
              </div>
            ) : (
              shown.map(row)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
