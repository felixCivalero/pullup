// Admin-only QA lens. Two parts: (1) search ANY host/user/guest from the live DB
// and land on their room (/r/:id); (2) a STATUS lens that locks how every room
// you open renders — Host / Pulled up / RSVP'd / Waitlist / No session / Locked.
// The lens is a hard lock (never re-derived from event timing) and drives the
// real auth + permission gates, so you see the platform through every lens.
// Honored only because the backend re-verifies is_admin. Hidden for non-admins.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { authenticatedFetch } from "../../lib/api.js";
import { colors } from "../../theme/colors.js";

const LEVELS = [
  { v: "", label: "Real (me)" },
  { v: "host", label: "Host" },
  { v: "guest_pullup", label: "Pulled up" },
  { v: "guest_rsvp", label: "RSVP'd · lobby" },
  { v: "guest_waitlist", label: "Waitlist" },
  { v: "no_session", label: "No session" },
  { v: "no_access", label: "Locked" },
];

export function ViewAsBar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);

  let forceLevel = "";
  try { forceLevel = localStorage.getItem("pullup_force_level") || ""; } catch {}

  useEffect(() => {
    // Retire any leftover impersonation state — the lens is the status, never
    // "become this person". Stops a stale view-as header from lingering.
    try { localStorage.removeItem("pullup_view_as"); localStorage.removeItem("pullup_view_as_name"); } catch {}
    if (!user) { setIsAdmin(false); return; }
    let alive = true;
    authenticatedFetch("/admin/people-search?q=")
      .then((r) => { if (alive) setIsAdmin(r.ok); return r.ok ? r.json() : null; })
      .then((d) => { if (alive && d) setResults(d.people || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    const t = setTimeout(() => {
      authenticatedFetch(`/admin/people-search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setResults(d.people || []))
        .catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [q, isAdmin]);

  if (!isAdmin) return null;

  // The STATUS lens. Locked in localStorage so it persists across every room you
  // navigate to; reload so the current page re-resolves through the new lens.
  const setLevel = (v) => {
    try { v ? localStorage.setItem("pullup_force_level", v) : localStorage.removeItem("pullup_force_level"); } catch {}
    window.location.reload();
  };
  // View = land on this person's room. The status lens (above) controls how it
  // renders. No impersonation — you're you, looking through a chosen lens.
  const view = (p) => { setQ(""); setShowResults(false); navigate(`/r/${p.id}`); };
  const active = !!forceLevel;

  return (
    <div style={{ position: "fixed", bottom: 14, left: 14, zIndex: 2147483646, fontFamily: "-apple-system, system-ui, sans-serif" }}>
      {/* Results popover (opens upward — the bar is bottom-anchored) */}
      {showResults && results.length > 0 && (
        <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, width: 300, maxHeight: 280, overflowY: "auto", background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 12, boxShadow: "0 18px 50px rgba(0,0,0,0.22)", padding: 6 }}>
          {results.map((p) => (
            <button key={p.id} onMouseDown={(e) => { e.preventDefault(); view(p); }} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left", width: "100%", border: "none", background: "transparent", borderRadius: 8, padding: "7px 9px", cursor: "pointer" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
                {p.name}{p.hasAccount ? <span style={{ fontSize: 10.5, color: colors.accent, fontWeight: 700 }}> · host/account</span> : ""}
              </span>
              <span style={{ fontSize: 11, color: colors.textFaded, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{p.email}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, background: active ? "#1a1a1a" : "#fff", color: active ? "#fff" : colors.text, border: `1px solid ${active ? "#1a1a1a" : colors.border}`, borderRadius: 999, padding: "5px 6px 5px 12px", boxShadow: "0 6px 20px rgba(0,0,0,0.18)" }}>
        <span style={{ fontSize: 13 }}>👁</span>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setShowResults(true); }}
          onFocus={() => setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 150)}
          placeholder="view anyone's room…"
          style={{ width: 160, border: "none", outline: "none", background: "transparent", color: active ? "#fff" : colors.text, fontSize: 12.5, fontFamily: "inherit" }}
        />
        <span style={{ width: 1, height: 18, background: active ? "rgba(255,255,255,0.25)" : colors.border }} />
        <select
          value={forceLevel}
          onChange={(e) => setLevel(e.target.value)}
          title="Lens — render every room you open at this access status (locked)"
          style={{ border: "none", borderRadius: 999, padding: "5px 8px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", outline: "none", fontFamily: "inherit", background: active ? "rgba(255,255,255,0.16)" : colors.surfaceMuted, color: active ? "#fff" : colors.text }}
        >
          {LEVELS.map((l) => <option key={l.v} value={l.v} style={{ color: "#000" }}>{l.label}</option>)}
        </select>
        {active && (
          <button onMouseDown={(e) => { e.preventDefault(); setLevel(""); }} style={{ background: colors.accent, color: "#fff", border: "none", borderRadius: 999, padding: "4px 9px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Reset</button>
        )}
      </div>
    </div>
  );
}
