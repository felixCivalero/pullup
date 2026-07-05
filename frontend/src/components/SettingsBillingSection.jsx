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

const TIER_LABEL = { creator: "Creator", agency: "Agency" };
const TIER_DESC = {
  creator: "Solo — your own events and people",
  agency: "For teams and agencies (2+ people)",
};

// Pick-a-tier rows, shared by the unsubscribed state and the early member's
// optional upgrade.
// busy is WHICH action is loading (e.g. "tier:creator", "portal") — only the
// pressed button shows its spinner text; the rest just disable.
function TierChooser({ tiers, busy, onSubscribe, cta }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {["creator", "agency"].map((name) => (
        <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderRadius: 10, border: `1px solid ${colors.borderFaint}`, background: colors.surface }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>
              {TIER_LABEL[name]} · {tiers[name]?.priceSek} kr/month
            </div>
            <div style={{ fontSize: 12.5, color: colors.textMuted }}>{TIER_DESC[name]}</div>
          </div>
          <button onClick={() => onSubscribe(name)} disabled={!!busy} style={{ ...primaryBtn, padding: "9px 14px", opacity: busy ? 0.6 : 1 }}>
            {busy === `tier:${name}` ? "Opening…" : cta}
          </button>
        </div>
      ))}
    </div>
  );
}

// The plan card: which tier, what it costs, where the period stands, and every
// action a subscriber needs — subscribe, switch tier (prorated by Stripe),
// update card / invoices / cancel via the Stripe portal.
function PlanCard({ sub, busy, onSubscribe, onPortal, onChangeTier }) {
  const tier = sub?.tier || { name: "creator", priceSek: 125 };
  const tiers = sub?.tiers || { creator: { name: "creator", priceSek: 125 }, agency: { name: "agency", priceSek: 450 } };
  const plan = sub?.plan || {};
  const status = plan.subscriptionStatus || "none";
  const isEarly = plan.plan === "early";
  const active = status === "active";
  const pastDue = status === "past_due";
  const ending = active && plan.cancelAtPeriodEnd;
  const otherTier = tier.name === "agency" ? tiers.creator : tiers.agency;

  if (isEarly) {
    return (
      <>
        <div style={{ ...block, borderColor: colors.accentBorder, background: colors.accentSoft }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: colors.text }}>Early member</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: colors.accent }}>Hosting free, forever</span>
          </div>
          <div style={muted}>
            You were here before subscriptions existed — so they don't exist for you. Only the 3% ticket fee ever applies.
          </div>
        </div>
        {sub?.configured && (
          <div style={{ ...block }}>
            <div style={{ ...muted, marginBottom: 10 }}>
              Want a paid tier anyway — to back the build, or for what Agency grows into? You can. Your founding status is
              permanent: cancel whenever and you're back to hosting free.
            </div>
            <TierChooser tiers={tiers} busy={busy} onSubscribe={onSubscribe} cta="Upgrade" />
          </div>
        )}
      </>
    );
  }

  // ── Subscriber: period, switch tier, Stripe portal ────────────────────────
  if (active || pastDue) {
    return (
      <div style={block}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: colors.text }}>{TIER_LABEL[tier.name] || "Creator"}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>{tier.priceSek} kr/month</span>
        </div>

        {pastDue && (
          <div style={{ margin: "10px 0", padding: "10px 12px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", fontSize: 13, color: "#b91c1c", lineHeight: 1.5 }}>
            Your last payment didn't go through. You can keep hosting while we retry — update your card to stay live.
          </div>
        )}

        <div style={{ ...muted, marginBottom: 12 }}>
          {pastDue ? (
            <>Payment retrying{plan.currentPeriodEnd ? ` · period ends ${fmtDate(plan.currentPeriodEnd)}` : ""}.</>
          ) : ending ? (
            <>
              <strong>Cancelled</strong> — you keep hosting until{" "}
              <strong>{plan.currentPeriodEnd ? fmtDate(plan.currentPeriodEnd) : "the period ends"}</strong>, then your pages go
              read-only. Changed your mind? Resume from "Manage in Stripe" below.
            </>
          ) : (
            <>
              Active · current period runs until <strong>{plan.currentPeriodEnd ? fmtDate(plan.currentPeriodEnd) : "—"}</strong>,
              when it renews. Cancel anytime — you host until the period ends, your data stays yours either way.
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={onPortal} disabled={!!busy} style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}>
            {busy === "portal" ? "Opening…" : pastDue ? "Update card" : "Manage in Stripe"}
          </button>
          {!ending && (
            <button onClick={() => onChangeTier(otherTier.name)} disabled={!!busy} style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}>
              {busy === "switch" ? "Switching…" : `Switch to ${TIER_LABEL[otherTier.name]} — ${otherTier.priceSek} kr/month`}
            </button>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: colors.textFaded, marginTop: 8, lineHeight: 1.5 }}>
          Manage in Stripe = card details, receipts, cancel or resume. Switching tier is prorated automatically.
          {plan.founding && <> <strong>Founding member:</strong> cancel anytime and you're back to hosting free, forever.</>}
        </div>
      </div>
    );
  }

  // ── Not subscribed: pick a tier ───────────────────────────────────────────
  return (
    <div style={block}>
      <div style={{ ...muted, marginBottom: 12 }}>
        {status === "canceled"
          ? "Your subscription ended — your pages are up read-only and new sign-ups are paused. Resubscribe and everything switches back on, nothing lost."
          : "Hosting on PullUp — publishing events, a community page, products — runs on one flat subscription. Cancel anytime; being a guest is always free."}
      </div>
      {sub?.configured ? (
        <TierChooser tiers={tiers} busy={busy} onSubscribe={onSubscribe} cta={status === "canceled" ? "Resubscribe" : "Subscribe"} />
      ) : (
        <div style={{ fontSize: 12.5, color: colors.textSubtle }}>
          Subscriptions aren't switched on for this deployment yet — hosting is open meanwhile.
        </div>
      )}
    </div>
  );
}

