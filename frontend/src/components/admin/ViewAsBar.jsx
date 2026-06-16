// Admin-only superuser bar (one control, three powers):
//   1. ACT AS — search any account and BECOME them: a real Supabase session
//      swap (mint host session → adopt it → you ARE the host end-to-end). The
//      primary action; this is "choose a user to be", not a status.
//   2. View room — for people WITHOUT an account (nothing to become), land on
//      their room as a spectator (/r/:id).
//   3. Status lens (secondary) — force how every room you open renders
//      (Host / Pulled up / RSVP'd / Waitlist / Locked) without a real guest in
//      that state. A render lens, not impersonation.
// All of it is honored only because the backend re-verifies is_admin. While a
// swap is active the bar shows "Acting as X — Exit" regardless of admin flag
// (the swapped session is the host, a non-admin) so Exit is always reachable.
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { authenticatedFetch } from "../../lib/api.js";
import { supabase } from "../../lib/supabase";
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

const ACT_AS_KEYS = ["pullup_act_as", "pullup_act_as_name", "pullup_act_as_email", "pullup_act_as_log", "pullup_actas_return"];
function readActAs() {
  try {
    const id = localStorage.getItem("pullup_act_as");
    if (!id) return null;
    return {
      id,
      name: localStorage.getItem("pullup_act_as_name") || "",
      email: localStorage.getItem("pullup_act_as_email") || "",
      logId: localStorage.getItem("pullup_act_as_log") || "",
    };
  } catch { return null; }
}
function clearActAs() { try { ACT_AS_KEYS.forEach((k) => localStorage.removeItem(k)); } catch {} }

