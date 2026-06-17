// SettingsLayout — the two-pane "control center" Settings shell.
//
// A sticky left nav rail (sections grouped + ordered by priority, each with a
// status dot + a "N of 4 set up" nudge) and a focused content pane that renders
// only the selected section. On mobile the rail collapses to a horizontal
// segmented picker. Replaces the old single long-scroll HomeSettingsTab.
//
// The heavy section components are untouched — this only reframes how they're
// presented and resolves at-a-glance status for the dots.

import { useEffect, useMemo, useState } from "react";
import { User, Bell, CreditCard, MessageCircle, Instagram, Terminal, ArrowDownUp, BarChart3, Database, UserCog } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { openWhatsNew } from "../lib/whatsNew.js";

import { SettingsProfileSection } from "./SettingsProfileSection.jsx";
import { SettingsNotificationsSection } from "./SettingsNotificationsSection.jsx";
import { SettingsPaymentsSection } from "./SettingsPaymentsSection.jsx";
import { SettingsWhatsappSection } from "./SettingsWhatsappSection.jsx";
import { SettingsInstagramSection } from "./SettingsInstagramSection.jsx";
import { SettingsMcpIntegration } from "./SettingsMcpIntegration.jsx";
import { SettingsBillingSection } from "./SettingsBillingSection.jsx";
import { SettingsOwnDataSection } from "./SettingsOwnDataSection.jsx";
import { SettingsDataSection } from "./SettingsDataSection.jsx";
import { SettingsAccountSection } from "./SettingsAccountSection.jsx";

