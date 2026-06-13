// src/components/SettingsBillingSection.jsx
//
// The host's money mirror: plan, this month's motions (RSVPs / pull-ups /
// ticket sales) and the fee PullUp earned on them. The section renders only
// when the transaction layer is actually live for this deployment (metering
// or payments v2 on) — otherwise hosts never see a dormant billing surface.
// The copy carries the model: you pay on motion, never on storage.

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

  // Dormant deployment → no surface at all.
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
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px", color: colors.text }}>
          Plan & usage
        </h2>
        <p style={{ fontSize: "14px", color: colors.textMuted }}>
          You pay when things move — a ticket sold, a pull-up at the door. Never for storing your people.
        </p>
      </div>

      <div
        style={{
          padding: "20px",
          background: colors.background,
          borderRadius: "12px",
          border: `1px solid ${colors.border}`,
          boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ fontSize: "15px", fontWeight: 700, color: colors.text, textTransform: "capitalize" }}>
            {plan.plan || "starter"} plan
          </div>
          <div style={{ fontSize: "12px", color: colors.textMuted }}>
            {((plan.ticketFeeBps ?? 250) / 100).toFixed(1)}% per paid ticket · {markupPct}% on your storage
          </div>
        </div>

        {/* The recurring line: your data lives in your own Supabase; PullUp is
            a service on top, priced as a transparent % of that bill. Dormant
            (tier 0) until the host owns their Supabase project. */}
        <div
          style={{
            padding: "12px 14px",
            marginBottom: "16px",
            background: colors.surface,
            borderRadius: "10px",
            border: `1px solid ${colors.border}`,
          }}
        >
          {storage.tierCents > 0 ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: colors.textMuted, marginBottom: "4px" }}>
                <span>Your Supabase storage</span>
                <span>{money(storage.tierCents, storage.currency)}/mo</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 600, color: colors.text }}>
                <span>PullUp service ({markupPct}%)</span>
                <span>{money(storage.feeCents, storage.currency)}/mo</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: "13px", color: colors.textMuted, lineHeight: 1.5 }}>
              Your people live in a database <strong>you own</strong>. When you bring your own Supabase,
              PullUp becomes a simple {markupPct}% on top of that bill — and nothing more. No storage fee from us today.
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px", marginBottom: currencies.length ? "16px" : 0 }}>
          {MOTION_LABELS.map(({ key, label }) => (
            <div
              key={key}
              style={{
                flex: 1,
                padding: "12px",
                background: colors.surface,
                borderRadius: "10px",
                border: `1px solid ${colors.border}`,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "20px", fontWeight: 700, color: colors.text }}>{month[key] ?? 0}</div>
              <div style={{ fontSize: "11px", color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "2px" }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {currencies.length > 0 && (
          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: "12px" }}>
            {currencies.map(([cur, v]) => (
              <div key={cur} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: colors.textMuted, marginBottom: "4px" }}>
                <span>Moved {money(v.grossCents || 0, cur)} this month</span>
                <span>PullUp fee {money(v.feeCents || 0, cur)}</span>
              </div>
            ))}
            {totalFees === 0 && (
              <div style={{ fontSize: "12px", color: colors.textFaded, marginTop: "4px" }}>
                Nothing owed this month.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
