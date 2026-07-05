// src/components/SettingsBillingSection.jsx
//
// The host's money mirror. PullUp charges exactly two things:
//   1. The Creator subscription — 125 kr/month while you host anything.
//      Founding hosts are on the Early tier instead: free, forever.
//   2. 3% on paid tickets.
// RSVPs, pull-ups and your data are always free (your own Supabase is billed
// by Supabase, to you — see Own your data). This pane shows the plan card
// (subscribe / manage / fix payment) + this month's ticket fees.

import { useEffect, useState } from "react";
import { authenticatedFetch } from "../lib/api.js";
import { useSubscription } from "../lib/useSubscription.js";
import { colors } from "../theme/colors.js";

function money(cents, currency) {
  const v = (cents / 100).toFixed(2).replace(/\.00$/, "");
  const cur = (currency || "usd").toUpperCase();
  return cur === "SEK" ? `${v} kr` : cur === "KES" ? `KSh ${v}` : cur === "USD" ? `$${v}` : `${v} ${cur}`;
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
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
const primaryBtn = {
  padding: "11px 16px",
  borderRadius: 10,
  border: "none",
  background: colors.text,
  color: "#fff",
  fontSize: 13.5,
  fontWeight: 700,
  cursor: "pointer",
};
const ghostBtn = {
  padding: "10px 14px",
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  background: colors.surface,
  color: colors.text,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

// The plan card: which tier, what it costs, and the one action that matters
// right now (subscribe / manage / fix payment).
function PlanCard({ sub, busy, onSubscribe, onPortal }) {
  const tier = sub?.tier || { priceSek: 125 };
  const plan = sub?.plan || {};
  const status = plan.subscriptionStatus || "none";
  const isEarly = plan.plan === "early";
  const active = status === "active";
  const pastDue = status === "past_due";

  if (isEarly) {
    return (
      <div style={{ ...block, borderColor: colors.accentBorder, background: colors.accentSoft }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: colors.text }}>Early member</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: colors.accent }}>Hosting free, forever</span>
        </div>
        <div style={muted}>
          You were here before subscriptions existed — so they don't exist for you. Only the 3% ticket fee ever applies.
        </div>
      </div>
    );
  }

  return (
    <div style={block}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: colors.text }}>Creator</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>{tier.priceSek} kr/month</span>
      </div>

      {pastDue && (
        <div style={{ margin: "10px 0", padding: "10px 12px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", fontSize: 13, color: "#b91c1c", lineHeight: 1.5 }}>
          Your last payment didn't go through. You can keep hosting while we retry — update your card to stay live.
        </div>
      )}

      {active || pastDue ? (
        <>
          <div style={{ ...muted, marginBottom: 12 }}>
            {active ? (
              <>Active{plan.currentPeriodEnd ? ` · renews ${fmtDate(plan.currentPeriodEnd)}` : ""}. Cancel anytime — you host until the period ends, your data stays yours either way.</>
            ) : (
              <>Payment retrying{plan.currentPeriodEnd ? ` · period ends ${fmtDate(plan.currentPeriodEnd)}` : ""}.</>
            )}
          </div>
          <button onClick={onPortal} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}>
            {pastDue ? "Update card" : "Manage subscription"}
          </button>
        </>
      ) : (
        <>
          <div style={{ ...muted, marginBottom: 12 }}>
            {status === "canceled"
              ? "Your subscription ended — your pages are up read-only and new sign-ups are paused. Resubscribe and everything switches back on, nothing lost."
              : "Hosting on PullUp — publishing events, a community page, products — runs on one flat subscription. Cancel anytime; being a guest is always free."}
          </div>
          {sub?.configured ? (
            <button onClick={onSubscribe} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Opening checkout…" : status === "canceled" ? "Resubscribe" : "Start hosting — 125 kr/month"}
            </button>
          ) : (
            <div style={{ fontSize: 12.5, color: colors.textSubtle }}>
              Subscriptions aren't switched on for this deployment yet — hosting is open meanwhile.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SettingsBillingSection() {
  const { sub, startCheckout, openPortal } = useSubscription();
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    authenticatedFetch("/host/billing/summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (alive) setSummary(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const month = summary?.month || {};
  const currencies = Object.entries(month.byCurrency || {});
  const plan = summary?.plan || {};
  const ticketFeePct = ((plan.ticketFeeBps ?? 300) / 100).toFixed(0);
  const ticketsSold = month.ticketSales ?? 0;
  const soldCurrencies = currencies.filter(([, v]) => (v.grossCents || 0) > 0 || (v.feeCents || 0) > 0);

  const act = (fn) => async () => {
    setBusy(true);
    try {
      const ok = await fn();
      if (!ok) setBusy(false);
    } catch {
      setBusy(false);
    }
    // On success the browser navigates to Stripe — no need to reset.
  };

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px", color: colors.text }}>Billing</h2>
        <p style={{ fontSize: "14px", color: colors.textMuted }}>
          Two things, nothing else: the Creator subscription while you host, and {ticketFeePct}% on paid tickets. RSVPs, pull-ups and your data are always free.
        </p>
      </div>

      <div style={{ padding: "20px", background: colors.surface, borderRadius: "14px", border: `1px solid ${colors.borderFaint}` }}>
        <PlanCard sub={sub} busy={busy} onSubscribe={act(() => startCheckout())} onPortal={act(() => openPortal())} />

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

        {/* Your data — a pointer, not a bill */}
        <div style={{ borderTop: `1px solid ${colors.borderFaint}`, paddingTop: "14px", fontSize: 12.5, color: colors.textSubtle, lineHeight: 1.5 }}>
          Own your database? Supabase bills you directly at their prices — PullUp adds nothing on top. See Own your data.
        </div>
      </div>
    </div>
  );
}