export function SettingsBillingSection() {
  const { sub, startCheckout, openPortal, changeTier } = useSubscription();
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(null); // which action is loading: "tier:<name>" | "portal" | "switch"

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

  // key names WHICH button is loading (so its neighbors just disable, never
  // show a phantom spinner). A function key derives it from the args.
  const act = (key, fn) => async (...args) => {
    setBusy(typeof key === "function" ? key(...args) : key);
    try {
      const ok = await fn(...args);
      if (!ok) setBusy(null);
    } catch {
      setBusy(null);
    }
    // On success the browser navigates to Stripe — no need to reset.
  };

  // Switching stays in-app (Stripe prorates server-side), so busy always resets.
  const handleChangeTier = async (tierName) => {
    const label = tierName === "agency" ? "Agency — 450 kr/month" : "Creator — 125 kr/month";
    if (!window.confirm(`Switch to ${label}? Stripe prorates the difference automatically on your next invoice.`)) return;
    setBusy("switch");
    try {
      const ok = await changeTier(tierName);
      if (!ok) window.alert("Couldn't switch tier — try again in a moment, or use Manage in Stripe.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px", color: colors.text }}>Billing</h2>
        <p style={{ fontSize: "14px", color: colors.textMuted }}>
          Two things, nothing else: your hosting subscription, and {ticketFeePct}% on paid tickets. RSVPs, pull-ups and your data are always free.
        </p>
      </div>

      <div style={{ padding: "20px", background: colors.surface, borderRadius: "14px", border: `1px solid ${colors.borderFaint}` }}>
        <PlanCard
          sub={sub}
          busy={busy}
          onSubscribe={act((tierName) => `tier:${tierName}`, (tierName) => startCheckout({ tier: tierName }))}
          onPortal={act("portal", () => openPortal())}
          onChangeTier={handleChangeTier}
        />

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