export function ViewAsBar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = readActAs();

  let forceLevel = "";
  try { forceLevel = localStorage.getItem("pullup_force_level") || ""; } catch {}

  // Admin probe — skipped while impersonating (the host session would 403, and
  // the active-state bar below renders without needing the admin flag anyway).
  useEffect(() => {
    try { localStorage.removeItem("pullup_view_as"); localStorage.removeItem("pullup_view_as_name"); } catch {}
    const impersonating = (() => { try { return !!localStorage.getItem("pullup_act_as"); } catch { return false; } })();
    if (!user || impersonating) { return; }
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

  // BECOME a user — real session swap. Stash our admin session first so Exit can
  // restore it, then adopt the minted host session and hard-reload as them.
  const becomeUser = useCallback(async (p) => {
    setBusy(true);
    try {
      const r = await authenticatedFetch("/admin/impersonation/start", {
        method: "POST",
        body: JSON.stringify({ targetUserId: p.authUserId }),
      });
      if (!r.ok) throw new Error("start failed");
      const d = await r.json();
      if (!d.tokenHash) throw new Error("no session minted");

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.refresh_token) {
        localStorage.setItem("pullup_actas_return", JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }));
      }
      localStorage.setItem("pullup_act_as", d.target.id);
      localStorage.setItem("pullup_act_as_name", d.target.name || "");
      localStorage.setItem("pullup_act_as_email", d.target.email || "");
      localStorage.setItem("pullup_act_as_log", d.logId || "");

      const { error } = await supabase.auth.verifyOtp({ token_hash: d.tokenHash, type: "magiclink" });
      if (error) throw error;
      window.location.href = "/room";
    } catch {
      clearActAs();
      setBusy(false);
      alert("Couldn't act as that user. Try again.");
    }
  }, []);

  const exitActAs = useCallback(async () => {
    setBusy(true);
    const logId = active?.logId || "";
    let restored = false;
    try {
      const raw = localStorage.getItem("pullup_actas_return");
      if (raw) {
        const t = JSON.parse(raw);
        const { error } = await supabase.auth.setSession({ access_token: t.access_token, refresh_token: t.refresh_token });
        restored = !error;
      }
    } catch { restored = false; }
    await authenticatedFetch("/admin/impersonation/stop", {
      method: "POST",
      body: JSON.stringify({ logId }),
    }).catch(() => {});
    clearActAs();
    if (restored) window.location.href = "/room";
    else { try { await supabase.auth.signOut({ scope: "local" }); } catch {} window.location.href = "/"; }
  }, [active]);

  // ACTIVE — a swap is live. Always render (the host session is a non-admin, so
  // we can't gate on isAdmin) so Exit is reachable from anywhere.
  if (active) {
    return (
      <div style={{ position: "fixed", bottom: 14, left: 14, zIndex: 2147483646, fontFamily: "-apple-system, system-ui, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#b45309", color: "#fff", border: "1px solid #b45309", borderRadius: 999, padding: "6px 8px 6px 14px", boxShadow: "0 8px 24px rgba(180,83,9,0.38)", maxWidth: "min(92vw, 360px)" }}>
          <span style={{ fontSize: 13 }}>👁</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Acting as {active.name || active.email || "host"}
          </span>
          <button
            onClick={exitActAs}
            disabled={busy}
            style={{ background: "rgba(255,255,255,0.22)", color: "#fff", border: "none", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", flexShrink: 0 }}
          >
            Exit
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const setLevel = (v) => {
    try { v ? localStorage.setItem("pullup_force_level", v) : localStorage.removeItem("pullup_force_level"); } catch {}
    window.location.reload();
  };
  const lensActive = !!forceLevel;
  // Primary: an account → BECOME them. No account → view their room as a lens.
  const pick = (p) => {
    setShowResults(false); setQ("");
    if (p.authUserId) becomeUser(p);
    else navigate(`/r/${p.id}`);
  };

  return (
    <div style={{ position: "fixed", bottom: 14, left: 14, zIndex: 2147483646, fontFamily: "-apple-system, system-ui, sans-serif" }}>
      {showResults && results.length > 0 && (
        <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, width: 320, maxHeight: 300, overflowY: "auto", background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 12, boxShadow: "0 18px 50px rgba(0,0,0,0.22)", padding: 6 }}>
          {results.map((p) => (
            <button key={p.id} onMouseDown={(e) => { e.preventDefault(); pick(p); }} disabled={busy} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left", width: "100%", border: "none", background: "transparent", borderRadius: 8, padding: "8px 9px", cursor: busy ? "not-allowed" : "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.surfaceMuted; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
                {p.name}
                {p.authUserId
                  ? <span style={{ fontSize: 10.5, color: "#b45309", fontWeight: 800 }}> · become</span>
                  : <span style={{ fontSize: 10.5, color: colors.textFaded, fontWeight: 700 }}> · view room</span>}
              </span>
              <span style={{ fontSize: 11, color: colors.textFaded, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>{p.email}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, background: lensActive ? "#1a1a1a" : "#fff", color: lensActive ? "#fff" : colors.text, border: `1px solid ${lensActive ? "#1a1a1a" : colors.border}`, borderRadius: 999, padding: "5px 6px 5px 12px", boxShadow: "0 6px 20px rgba(0,0,0,0.18)" }}>
        <span style={{ fontSize: 13 }}>👁</span>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setShowResults(true); }}
          onFocus={() => setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 150)}
          placeholder="act as anyone…"
          style={{ width: 160, border: "none", outline: "none", background: "transparent", color: lensActive ? "#fff" : colors.text, fontSize: 12.5, fontFamily: "inherit" }}
        />
        <span style={{ width: 1, height: 18, background: lensActive ? "rgba(255,255,255,0.25)" : colors.border }} />
        <select
          value={forceLevel}
          onChange={(e) => setLevel(e.target.value)}
          title="Lens — render every room you open at this access status (locked)"
          style={{ border: "none", borderRadius: 999, padding: "5px 8px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", outline: "none", fontFamily: "inherit", background: lensActive ? "rgba(255,255,255,0.16)" : colors.surfaceMuted, color: lensActive ? "#fff" : colors.text }}
        >
          {LEVELS.map((l) => <option key={l.v} value={l.v} style={{ color: "#000" }}>{l.label}</option>)}
        </select>
        {lensActive && (
          <button onMouseDown={(e) => { e.preventDefault(); setLevel(""); }} style={{ background: colors.accent, color: "#fff", border: "none", borderRadius: 999, padding: "4px 9px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Reset</button>
        )}
      </div>
    </div>
  );
}