// dot: "done" (green) · "attention" (amber) · null (no dot — optional/neutral)
export function SettingsLayout({ user, setUser, onSave, showToast }) {
  // Status signals for the rail dots — fetched up-front so dots are correct on
  // load regardless of which pane is open, then kept live via callbacks.
  const [stripe, setStripe] = useState(null);     // { connected, chargesEnabled }
  const [notifEnabled, setNotifEnabled] = useState(null);
  const [byoConnected, setByoConnected] = useState(null);
  const [igConnected, setIgConnected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      authenticatedFetch("/host/stripe/connect/status").then((r) => (r.ok ? r.json() : null)),
      authenticatedFetch("/host/notifications").then((r) => (r.ok ? r.json() : null)),
      authenticatedFetch("/host/byo/status").then((r) => (r.ok ? r.json() : null)),
      authenticatedFetch("/instagram/connection").then((r) => (r.ok ? r.json() : null)),
    ]).then(([s, n, y, i]) => {
      if (cancelled) return;
      if (s.status === "fulfilled" && s.value) {
        setStripe({ connected: !!s.value.connected, chargesEnabled: !!s.value.accountDetails?.charges_enabled });
      }
      if (n.status === "fulfilled" && n.value) setNotifEnabled(!!n.value.enabled);
      if (y.status === "fulfilled" && y.value) setByoConnected(!!y.value.connected);
      if (i.status === "fulfilled" && i.value) setIgConnected((i.value.accounts || []).length > 0);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Status resolvers (drive the dots + the progress count) ──
  const profileDone = !!(user?.name && (user?.contactEmail || user?.email));
  const paymentsDot = stripe?.chargesEnabled ? "done" : stripe?.connected ? "attention" : null;
  const whatsappDot = user?.phone_verified_at ? "done" : null;
  const instagramDot = igConnected ? "done" : null;
  const notifDot = notifEnabled ? "done" : null;

  const sections = useMemo(() => {
    const list = [
      { key: "profile", label: "Profile", icon: User, group: "You", dot: profileDone ? "done" : "attention",
        render: () => <SettingsProfileSection user={user} setUser={setUser} onSave={onSave} showToast={showToast} /> },
      { key: "notifications", label: "Notifications", icon: Bell, group: "You", dot: notifDot,
        render: () => <SettingsNotificationsSection showToast={showToast} onEnabledChange={setNotifEnabled} /> },

      { key: "payments", label: "Payments", icon: CreditCard, group: "Get paid & reach", dot: paymentsDot,
        render: () => <SettingsPaymentsSection showToast={showToast} onStatus={(s) => setStripe({ connected: s.connected, chargesEnabled: s.chargesEnabled })} /> },
      { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, group: "Get paid & reach", dot: whatsappDot,
        render: () => <SettingsWhatsappSection user={user} setUser={setUser} onSave={onSave} showToast={showToast} /> },
      { key: "instagram", label: "Instagram", icon: Instagram, group: "Get paid & reach", dot: instagramDot,
        render: () => <SettingsInstagramSection showToast={showToast} onStatus={setIgConnected} /> },

      { key: "mcp", label: "PullUp MCP", icon: Terminal, group: "Power & data", dot: null,
        render: () => (
          <div>
            <div style={{ marginBottom: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px", color: colors.text }}>PullUp MCP</h2>
              <p style={{ fontSize: "14px", color: colors.textMuted }}>
                Manage your events conversationally from any AI assistant that speaks MCP — Claude, ChatGPT, Cursor, and more.
              </p>
            </div>
            <SettingsMcpIntegration showToast={showToast} />
            <button
              onClick={openWhatsNew}
              style={{ marginTop: "16px", background: "none", border: "none", padding: 0, color: colors.textMuted, fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = colors.text)}
              onMouseLeave={(e) => (e.currentTarget.style.color = colors.textMuted)}
            >
              Replay the “What’s new” tour →
            </button>
          </div>
        ) },
    ];
    list.push({ key: "data", label: "Own your data", icon: Database, group: "Power & data", dot: byoConnected ? "done" : null, render: () => <SettingsOwnDataSection /> });
    list.push({ key: "dataio", label: "Import & export", icon: ArrowDownUp, group: "Power & data", dot: null, render: () => <SettingsDataSection /> });
    if (byoConnected) list.push({ key: "billing", label: "Billing", icon: BarChart3, group: "Power & data", dot: null, render: () => <SettingsBillingSection /> });

    list.push({ key: "account", label: "Account", icon: UserCog, group: null, dot: null,
      render: () => <SettingsAccountSection showToast={showToast} /> });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, stripe, notifDot, paymentsDot, profileDone, whatsappDot, instagramDot, igConnected, byoConnected]);

  // Active section — deep-linkable via hash (#notifications), survives refresh.
  const [active, setActive] = useState(() => {
    const hash = (typeof window !== "undefined" && window.location.hash.replace("#", "")) || "";
    return hash || "profile";
  });
  useEffect(() => {
    if (!sections.find((s) => s.key === active)) setActive("profile");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  const selectSection = (key) => {
    setActive(key);
    try { window.history.replaceState(null, "", `#${key}`); } catch { /* noop */ }
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* noop */ }
  };

  // Progress nudge — the four actionable setup items.
  const dotted = ["profile", "payments", "whatsapp", "instagram", "notifications"];
  const doneCount = sections.filter((s) => dotted.includes(s.key) && s.dot === "done").length;

  const groups = [];
  for (const s of sections) {
    const g = groups.find((x) => x.label === s.group);
    if (g) g.items.push(s);
    else groups.push({ label: s.group, items: [s] });
  }

  const activeSection = sections.find((s) => s.key === active) || sections[0];

  return (
    <div className="settings-shell">
      <style>{SHELL_CSS}</style>

      {/* ── Desktop rail ── */}
      <nav className="settings-rail">
        <div className="settings-rail-card">
          <div style={{ padding: "4px 6px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: colors.textSubtle }}>Your setup</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted }}>{doneCount} of {dotted.length}</span>
            </div>
            <div style={{ height: 5, borderRadius: 999, background: colors.borderFaint, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(doneCount / dotted.length) * 100}%`, background: colors.accent, borderRadius: 999, transition: "width 0.3s ease" }} />
            </div>
          </div>

          {groups.map((g, gi) => (
            <div key={g.label || "account"} style={{ marginTop: gi === 0 ? 4 : 10, ...(g.label === null ? { borderTop: `1px solid ${colors.borderFaint}`, paddingTop: 10, marginTop: 14 } : {}) }}>
              {g.label && (
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: colors.textSubtle, padding: "6px 8px 4px" }}>
                  {g.label}
                </div>
              )}
              {g.items.map((s) => (
                <RailItem key={s.key} section={s} active={active === s.key} onClick={() => selectSection(s.key)} />
              ))}
            </div>
          ))}
        </div>
      </nav>

      {/* ── Mobile segmented picker ── */}
      <div className="settings-mobnav">
        {sections.map((s) => (
          <MobItem key={s.key} section={s} active={active === s.key} onClick={() => selectSection(s.key)} />
        ))}
      </div>

      {/* ── Content pane ── */}
      <main className="settings-pane">
        <div className="settings-pane-card">
          {activeSection.render()}
        </div>
      </main>
    </div>
  );
}

function Dot({ dot, size = 8 }) {
  if (!dot) return null;
  const color = dot === "done" ? colors.success : colors.warning;
  return <span style={{ width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}

function RailItem({ section, active, onClick }) {
  const Icon = section.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: "9px 10px", borderRadius: 10, border: "none", cursor: "pointer",
        background: active ? colors.accentSoft : "transparent",
        color: active ? colors.accent : colors.text,
        font: "inherit", fontSize: 14, fontWeight: active ? 650 : 500, textAlign: "left",
        transition: "background 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = colors.surfaceMuted; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <Icon size={16} style={{ flexShrink: 0, color: active ? colors.accent : colors.textSubtle }} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{section.label}</span>
      <Dot dot={section.dot} />
    </button>
  );
}

function MobItem({ section, active, onClick }) {
  const Icon = section.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0,
        padding: "8px 14px", borderRadius: 999, cursor: "pointer", font: "inherit",
        fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap",
        border: `1px solid ${active ? "transparent" : colors.border}`,
        background: active ? colors.accent : colors.backgroundCard,
        color: active ? "#fff" : colors.text,
        transition: "all 0.15s",
      }}
    >
      <Icon size={15} style={{ color: active ? "#fff" : colors.textSubtle }} />
      <span>{section.label}</span>
      {section.dot && !active && <Dot dot={section.dot} size={6} />}
    </button>
  );
}

const SHELL_CSS = `
  .settings-shell { display: flex; gap: 24px; align-items: flex-start; }
  .settings-rail { width: 240px; flex-shrink: 0; position: sticky; top: 88px; }
  .settings-rail-card {
    background: ${colors.backgroundCard};
    border: 1px solid ${colors.borderFaint};
    border-radius: 16px;
    padding: 10px;
  }
  .settings-mobnav { display: none; }
  .settings-pane { flex: 1; min-width: 0; }
  .settings-pane-card {
    background: ${colors.backgroundCard};
    border: 1px solid ${colors.borderFaint};
    border-radius: 16px;
    box-shadow: 0 1px 2px rgba(10,10,10,0.04);
    padding: clamp(20px, 4vw, 32px);
  }
  .settings-input {
    width: 100%; box-sizing: border-box; padding: 12px 16px; border-radius: 12px;
    border: 1px solid ${colors.border}; background: ${colors.surface}; color: ${colors.text};
    font-size: 15px; outline: none; transition: border-color 0.2s;
  }
  .settings-input:focus { border-color: ${colors.borderStrong}; }
  .settings-input::placeholder { color: ${colors.textSubtle}; }
  @media (max-width: 900px) {
    .settings-shell { flex-direction: column; gap: 14px; }
    .settings-rail { display: none; }
    .settings-mobnav {
      display: flex; gap: 8px; overflow-x: auto; width: 100%;
      padding-bottom: 6px; -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .settings-mobnav::-webkit-scrollbar { display: none; }
  }
`;
