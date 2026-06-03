// Admin-only "View as" — walk across any user and see/act as them, or force an
// access status, for QA. Honored only because the backend re-verifies is_admin;
// this UI is just the controls. Renders nothing for non-admins.
import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { authenticatedFetch } from "../../lib/api.js";
import { colors } from "../../theme/colors.js";

const LEVELS = [
  { v: "", label: "— real status —" },
  { v: "host", label: "Host" },
  { v: "guest_pullup", label: "Pulled up" },
  { v: "guest_rsvp", label: "RSVP'd (lobby)" },
  { v: "guest_waitlist", label: "Waitlist" },
  { v: "no_access", label: "Locked / no access" },
];

const ls = {
  get: (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} },
};

export function ViewAsBar() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);

  const activeId = ls.get("pullup_view_as");
  const activeName = ls.get("pullup_view_as_name");
  const forceLevel = ls.get("pullup_force_level");
  const active = !!activeId || !!forceLevel;

  // Admin check (only when logged in): a 200 from the admin endpoint => admin,
  // and we reuse its payload to pre-fill the picker.
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    let alive = true;
    authenticatedFetch("/admin/people-search?q=")
      .then((r) => { if (alive) setIsAdmin(r.ok); return r.ok ? r.json() : null; })
      .then((d) => { if (alive && d) setResults(d.people || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user]);

  // Live search.
  useEffect(() => {
    if (!isAdmin || !open) return;
    const t = setTimeout(() => {
      authenticatedFetch(`/admin/people-search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setResults(d.people || []))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q, isAdmin, open]);

  if (!isAdmin) return null;

  const pickUser = (p) => { ls.set("pullup_view_as", p.id); ls.set("pullup_view_as_name", p.name || p.email || "user"); window.location.reload(); };
  const setLevel = (v) => { ls.set("pullup_force_level", v); window.location.reload(); };
  const exit = () => { ls.set("pullup_view_as", ""); ls.set("pullup_view_as_name", ""); ls.set("pullup_force_level", ""); window.location.reload(); };

  const panel = open && (
    <div style={{ position: "fixed", bottom: 56, left: 14, zIndex: 2147483646, width: 300, background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 14, boxShadow: "0 18px 50px rgba(0,0,0,0.22)", padding: 12, fontFamily: "-apple-system, system-ui, sans-serif" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.textFaded, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>View as user</div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…"
        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 9, border: `1px solid ${colors.border}`, fontSize: 13, outline: "none", marginBottom: 8 }} />
      <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {results.map((p) => (
          <button key={p.id} onClick={() => pickUser(p)} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left", border: "none", background: p.id === activeId ? colors.accentSoft : "transparent", borderRadius: 8, padding: "7px 9px", cursor: "pointer" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{p.name}{p.hasAccount ? " · account" : ""}</span>
            <span style={{ fontSize: 11, color: colors.textFaded, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>{p.email}</span>
          </button>
        ))}
        {results.length === 0 && <div style={{ fontSize: 12, color: colors.textFaded, padding: "6px 9px" }}>No matches.</div>}
      </div>
      <div style={{ marginTop: 10, borderTop: `1px solid ${colors.borderFaint || colors.border}`, paddingTop: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: colors.textFaded, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Force status (this event)</div>
        <select value={forceLevel} onChange={(e) => setLevel(e.target.value)} style={{ width: "100%", padding: "7px 9px", borderRadius: 9, border: `1px solid ${colors.border}`, fontSize: 13, background: "#fff" }}>
          {LEVELS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
        </select>
      </div>
    </div>
  );

  return (
    <>
      {active && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 2147483647, background: "#1a1a1a", color: "#fff", fontSize: 12.5, fontWeight: 600, padding: "6px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontFamily: "-apple-system, system-ui, sans-serif" }}>
          <span>👁 Admin view{activeName ? <> · as <b>{activeName}</b></> : ""}{forceLevel ? <> · forcing <b>{forceLevel}</b></> : ""}</span>
          <button onClick={() => setOpen((o) => !o)} style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 999, padding: "3px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Change</button>
          <button onClick={exit} style={{ background: colors.accent, color: "#fff", border: "none", borderRadius: 999, padding: "3px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Exit</button>
        </div>
      )}
      {!active && (
        <button onClick={() => setOpen((o) => !o)} style={{ position: "fixed", bottom: 14, left: 14, zIndex: 2147483646, background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 999, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 20px rgba(0,0,0,0.25)", fontFamily: "-apple-system, system-ui, sans-serif" }}>
          👁 View as
        </button>
      )}
      {panel}
    </>
  );
}
