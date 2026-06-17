// src/components/SettingsBillingSection.jsx
//
// The host's money mirror + a preview of how PullUp earns. Always visible so a
// host can understand the model BEFORE anything is live:
//   • per paid ticket — a small transaction fee
//   • storage — a 30% markup on top of their OWN Supabase tier (own-your-data)
// When the transaction layer is live (metering / payments v2) it also shows the
// real month: motions counted and fees owed. The storage line shows real
// numbers once the host connects their own Supabase; until then an interactive
// preview lets them see exactly how it'll read at each Supabase tier.

import { useEffect, useState } from "react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

const MOTION_LABELS = [
  { key: "rsvps", label: "RSVPs" },
  { key: "pullups", label: "Pull-ups" },
  { key: "ticketSales", label: "Tickets sold" },
];

// Mirrors backend services/billing/storageTiers.js (plan base price, v1).
const PREVIEW_PLANS = [
  { key: "free", label: "Free", cents: 0 },
  { key: "pro", label: "Pro", cents: 2500 },
  { key: "team", label: "Team", cents: 59900 },
];

function money(cents, currency) {
  const v = (cents / 100).toFixed(2).replace(/\.00$/, "");
  const cur = (currency || "usd").toUpperCase();
  return cur === "SEK" ? `${v} kr` : cur === "KES" ? `KSh ${v}` : cur === "USD" ? `$${v}` : `${v} ${cur}`;
}

export function SettingsBillingSection() {
  const [summary, setSummary] = useState(null);
  const [previewPlan, setPreviewPlan] = useState("pro");

  useEffect(() => {
    let alive = true;
    authenticatedFetch("/host/billing/summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (alive) setSummary(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const live = !!(summary && (summary.metering || summary.paymentsV2));
  const plan = summary?.plan || {};
  const ticketPct = ((plan.ticketFeeBps ?? 250) / 100).toFixed(1);
  const storage = summary?.storageService || { tierCents: 0, markupBps: 3000, feeCents: 0, currency: "usd" };
  const markupBps = storage.markupBps ?? 3000;
  const markupPct = (markupBps / 100).toFixed(0);
  const hasRealStorage = storage.tierCents > 0;

  const month = summary?.month || {};
  const currencies = Object.entries(month.byCurrency || {});
  const totalFees = currencies.reduce((s, [, v]) => s + (v.feeCents || 0), 0);

  const sel = PREVIEW_PLANS.find((p) => p.key === previewPlan) || PREVIEW_PLANS[1];
  const previewFee = Math.round((sel.cents * markupBps) / 10000);

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px", color: colors.text }}>Billing</h2>
        <p style={{ fontSize: "14px", color: colors.textMuted }}>
          How PullUp earns — a small fee per paid ticket, and a {markupPct}% markup on top of your own Supabase storage. Never for storing your people.
        </p>
      </div>

      <div style={{ padding: "20px", background: colors.surface, borderRadius: "14px", border: `1px solid ${colors.borderFaint}` }}>
        {/* Plan summary line */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ fontSize: "15px", fontWeight: 700, color: colors.text, textTransform: "capitalize" }}>
            {plan.plan || "starter"} plan
          </div>
          <div style={{ fontSize: "12px", color: colors.textMuted }}>
            {ticketPct}% per paid ticket · {markupPct}% on your storage
          </div>
        </div>

        {/* Storage — the recurring line. Real once a Supabase is connected;
            an interactive preview otherwise so the host can see how it reads. */}
        <div style={{ padding: "14px 16px", marginBottom: live ? "16px" : 0, background: colors.backgroundCard, borderRadius: "12px", border: `1px solid ${colors.borderFaint}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSubtle, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
            Storage — your data, your bill
          </div>

          {hasRealStorage ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px", color: colors.textMuted, marginBottom: "5px" }}>
                <span>Your Supabase storage</span>
                <span>{money(storage.tierCents, storage.currency)}/mo</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 700, color: colors.text }}>
                <span>PullUp service ({markupPct}%)</span>
                <span>{money(storage.feeCents, storage.currency)}/mo</span>
              </div>
            </>
          ) : (
            <>
              {/* plan picker */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {PREVIEW_PLANS.map((p) => {
                  const on = p.key === previewPlan;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPreviewPlan(p.key)}
                      style={{
                        flex: 1, padding: "8px 6px", borderRadius: 999, cursor: "pointer",
                        border: `1px solid ${on ? "transparent" : colors.border}`,
                        background: on ? colors.accent : colors.backgroundCard,
                        color: on ? "#fff" : colors.text, fontSize: 12.5, fontWeight: 600,
                        transition: "all 0.15s",
                      }}
                    >
                      {p.label}{p.cents ? ` · ${money(p.cents, "usd")}` : ""}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px", color: colors.textMuted, marginBottom: "5px" }}>
                <span>Your Supabase ({sel.label})</span>
                <span>{money(sel.cents, "usd")}/mo</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: 800, color: colors.accent }}>
                <span>PullUp service ({markupPct}%)</span>
                <span>{money(previewFee, "usd")}/mo</span>
              </div>
              <p style={{ fontSize: 12, color: colors.textSubtle, lineHeight: 1.5, margin: "12px 0 0" }}>
                Preview. Your people live in a database <strong>you own</strong> — PullUp is a simple {markupPct}% on top of that bill, nothing more. Real numbers appear here once you connect your own Supabase in <span style={{ color: colors.text, fontWeight: 600 }}>Own your data</span>.
              </p>
            </>
          )}
        </div>

        {/* Live month — only when the transaction layer is on for this host */}
        {live && (
          <>
            <div style={{ display: "flex", gap: "10px", marginBottom: currencies.length ? "16px" : 0 }}>
              {MOTION_LABELS.map(({ key, label }) => (
                <div key={key} style={{ flex: 1, padding: "12px", background: colors.backgroundCard, borderRadius: "10px", border: `1px solid ${colors.borderFaint}`, textAlign: "center" }}>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: colors.text }}>{month[key] ?? 0}</div>
                  <div style={{ fontSize: "11px", color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "2px" }}>{label}</div>
                </div>
              ))}
            </div>
            {currencies.length > 0 && (
              <div style={{ borderTop: `1px solid ${colors.borderFaint}`, paddingTop: "12px" }}>
                {currencies.map(([cur, v]) => (
                  <div key={cur} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: colors.textMuted, marginBottom: "4px" }}>
                    <span>Moved {money(v.grossCents || 0, cur)} this month</span>
                    <span>PullUp fee {money(v.feeCents || 0, cur)}</span>
                  </div>
                ))}
                {totalFees === 0 && (
                  <div style={{ fontSize: "12px", color: colors.textFaded, marginTop: "4px" }}>Nothing owed this month.</div>
                )}
              </div>
            )}
          </>
        )}

        {!live && (
          <p style={{ fontSize: 12, color: colors.textFaded, margin: "14px 0 0", textAlign: "center" }}>
            Billing is in preview — it turns on when you enable it.
          </p>
        )}
      </div>
    </div>
  );
}
