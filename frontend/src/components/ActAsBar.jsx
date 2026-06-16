// Admin "Act as" — the superuser control for full session-swap impersonation.
// Renders three things for an admin: a discreet launcher pill, a persistent
// "acting as {host}" banner while a session is live, and the host picker.
//
// State lives in localStorage (read by lib/api.js viewAsHeaders → x-pullup-act-as)
// and we hard-reload on enter/exit so the WHOLE app re-fetches as the new
// identity. The banner is driven purely by localStorage, NOT the (now
// impersonated) profile's admin flag — so Exit is always reachable mid-session.
import { useState, useEffect, useCallback } from "react";
import { authenticatedFetch } from "../lib/api.js";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors.js";
import { Users, X, LogOut } from "lucide-react";

const GOLD = "#b45309";

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
  } catch {
    return null;
  }
}

export function ActAsBar({ isAdmin }) {
  const active = readActAs();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Search hosts whenever the picker is open and the query changes.
  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      authenticatedFetch(`/admin/impersonation/hosts?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { hosts: [] }))
        .then((d) => { if (!cancelled) setHosts(d.hosts || []); })
        .catch(() => { if (!cancelled) setHosts([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [pickerOpen, q]);

  function clearActAs() {
    try {
      localStorage.removeItem("pullup_act_as");
      localStorage.removeItem("pullup_act_as_name");
      localStorage.removeItem("pullup_act_as_email");
      localStorage.removeItem("pullup_act_as_log");
      localStorage.removeItem("pullup_actas_return");
    } catch {}
  }

  const startActAs = useCallback(async (host) => {
    setBusy(true);
    try {
      // 1. Mint the host's session + open the audit row (runs as the admin).
      const r = await authenticatedFetch("/admin/impersonation/start", {
        method: "POST",
        body: JSON.stringify({ targetUserId: host.id }),
      });
      if (!r.ok) throw new Error("start failed");
      const d = await r.json();
      if (!d.tokenHash) throw new Error("no session minted");

      // 2. Stash OUR (admin) session so Exit can restore it — survives reloads.
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

      // 3. Adopt the host's REAL session — from here we ARE the host end-to-end
      //    (identity, Realtime, every API call). Nothing left scoped to the admin.
      const { error } = await supabase.auth.verifyOtp({ token_hash: d.tokenHash, type: "magiclink" });
      if (error) throw error;

      window.location.href = "/room"; // hard reload — whole app re-resolves as the host
    } catch {
      clearActAs(); // never strand a half-switch
      setBusy(false);
      alert("Couldn't start the session. Try again.");
    }
  }, []);

  const exitActAs = useCallback(async () => {
    setBusy(true);
    const logId = active?.logId || "";

    // 1. Restore OUR admin session from the stash (refresh_token survives an
    //    expired access_token — Supabase re-mints on adoption).
    let restored = false;
    try {
      const raw = localStorage.getItem("pullup_actas_return");
      if (raw) {
        const t = JSON.parse(raw);
        const { error } = await supabase.auth.setSession({
          access_token: t.access_token,
          refresh_token: t.refresh_token,
        });
        restored = !error;
      }
    } catch { restored = false; }

    // 2. Now back as the admin — close the audit window (best-effort).
    await authenticatedFetch("/admin/impersonation/stop", {
      method: "POST",
      body: JSON.stringify({ logId }),
    }).catch(() => {});

    clearActAs();

    if (restored) {
      window.location.href = "/room";
    } else {
      // Couldn't restore the admin session — safest exit is a clean re-login.
      try { await supabase.auth.signOut({ scope: "local" }); } catch {}
      window.location.href = "/";
    }
  }, [active]);

  // Active session → persistent banner (shown regardless of impersonated admin
  // flag). Non-admins never reach here: only an admin could have set the key,
  // and the backend re-verifies admin on every request anyway.
  if (active) {
    return (
      <div
        style={{
          position: "fixed",
          bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9000,
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "9px 10px 9px 16px",
          borderRadius: "999px",
          background: GOLD,
          color: "#fff",
          boxShadow: "0 12px 32px rgba(180, 83, 9, 0.4)",
          fontSize: "13px",
          fontWeight: 600,
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
          <Users size={15} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Acting as {active.name || active.email || "host"}
          </span>
        </span>
        <button
          onClick={exitActAs}
          disabled={busy}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "6px 12px",
            borderRadius: "999px",
            border: "none",
            background: "rgba(255,255,255,0.22)",
            color: "#fff",
            fontSize: "12.5px",
            fontWeight: 700,
            cursor: busy ? "not-allowed" : "pointer",
            flexShrink: 0,
          }}
        >
          <LogOut size={13} />
          Exit
        </button>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <>
      {/* Launcher — discreet gold pill, bottom-left so it stays out of the way. */}
      <button
        onClick={() => { setQ(""); setHosts([]); setPickerOpen(true); }}
        title="Act as a host"
        style={{
          position: "fixed",
          bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          left: "16px",
          zIndex: 8000,
          display: "inline-flex",
          alignItems: "center",
          gap: "7px",
          padding: "8px 14px",
          borderRadius: "999px",
          border: `1px solid rgba(180,83,9,0.35)`,
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(8px)",
          color: GOLD,
          fontSize: "12.5px",
          fontWeight: 700,
          letterSpacing: "0.02em",
          cursor: "pointer",
          boxShadow: "0 6px 18px rgba(10,10,10,0.1)",
        }}
      >
        <Users size={14} />
        Act as
      </button>

      {pickerOpen && (
        <>
          <div
            onClick={() => setPickerOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 9100 }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "calc(100% - 48px)",
              maxWidth: "420px",
              maxHeight: "70vh",
              background: "#fff",
              border: "1px solid rgba(180,83,9,0.18)",
              borderRadius: "20px",
              boxShadow: "0 24px 64px rgba(10,10,10,0.24)",
              zIndex: 9101,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 12px" }}>
              <div style={{ fontSize: "15px", fontWeight: 700, color: colors.text }}>Act as a host</div>
              <button
                onClick={() => setPickerOpen(false)}
                aria-label="Close"
                style={{ width: 30, height: 30, borderRadius: "999px", border: "none", background: colors.surfaceMuted, color: colors.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: "0 20px 12px" }}>
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name or email…"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "11px 14px",
                  borderRadius: "12px",
                  border: `1px solid ${colors.border}`,
                  fontSize: "14px",
                  outline: "none",
                  color: colors.text,
                }}
              />
            </div>
            <div style={{ overflowY: "auto", padding: "0 8px 12px" }}>
              {loading ? (
                <div style={{ padding: "20px", textAlign: "center", color: colors.textMuted, fontSize: "13px" }}>Searching…</div>
              ) : hosts.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: colors.textMuted, fontSize: "13px" }}>No hosts found</div>
              ) : (
                hosts.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => startActAs(h)}
                    disabled={busy}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: "2px",
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: "none",
                      background: "transparent",
                      cursor: busy ? "not-allowed" : "pointer",
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = colors.surfaceMuted; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ fontSize: "14px", fontWeight: 600, color: colors.text }}>{h.name || "(no name)"}</span>
                    {h.email && <span style={{ fontSize: "12px", color: colors.textMuted }}>{h.email}</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
