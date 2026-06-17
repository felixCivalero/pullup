// src/components/SettingsBillingSection.jsx
//
// The host's money mirror — the REAL billing surface. It activates only once
// the host owns their data (a connected Supabase) and the transaction layer is
// live; otherwise it stays hidden (the pricing MODEL + preview live under
// Settings → Own your data, not here). Shows this month's motions, the storage
// markup line, and fees owed.

import { useEffect, useState } from "react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

const MOTION_LABELS = [
  { key: "rsvps", label: "RSVPs" },
  { key: "pullups", label: "Pull-ups" },
  { key: "ticketSales", label: "Tickets sold" },
];

function money(cents, currency) {
  const v = (cents / 100).toFixed(2).replace(/\.00$/, "");
  const cur = (currency || "usd").toUpperCase();
  return cur === "SEK" ? `${v} kr` : cur === "KES" ? `KSh ${v}` : cur === "USD" ? `$${v}` : `${v} ${cur}`;
}

export function SettingsBillingSection() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let alive = true;
    authenticatedFetch("/host/billing/summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (alive) setSummary(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Real billing only — dormant until the transaction layer is live for this
  // host. (The pricing model + 30% preview live under Own your data.)
  if (!summary || (!summary.metering && !summary.paymentsV2)) return null;

  const month = summary.month || {};
  const currencies = Object.entries(month.byCurrency || {});
  const totalFees = currencies.reduce((s, [, v]) => s + (v.feeCents || 0), 0);
  const plan = summary.plan || {};
  const storage = summary.storageService || { tierCents: 0, markupBps: 3000, feeCents: 0, currency: "usd" };
  const markupPct = ((storage.markupBps ?? 3000) / 100).toFixed(0);

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px", color: colors.text }}>Billing</h2>
        <p style={{ fontSize: "14px", color: colors.textMuted }}>
          This month — what moved and what you owe. A fee per paid ticket, and {markupPct}% on top of your own Supabase bill.
        </p>
      </div>

      <div style={{ padding: "20px", background: colors.surface, borderRadius: "14px", border: `1px solid ${colors.borderFaint}` }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ fontSize: "15px", fontWeight: 700, color: colors.text, textTransform: "capitalize" }}>
            {plan.plan || "starter"} plan
          </div>
          <div style={{ fontSize: "12px", color: colors.textMuted }}>
            {((plan.ticketFeeBps ?? 250) / 100).toFixed(1)}% per paid ticket · {markupPct}% on your storage
          </div>
        </div>

        {storage.tierCents > 0 && (
          <div style={{ padding: "14px 16px", marginBottom: "16px", background: colors.backgroundCard, borderRadius: "12px", border: `1px solid ${colors.borderFaint}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px", color: colors.textMuted, marginBottom: "5px" }}>
              <span>Your Supabase storage</span>
              <span>{money(storage.tierCents, storage.currency)}/mo</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 700, color: colors.text }}>
              <span>PullUp service ({markupPct}%)</span>
              <span>{money(storage.feeCents, storage.currency)}/mo</span>
            </div>
          </div>
        )}

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
      </div>
    </div>
  );
}
