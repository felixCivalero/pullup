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
import OwnDataWelcomeModal from "./OwnDataWelcomeModal.jsx";

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
  const [notice, setNotice] = useState(""); // friendly message from the OAuth bounce-back
  const [form, setForm] = useState({ dbUrl: "", serviceKey: "", mgmtToken: "" });
  const [welcomeOpen, setWelcomeOpen] = useState(false); // the "it worked" return-from-auth modal
  const [autoRan, setAutoRan] = useState(false); // mirror auto-kicked once after provision
  const [mirroredPeople, setMirroredPeople] = useState(null); // count to celebrate in the modal
  const [usage, setUsage] = useState(null); // real DB size from the creator's own project

  // The OAuth callback bounces back to /settings?byo=<code>. On the happy path
  // (provisioning) we float the welcome modal over the page and read the setup
  // back live; on the edge cases we surface a friendly message. Either way strip
  // the param so a refresh doesn't replay it.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const code = p.get("byo");
      if (!code) return;
      if (code === "provisioning") {
        setWelcomeOpen(true);
      } else {
        const MAP = {
          noorg: "We couldn't find or set up a Supabase organization on your account. Create one free at supabase.com, then click Connect with Supabase again.",
          badstate: "That connect link expired — please click Connect with Supabase again.",
          error: "Something went wrong connecting to Supabase. Please try again.",
        };
        if (MAP[code]) setNotice(MAP[code]);
      }
      p.delete("byo");
      const qs = p.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    } catch { /* */ }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await authenticatedFetch("/host/byo/status");
      if (r.ok) setState(await r.json());
    } catch { /* */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Once connected, read the project's real size so the pricing preview can say
  // "your database today: 320 MB → Free tier". Best-effort, purely informational.
  useEffect(() => {
    if (!state?.connected) return;
    let alive = true;
    (async () => {
      try {
        const r = await authenticatedFetch("/host/byo/usage");
        if (!r.ok) return;
        const b = await r.json().catch(() => ({}));
        if (alive && b?.usage) setUsage(b.usage);
      } catch { /* panel shows the slider only */ }
    })();
    return () => { alive = false; };
  }, [state?.connected]);

  // After the OAuth bounce-back (or any 'provisioning' state), poll finalize:
  // it returns ready once the creator's project is healthy + the schema is in.
  useEffect(() => {
    if (state?.db?.status !== "provisioning") return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await authenticatedFetch("/host/byo/oauth/finalize", { method: "POST" });
        const b = await r.json().catch(() => ({}));
        if (alive && b.ready) { await refresh(); }
      } catch { /* keep polling */ }
    };
    const id = setInterval(tick, 6000);
    tick();
    return () => { alive = false; clearInterval(id); };
  }, [state?.db?.status, refresh]);

  // Welcome flow only: once the structure is provisioned ('connected'), copy the
  // host's world in automatically so the modal can land on a populated, "it's
  // yours" finish — no extra click. Fires once; the manual 1·2·3 buttons stay
  // for re-runs and for the paste path (which never opens the modal).
  useEffect(() => {
    if (!welcomeOpen || autoRan) return;
    if (state?.db?.status !== "connected") return;
    setAutoRan(true);
    (async () => {
      setBusy("mirror");
      try {
        const r = await authenticatedFetch("/host/byo/mirror", { method: "POST" });
        const b = await r.json().catch(() => ({}));
        if (b?.counts && Number.isFinite(b.counts.people)) setMirroredPeople(b.counts.people);
      } catch { /* status will reflect the error */ }
      setBusy(null);
      await refresh();
    })();
  }, [welcomeOpen, autoRan, state?.db?.status, refresh]);

  async function startOauth() {
    setBusy("oauth"); setMsg("");
    try {
      const r = await authenticatedFetch("/host/byo/oauth/start");
      const b = await r.json().catch(() => ({}));
      if (b.url) window.location.assign(b.url);
      else setMsg(b.error || "Couldn't start Supabase connect");
    } catch (e) {
      setMsg(e?.message || "Couldn't start Supabase connect");
    } finally {
      setBusy(null);
    }
  }

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

  // Retry the failed step from inside the welcome modal: if the structure is
  // already in, re-run the copy; otherwise re-run provisioning (which then
  // auto-advances to the copy via the effect above).
  const retryWelcome = async () => {
    const hasSchema = !!state?.db?.schemaVersion;
    setAutoRan(false);
    setBusy(hasSchema ? "mirror" : "provision");
    try {
      const r = await authenticatedFetch(hasSchema ? "/host/byo/mirror" : "/host/byo/provision", { method: "POST" });
      const b = await r.json().catch(() => ({}));
      if (b?.counts && Number.isFinite(b.counts.people)) setMirroredPeople(b.counts.people);
    } catch { /* status reflects it */ }
    setBusy(null);
    await refresh();
  };

  // Welcome modal phase/steps derived from the live connection status.
  const wStatus = state?.db?.status;
  const wPhase = wStatus === "error" ? "error" : wStatus === "live" ? "success" : "working";
  const wSteps = [
    { key: "connect", label: "Connected to Supabase", state: "done" },
    { key: "structure", label: "Setting up your structure", state: ["connected", "mirroring", "live"].includes(wStatus) ? "done" : "active" },
    { key: "world", label: "Copying your world in", state: wStatus === "live" ? "done" : (wStatus === "connected" || wStatus === "mirroring") ? "active" : "pending" },
  ];
  const welcomeModal = welcomeOpen ? (
    <OwnDataWelcomeModal
      phase={wPhase}
      steps={wSteps}
      projectRef={state?.db?.projectRef}
      peopleCount={mirroredPeople}
      errorMsg={state?.db?.lastError}
      busy={!!busy}
      onRetry={retryWelcome}
      onClose={() => setWelcomeOpen(false)}
    />
  ) : null;

  // Always render — even when BYO is dormant for this deployment the host sees
  // the explainer + how the pricing works (so they understand it before it's
  // switched on). The full connect flow appears once the deployment enables BYO.
  const dormant = !state || !state.enabled;
  const db = state?.db;
  const connected = state?.connected;

  return (
    <div>
      {welcomeModal}
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px", color: colors.text }}>
          Own your data
        </h2>
        <p style={{ fontSize: "14px", color: colors.textMuted }}>
          Your people live in a database <strong>you own</strong>. PullUp runs on top — and you can lock us out anytime.
        </p>
      </div>

      <div style={{ padding: "20px", background: colors.surface, borderRadius: "14px", border: `1px solid ${colors.borderFaint}` }}>
        {notice && <div style={{ ...errStyle, marginTop: 0, marginBottom: "16px" }}>{notice}</div>}
        {dormant ? (
          <DormantExplainer />
        ) : !connected ? (
          <>
            <p style={{ fontSize: "13px", color: colors.textMuted, marginBottom: "16px", lineHeight: 1.5 }}>
              Connect a Supabase project you own. We'll set up the structure and copy your world into it — events, people, RSVPs, your whole timeline.
            </p>
            {state.oauthAvailable && (
              <>
                <button onClick={startOauth} disabled={busy} style={{ ...primaryBtn, marginBottom: "6px", opacity: busy ? 0.5 : 1 }}>
                  {busy === "oauth" ? "Opening Supabase…" : "Connect with Supabase"}
                </button>
                <p style={{ fontSize: "12px", color: colors.textMuted, margin: "0 0 16px", lineHeight: 1.5 }}>
                  No Supabase account yet? You'll create one free in the same step — we set up the project and copy your data automatically. <strong>You stay the owner</strong>; we never see your password.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "0 0 14px", color: colors.textFaded, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  <span style={{ flex: 1, height: 1, background: colors.border }} /> or paste a key <span style={{ flex: 1, height: 1, background: colors.border }} />
                </div>
              </>
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
            <p style={{ fontSize: "12px", color: colors.textMuted, margin: "12px 0 0", lineHeight: 1.5 }}>
              Don't have a project yet?{" "}
              <a href="https://supabase.com/dashboard/sign-up" target="_blank" rel="noreferrer" style={{ color: colors.accent, fontWeight: 600 }}>
                Create one free at supabase.com →
              </a>{" "}
              then come back and paste the URL + service role key.
            </p>
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

      <PricingPreview realDbBytes={usage?.dbBytes} />
    </div>
  );
}

// Shown when BYO is dormant for this deployment: the explainer + an inert
// connect CTA, so the host sees how it'll work before it's switched on.
function DormantExplainer() {
  return (
    <div>
      <p style={{ fontSize: 13.5, color: colors.textMuted, lineHeight: 1.55, margin: "0 0 14px" }}>
        Connect a Supabase project you own and PullUp sets up the structure and copies your whole world into it —
        events, people, RSVPs, your timeline. Your data lives in <strong>your</strong> database; PullUp runs on top,
        and you can revoke us anytime.
      </p>
      <button type="button" disabled style={{ ...primaryBtn, opacity: 0.5, cursor: "default" }}>
        Connect with Supabase
      </button>
      <p style={{ fontSize: 12, color: colors.textFaded, margin: "10px 0 0", lineHeight: 1.5 }}>
        Rolling out now — this lights up for your account shortly. Here's exactly how the pricing works:
      </p>
    </div>
  );
}

// What owning your data costs = SUPABASE'S OWN PRICE LIST, shown as their real
// tiers (mirrors supabase.com/pricing, checked 2026-07-05). PullUp takes no
// cut of the creator's Supabase bill — this is the invoice SUPABASE will send
// them, in USD because that's how it arrives.
const SUPABASE_TIERS = [
  {
    name: "Free",
    priceUsd: 0,
    tagline: "Plenty to start",
    includes: ["500 MB database", "1 GB file storage", "5 GB bandwidth"],
    maxDbGb: 0.5,
  },
  {
    name: "Pro",
    priceUsd: 25,
    tagline: "For a working creator",
    includes: ["8 GB database", "100 GB file storage", "250 GB bandwidth"],
    note: "then usage-based: $0.125/GB database · $0.09/GB bandwidth",
    maxDbGb: Infinity,
  },
  {
    name: "Team",
    priceUsd: 599,
    tagline: "Compliance & bigger orgs",
    includes: ["Everything in Pro", "SOC2, priority support", "Longer backups & logs"],
    maxDbGb: Infinity,
    dim: true, // almost nobody needs this — shown for honesty, visually quiet
  },
];

function fmtData(gb) {
  if (gb < 1) return `${Math.round(gb * 1000)} MB`;
  return `${gb % 1 === 0 ? gb : gb.toFixed(1)} GB`;
}

// Which Supabase tier a project of this size sits on (Free until its DB cap,
// then Pro — Team is a compliance choice, never a size necessity).
function tierForDbGb(gb) {
  return gb <= SUPABASE_TIERS[0].maxDbGb ? "Free" : "Pro";
}

function PricingPreview({ realDbBytes }) {
  const realGb = Number.isFinite(realDbBytes) && realDbBytes > 0 ? realDbBytes / 1e9 : null;
  const currentTier = realGb !== null ? tierForDbGb(realGb) : null;
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2, color: colors.text }}>
          What owning your data costs
        </h3>
        <p style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.5 }}>
          Your database is billed by Supabase, to you, at Supabase's own prices — these are their real tiers
          (supabase.com/pricing). <strong>PullUp adds nothing on top.</strong>
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SUPABASE_TIERS.map((t) => {
          const isCurrent = currentTier === t.name;
          return (
            <div
              key={t.name}
              style={{
                display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14,
                padding: "14px 16px", borderRadius: 12,
                border: `1px solid ${isCurrent ? colors.accentBorder : colors.borderFaint}`,
                background: isCurrent ? colors.accentSoft : colors.surface,
                opacity: t.dim && !isCurrent ? 0.65 : 1,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: colors.text }}>Supabase {t.name}</span>
                  <span style={{ fontSize: 12, color: colors.textMuted }}>{t.tagline}</span>
                  {isCurrent && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      you're here{realGb !== null ? ` · ${fmtData(realGb)}` : ""}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 4, lineHeight: 1.55 }}>
                  {t.includes.join(" · ")}
                  {t.note ? <span style={{ color: colors.textFaded }}> — {t.note}</span> : null}
                </div>
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: colors.text }}>
                  {t.priceUsd === 0 ? "$0" : `$${t.priceUsd}`}<span style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted }}>/mo</span>
                </div>
                <div style={{ fontSize: 11, color: colors.textFaded }}>billed by Supabase</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "12px 16px", marginTop: 10, borderRadius: 12, border: `1px solid ${colors.borderFaint}`, background: colors.surface }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: colors.accent }}>PullUp's cut of this bill</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: colors.accent }}>$0. Always.</span>
      </div>
      <p style={{ fontSize: 12, color: colors.textSubtle, lineHeight: 1.5, margin: "10px 0 0" }}>
        The bill arrives in your name, from Supabase — that's the point. Most creators run free; a busy one is on Pro.
      </p>
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
