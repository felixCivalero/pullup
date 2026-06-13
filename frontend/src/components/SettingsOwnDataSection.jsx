// src/components/SettingsOwnDataSection.jsx
//
// "Own your data" — the in-product surface for BYO Supabase. Renders only when
// the deployment has BYO enabled (the status endpoint says so), so it's dormant
// everywhere else. Drives the proven pipeline from the UI:
//   not connected → connect (paste a project's URL + service key, optional
//                   Management token) → provision the schema → mirror the data
//                   → verify counts. Disconnect = the kill switch.
//
// The paste flow is the path that works today (and that we proved live). The
// keyless "Connect with Supabase" OAuth button lights up only once the OAuth
// app is registered (status.oauthAvailable) — until then we lead with paste.

import { useEffect, useState, useCallback } from "react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

const STATUS_COPY = {
  connecting: "Connecting…",
  connected: "Connected — schema ready",
  provisioning: "Setting up your database…",
  mirroring: "Copying your world across…",
  live: "Live — your data is in your database",
  revoked: "Disconnected",
  error: "Something went wrong",
};

export function SettingsOwnDataSection() {
  const [state, setState] = useState(null); // status payload
  const [busy, setBusy] = useState(null); // which action is running
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ dbUrl: "", serviceKey: "", mgmtToken: "" });

  const refresh = useCallback(async () => {
    try {
      const r = await authenticatedFetch("/host/byo/status");
      if (r.ok) setState(await r.json());
    } catch { /* */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function act(label, run) {
    setBusy(label);
    setMsg("");
    try {
      const r = await run();
      const body = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(body.reason || body.message || body.error || "Failed");
      else if (body.reason) setMsg(body.reason);
      await refresh();
    } catch (e) {
      setMsg(e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  }

  const connect = () =>
    act("connect", () =>
      authenticatedFetch("/host/byo/connect", {
        method: "POST",
        body: JSON.stringify({
          dbUrl: form.dbUrl.trim(),
          serviceKey: form.serviceKey.trim(),
          mgmtToken: form.mgmtToken.trim() || null,
        }),
      })
    );
  const provision = () => act("provision", () => authenticatedFetch("/host/byo/provision", { method: "POST" }));
  const mirror = () => act("mirror", () => authenticatedFetch("/host/byo/mirror", { method: "POST" }));
  const verify = () => act("verify", () => authenticatedFetch("/host/byo/verify"));
  const disconnect = () => {
    if (!window.confirm("Disconnect your database? PullUp falls back to its shared storage; your project and its data stay yours.")) return;
    act("disconnect", () => authenticatedFetch("/host/byo/disconnect", { method: "POST" }));
  };

  // Dormant deployment → no surface at all.
  if (!state || !state.enabled) return null;

  const db = state.db;
  const connected = state.connected;

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px", color: colors.text }}>
          Own your data
        </h2>
        <p style={{ fontSize: "14px", color: colors.textMuted }}>
          Your people live in a database <strong>you own</strong>. PullUp runs on top — and you can lock us out anytime.
        </p>
      </div>

      <div style={{ padding: "20px", background: colors.background, borderRadius: "12px", border: `1px solid ${colors.border}`, boxShadow: "0 8px 30px rgba(10,10,10,0.06)" }}>
        {!connected ? (
          <>
            <p style={{ fontSize: "13px", color: colors.textMuted, marginBottom: "16px", lineHeight: 1.5 }}>
              Connect a Supabase project you own. We'll set up the structure and copy your world into it — events, people, RSVPs, your whole timeline.
            </p>
            {state.oauthAvailable && (
              <a
                href="/api/host/byo/oauth/start"
                style={{ ...primaryBtn, display: "inline-block", textDecoration: "none", marginBottom: "14px" }}
              >
                Connect with Supabase
              </a>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Field label="Supabase project URL" placeholder="https://xxxx.supabase.co" value={form.dbUrl} onChange={(v) => setForm({ ...form, dbUrl: v })} />
              <Field label="Service role key" placeholder="paste from Settings → API" value={form.serviceKey} onChange={(v) => setForm({ ...form, serviceKey: v })} mono />
              <Field label="Management token (optional — enables auto-setup)" placeholder="sbp_…" value={form.mgmtToken} onChange={(v) => setForm({ ...form, mgmtToken: v })} mono />
            </div>
            {msg && <div style={errStyle}>{msg}</div>}
            <button onClick={connect} disabled={busy || !form.dbUrl || !form.serviceKey} style={{ ...primaryBtn, marginTop: "14px", opacity: busy || !form.dbUrl || !form.serviceKey ? 0.5 : 1 }}>
              {busy === "connect" ? "Connecting…" : "Connect"}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: colors.text }}>{STATUS_COPY[db?.status] || db?.status}</div>
                {db?.projectRef && <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: "2px" }}>{db.projectRef} · schema v{db.schemaVersion || 0}{db.systemOfRecord ? " · system of record" : ""}</div>}
              </div>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: db?.status === "live" ? "#22c55e" : db?.status === "error" ? "#ef4444" : "#f59e0b" }} />
            </div>
            {db?.lastError && <div style={errStyle}>{db.lastError}</div>}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button onClick={provision} disabled={!!busy} style={stepBtn}>{busy === "provision" ? "Setting up…" : "1 · Set up structure"}</button>
              <button onClick={mirror} disabled={!!busy} style={stepBtn}>{busy === "mirror" ? "Copying…" : "2 · Copy my data"}</button>
              <button onClick={verify} disabled={!!busy} style={stepBtn}>{busy === "verify" ? "Checking…" : "3 · Verify"}</button>
            </div>
            {msg && <div style={{ ...errStyle, background: colors.surface, color: colors.textMuted }}>{msg}</div>}
            <button onClick={disconnect} disabled={!!busy} style={{ marginTop: "16px", background: "none", border: "none", color: "#ef4444", fontSize: "13px", fontWeight: 600, cursor: "pointer", padding: 0 }}>
              Disconnect (kill switch)
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, placeholder, value, onChange, mono }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <span style={{ fontSize: "11px", fontWeight: 600, color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        style={{ padding: "10px 12px", borderRadius: "8px", border: `1px solid ${colors.border}`, background: "#fff", color: colors.text, fontSize: "14px", outline: "none", fontFamily: mono ? "ui-monospace, monospace" : "inherit" }}
      />
    </label>
  );
}

const primaryBtn = {
  padding: "12px 18px",
  borderRadius: "10px",
  border: "none",
  background: colors.text,
  color: "#fff",
  fontSize: "14px",
  fontWeight: 700,
  cursor: "pointer",
};

const stepBtn = {
  padding: "10px 14px",
  borderRadius: "10px",
  border: `1px solid ${colors.border}`,
  background: colors.surface,
  color: colors.text,
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

const errStyle = {
  marginTop: "12px",
  padding: "10px 12px",
  borderRadius: "8px",
  background: "rgba(239,68,68,0.08)",
  border: "1px solid rgba(239,68,68,0.2)",
  fontSize: "13px",
  color: "#ef4444",
};
