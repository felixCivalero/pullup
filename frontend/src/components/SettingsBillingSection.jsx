// src/components/SettingsBillingSection.jsx
//
// The host's money mirror — the REAL billing surface. Activates only once the
// transaction layer is live for this host; otherwise hidden (the pricing MODEL
// + preview live under Settings → Own your data). It reflects the ONLY two
// things PullUp ever charges for: a fee on ticket SALES (a transaction), and
// DATA (the storage markup). RSVPs and pull-ups are always free, so they're
// not shown here.

import { useEffect, useState } from "react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

function money(cents, currency) {
  const v = (cents / 100).toFixed(2).replace(/\.00$/, "");
  const cur = (currency || "usd").toUpperCase();
  return cur === "SEK" ? `${v} kr` : cur === "KES" ? `KSh ${v}` : cur === "USD" ? `$${v}` : `${v} ${cur}`;
}

const sectionLabel = {
  fontSize: 11,
  fontWeight: 700,
  color: colors.textSubtle,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 10,
};
const block = {
  padding: "14px 16px",
  marginBottom: 12,
  background: colors.backgroundCard,
  borderRadius: 12,
  border: `1px solid ${colors.borderFaint}`,
};
const muted = { fontSize: 13, color: colors.textMuted, lineHeight: 1.5 };

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

  // Always render so the host can see exactly how their bill reads. `live` is
  // true once the transaction layer is on for them; until then it's a preview.
  const live = !!(summary && (summary.metering || summary.paymentsV2));
  const month = summary?.month || {};
  const currencies = Object.entries(month.byCurrency || {});
  const plan = summary?.plan || {};
  const storage = summary?.storageService || { tierCents: 0, markupBps: 3000, feeCents: 0, currency: "usd" };
  const markupPct = ((storage.markupBps ?? 3000) / 100).toFixed(0);
  const ticketFeePct = ((plan.ticketFeeBps ?? 250) / 100).toFixed(1);
  const ticketsSold = month.ticketSales ?? 0;
  const soldCurrencies = currencies.filter(([, v]) => (v.grossCents || 0) > 0 || (v.feeCents || 0) > 0);

  // What's owed this month, by currency — ticket fees + the data markup.
  const owed = {};
  for (const [cur, v] of currencies) {
    const k = (cur || "usd").toUpperCase();
    owed[k] = (owed[k] || 0) + (v.feeCents || 0);
  }
  if ((storage.feeCents || 0) > 0) {
    const k = (storage.currency || "usd").toUpperCase();
    owed[k] = (owed[k] || 0) + storage.feeCents;
  }
  const owedEntries = Object.entries(owed).filter(([, c]) => c > 0);

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px", color: colors.text }}>Billing</h2>
        <p style={{ fontSize: "14px", color: colors.textMuted }}>
          The only things PullUp charges for: a {ticketFeePct}% fee on your ticket sales, and {markupPct}% on your data. RSVPs and pull-ups are always free.
        </p>
      </div>

      <div style={{ padding: "20px", background: colors.surface, borderRadius: "14px", border: `1px solid ${colors.borderFaint}` }}>
        {!live && (
          <div style={{ marginBottom: 16, padding: "10px 12px", borderRadius: 10, background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, fontSize: 12.5, color: colors.textMuted, lineHeight: 1.5 }}>
            Preview — this is exactly how your bill will read. Nothing's charged until you start selling tickets or connect your own data.
          </div>
        )}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ fontSize: "15px", fontWeight: 700, color: colors.text, textTransform: "capitalize" }}>
            {plan.plan || "starter"} plan
          </div>
          <div style={{ fontSize: "12px", color: colors.textMuted }}>
            {ticketFeePct}% per ticket sold · {markupPct}% on data
          </div>
        </div>

        {/* Ticket sales — a fee only on money that actually moved */}
        <div style={block}>
          <div style={sectionLabel}>Ticket sales</div>
          {soldCurrencies.length > 0 ? (
            <>
              {soldCurrencies.map(([cur, v]) => (
                <div key={cur} style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px", marginBottom: 5 }}>
                  <span style={{ color: colors.textMuted }}>Sold {money(v.grossCents || 0, cur)}</span>
                  <span style={{ color: colors.text, fontWeight: 600 }}>PullUp fee {money(v.feeCents || 0, cur)}</span>
                </div>
              ))}
              <div style={{ fontSize: 12, color: colors.textSubtle, marginTop: 4 }}>{ticketsSold} ticket{ticketsSold === 1 ? "" : "s"} sold this month</div>
            </>
          ) : (
            <div style={muted}>No ticket sales this month — no fees.</div>
          )}
        </div>

        {/* Data — the storage markup */}
        <div style={block}>
          <div style={sectionLabel}>Data</div>
          {storage.tierCents > 0 ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px", color: colors.textMuted, marginBottom: 5 }}>
                <span>Your data usage</span>
                <span>{money(storage.tierCents, storage.currency)}/mo</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 700, color: colors.text }}>
                <span>PullUp service ({markupPct}%)</span>
                <span>{money(storage.feeCents, storage.currency)}/mo</span>
              </div>
            </>
          ) : (
            <div style={muted}>No data cost this month.</div>
          )}
        </div>

        {/* What you owe */}
        <div style={{ borderTop: `1px solid ${colors.borderFaint}`, paddingTop: "14px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>What you owe this month</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: owedEntries.length ? colors.accent : colors.textFaded }}>
            {owedEntries.length ? owedEntries.map(([cur, c]) => money(c, cur)).join(" · ") : "Nothing"}
          </span>
        </div>
      </div>
    </div>
  );
}
