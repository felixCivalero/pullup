// Admin-only "View as status" — navigate to any room/profile (admins bypass the
// gates) and flip the access status to preview each state. Honored only because
// the backend re-verifies is_admin; this is just the control. Hidden for non-admins.
import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { authenticatedFetch } from "../../lib/api.js";
import { colors } from "../../theme/colors.js";

const LEVELS = [
  { v: "", label: "Real (me)" },
  { v: "host", label: "Host" },
  { v: "guest_pullup", label: "Pulled up" },
  { v: "guest_rsvp", label: "RSVP'd · lobby" },
  { v: "guest_waitlist", label: "Waitlist" },
  { v: "no_access", label: "Locked" },
];

export function ViewAsBar() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  let forceLevel = "";
  try { forceLevel = localStorage.getItem("pullup_force_level") || ""; } catch {}

  useEffect(() => {
    // Drop any leftover person-impersonation from the earlier version.
    try { localStorage.removeItem("pullup_view_as"); localStorage.removeItem("pullup_view_as_name"); } catch {}
    if (!user) { setIsAdmin(false); return; }
    let alive = true;
    authenticatedFetch("/admin/people-search?q=")
      .then((r) => { if (alive) setIsAdmin(r.ok); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user]);

  if (!isAdmin) return null;

  const setLevel = (v) => {
    try { v ? localStorage.setItem("pullup_force_level", v) : localStorage.removeItem("pullup_force_level"); } catch {}
    window.location.reload();
  };
  const active = !!forceLevel;

  return (
    <div
      style={{
        position: "fixed", bottom: 14, left: 14, zIndex: 2147483646,
        display: "flex", alignItems: "center", gap: 8,
        background: active ? "#1a1a1a" : "#fff", color: active ? "#fff" : colors.text,
        border: `1px solid ${active ? "#1a1a1a" : colors.border}`, borderRadius: 999,
        padding: "6px 8px 6px 14px", boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
        fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 12.5, fontWeight: 700,
      }}
      title="Admin: preview this room/profile at any access status"
    >
      <span>👁 View as</span>
      <select
        value={forceLevel}
        onChange={(e) => setLevel(e.target.value)}
        style={{
          border: "none", borderRadius: 999, padding: "5px 10px", fontSize: 12.5, fontWeight: 700,
          cursor: "pointer", outline: "none", fontFamily: "inherit",
          background: active ? "rgba(255,255,255,0.16)" : colors.surfaceMuted, color: active ? "#fff" : colors.text,
        }}
      >
        {LEVELS.map((l) => <option key={l.v} value={l.v} style={{ color: "#000" }}>{l.label}</option>)}
      </select>
      {active && (
        <button onClick={() => setLevel("")} style={{ background: colors.accent, color: "#fff", border: "none", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          Reset
        </button>
      )}
    </div>
  );
}
