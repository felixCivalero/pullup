// Admin analytics — the Landing overview, default view of /admin/analytics.
//
// One API call (GET /admin/analytics/landing-view) returns the whole "front
// door" story: visits by source, the scroll-depth funnel through the landing
// page's chapters, the CTA→signup funnel, and signups split by origin
// (landing-born hosts vs RSVP-born accounts).

import { useEffect, useState, useMemo } from "react";
import { authenticatedFetch } from "../../lib/api.js";
import { colors } from "../../theme/colors.js";
import {
  SectionLabel,
  StatPill,
  ChangeIndicator,
  DeviceDonut,
  LandingDailyChart,
} from "./chartKit.jsx";

// The landing page's beats, in scroll order — keep in sync with the
// data-mk-section stamps in LandingPage.jsx.
const SECTION_LABELS = {
  // The hero-heavy redesign (Jul 2026) — beats in scroll order.
  hero: "Hero — poster field",
  proof: "Brand proof marquee",
  story: "The journey (phone)",
  flip: "The flip ticker",
  feature_autodm: "Bento · Auto-DM",
  feature_inbox: "Bento · One inbox",
  feature_crm: "Bento · People CRM",
  feature_db: "Bento · Own your data",
  feature_mcp: "Bento · MCP",
  join: "Join — pricing",
  footer: "Footer — the very bottom",
  // Pre-redesign beats, kept for historical ranges.
  room: "01 · The Room (old)",
  person: "02 · Every person (old)",
  chat: "03 · One chat (old)",
  fill: "04 · Fill the room (old)",
  mcp: "05 · No new app (old)",
  final_cta: "Final CTA (old)",
  showcase: "Showcase wall (old)",
  coda: "Founder's note (old)",
};

// Human names for the cta_click location tags. The first four are the live
// page; the two "retired" ones are buttons from the pre-Jun-4-2026 landing
// layout that still show up in historical ranges.
const CTA_META = {
  nav: { label: "Start hosting", place: "top bar" },
  nav_login: { label: "Log in", place: "top bar" },
  hero: { label: "Start hosting", place: "hero" },
  join_pricing: { label: "Start hosting", place: "join / pricing" },
  join_login: { label: "Log in", place: "join / pricing" },
  final: { label: "Get started", place: "old landing", retired: true },
  hero_events: { label: "Events path", place: "old landing", retired: true },
  hero_marketing: { label: "Creator path", place: "old landing", retired: true },
};

function pctChange(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

export function LandingOverview({ dateRange }) {
  // undefined = first load in flight; null = load failed. On range changes we
  // keep the previous payload on screen until the new one lands (no flicker,
  // and no synchronous setState inside the effect).
  const [data, setData] = useState(undefined);

  // Date objects from the page-level DateRangePicker → stable ISO strings so
  // the effect doesn't refire on referentially-new-but-equal dates.
  const startIso = dateRange.startDate ? dateRange.startDate.toISOString() : null;
  const endIso = dateRange.endDate ? dateRange.endDate.toISOString() : null;

  useEffect(() => {
    if (!startIso || !endIso) return;
    let cancelled = false;
    const params = new URLSearchParams({ startDate: startIso, endDate: endIso });
    authenticatedFetch(`/admin/analytics/landing-view?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => { if (!cancelled) setData(json); })
      .catch(() => { if (!cancelled) setData((prev) => prev ?? null); });
    return () => { cancelled = true; };
  }, [startIso, endIso]);

  // daily[] arrives as one row per day×source; the chart wants one entry
  // per day with a bySource map.
  const visitDays = useMemo(() => {
    if (!data?.daily) return [];
    const byDay = new Map();
    for (const row of data.daily) {
      const e = byDay.get(row.day) || { date: row.day, views: 0, bySource: {} };
      e.views += Number(row.visitors || 0);
      e.bySource[row.source || "direct"] =
        (e.bySource[row.source || "direct"] || 0) + Number(row.visitors || 0);
      byDay.set(row.day, e);
    }
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const allSources = useMemo(
    () => [...new Set(visitDays.flatMap((d) => Object.keys(d.bySource)))],
    [visitDays]
  );

  // The front-door conversion now: landing-born host accounts (waitlist gone).
  const signupsByDate = useMemo(() => {
    const map = {};
    for (const row of data?.signupSeries || []) {
      if ((row.origin || "landing") !== "landing") continue;
      map[row.day] = (map[row.day] || 0) + Number(row.signups || 0);
    }
    return map;
  }, [data]);

  // Cumulative universe growth across the range: guest records (people) and
  // app accounts (profiles), each starting from its pre-range baseline so the
  // lines show real totals, not range-local counts.
  const growth = useMemo(() => {
    if (!data?.range?.from || !data?.range?.to) return [];
    const guestAdds = {};
    for (const row of data.rsvpAccountSeries || []) guestAdds[row.day] = Number(row.accounts || 0);
    const accountAdds = {};
    for (const row of data.signupSeries || []) {
      accountAdds[row.day] = (accountAdds[row.day] || 0) + Number(row.signups || 0);
    }
    let guests = Number(data.baselines?.guests || 0);
    let accounts = Number(data.baselines?.profiles || 0);
    const out = [];
    const end = new Date(data.range.to + "T00:00:00Z");
    for (let d = new Date(data.range.from + "T00:00:00Z"); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const day = d.toISOString().slice(0, 10);
      guests += guestAdds[day] || 0;
      accounts += accountAdds[day] || 0;
      out.push({ date: day, guests, accounts });
    }
    return out;
  }, [data]);

  if (data === undefined) {
    return <div style={{ padding: 40, textAlign: "center", color: colors.textSubtle, fontSize: 13 }}>Loading…</div>;
  }
  if (!data) {
    return <div style={{ padding: 40, textAlign: "center", color: colors.textSubtle, fontSize: 13 }}>Couldn't load landing analytics.</div>;
  }

  const k = data.kpis || {};
  const sessions = Number(k.sessions || 0);
  const bounceRate = sessions > 0 ? pct(Number(k.bouncedSessions || 0), sessions) : null;
  const newSubscribers = Number(k.newSubscribers || 0);
  const conversion = k.visitors ? ((Number(k.landingSignups || 0) / k.visitors) * 100).toFixed(1) : "0.0";
  const matrix = data.originMatrix || {};
  const funnel = data.ctaFunnel || {};
  const device = data.deviceSplit || {};

  return (
    <>
      {/* ─── Stat strip ─── */}
      <div style={{ marginBottom: 24 }}>
        <SectionLabel>The front door — pullup.se</SectionLabel>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
          <Kpi value={Number(k.visitors || 0).toLocaleString()} label="visitors" change={pctChange(k.visitors, k.prevVisitors)} />
          <Kpi value={Number(k.views || 0).toLocaleString()} label="views" color={colors.textMuted} />
          <Kpi
            value={sessions > 0 ? sessions.toLocaleString() : "—"}
            label={bounceRate !== null ? `sessions · ${bounceRate}% bounce` : "sessions"}
            color={colors.textMuted}
            hint={sessions === 0 ? "collecting from the new tracker" : null}
          />
          <Kpi value={newSubscribers.toLocaleString()} label="new subscribers" color={colors.accent} change={pctChange(newSubscribers, k.prevNewSubscribers)} />
          <Kpi value={`${conversion}%`} label="visit → account" color={colors.secondary} />
          <Kpi value={Number(k.landingSignups || 0).toLocaleString()} label="host signups" color={colors.textMuted} change={pctChange(k.landingSignups, k.prevLandingSignups)} />
          {(device.mobile > 0 || device.desktop > 0) && (
            <DeviceDonut mobile={Number(device.mobile || 0)} desktop={Number(device.desktop || 0)} />
          )}
        </div>
      </div>

      {/* ─── Visits by source, signups overlaid ─── */}
      {visitDays.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionLabel>Visitors by source</SectionLabel>
          <LandingDailyChart
            daily={visitDays}
            allSources={allSources}
            lineOverlay={{
              byDate: signupsByDate,
              color: colors.accent,
              label: "host signups",
            }}
          />
        </div>
      )}

      {/* ─── The scroll story ─── */}
      <div style={{ marginBottom: 28 }}>
        <SectionLabel>The scroll story — how far people get</SectionLabel>
        <ScrollStory sections={data.sections || []} baseline={Number(k.visitors || 0)} />
      </div>

      {/* ─── CTA funnel ─── */}
      <div style={{ marginBottom: 28 }}>
        <SectionLabel>From visit to paying host</SectionLabel>
        <CtaFunnel funnel={funnel} locations={data.ctaLocations || []} />
      </div>

      {/* ─── The universe, growing ─── */}
      <div style={{ marginBottom: 28 }}>
        <SectionLabel>The universe — everyone PullUp has touched</SectionLabel>
        <GrowthChart days={growth} />
      </div>

      {/* ─── The ladder + the flywheel ─── */}
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>The ladder — guest to host, all time</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "stretch" }}>
          <Ladder ladder={data.ladder || {}} />
          <Flywheel matrix={matrix} />
        </div>
      </div>
    </>
  );
}

function Kpi({ value, label, color, change, hint }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontSize: 24, fontWeight: 700, color: color || colors.text }}>{value}</span>
      <span style={{ fontSize: 12, color: colors.textSubtle }}>{label}</span>
      {change !== null && change !== undefined && <ChangeIndicator value={change} />}
      {hint && <span style={{ fontSize: 10, color: colors.textFaded }}>{hint}</span>}
    </div>
  );
}

// The signature visual: a vertical miniature of the landing page — one bar
// per chapter, bar length = % of visitors who reached it, drop-off called
// out where the story loses people. Reads top-to-bottom like the page.
function ScrollStory({ sections, baseline }) {
  if (!sections.length) {
    return (
      <EmptyNote>
        No scroll data yet — the new tracker starts reporting section depth from
        the next deploy. Check back tomorrow.
      </EmptyNote>
    );
  }
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const base = Math.max(baseline, ordered[0]?.visitors || 0, 1);
  return (
    <div style={{
      borderRadius: 14, background: "#fff", border: `1px solid ${colors.border}`,
      padding: "14px 16px", boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
    }}>
      {ordered.map((s, i) => {
        const share = pct(s.visitors, base);
        const prev = i > 0 ? ordered[i - 1].visitors : base;
        const drop = prev > 0 ? Math.round(((prev - s.visitors) / prev) * 100) : 0;
        return (
          <div key={s.section} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
            <span style={{ width: 120, fontSize: 11, color: colors.textMuted, flexShrink: 0, textAlign: "right" }}>
              {SECTION_LABELS[s.section] || s.section}
            </span>
            <div style={{ flex: 1, height: 16, borderRadius: 4, background: colors.borderFaint, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${share}%`, borderRadius: 4,
                background: `linear-gradient(90deg, ${colors.accent}, ${colors.accentHover})`,
                opacity: 0.25 + 0.75 * (share / 100),
                transition: "width 0.3s ease",
              }} />
            </div>
            <span style={{ width: 44, fontSize: 12, fontWeight: 600, color: colors.text, textAlign: "right" }}>
              {share}%
            </span>
            <span style={{ width: 64, fontSize: 10, color: drop > 30 ? colors.danger : colors.textFaded, textAlign: "right" }}>
              {i > 0 && drop > 0 ? `−${drop}%` : ""}
            </span>
          </div>
        );
      })}
      <p style={{ margin: "8px 0 0", fontSize: 10, color: colors.textFaded }}>
        % of visitors who reached each chapter · red drop = lost more than 30% at that beat
      </p>
    </div>
  );
}

function CtaFunnel({ funnel, locations }) {
  const stages = [
    { key: "viewed", label: "Visited" },
    { key: "ctaClicked", label: "Clicked a CTA" },
    { key: "startReached", label: "Reached /start" },
    { key: "signups", label: "Created account" },
    { key: "subscribed", label: "Subscribed" },
  ];
  const base = Number(funnel.viewed || 0) || 1;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "start" }}>
      <div style={{
        borderRadius: 14, background: "#fff", border: `1px solid ${colors.border}`,
        padding: "14px 16px", boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
      }}>
        {stages.map((st, i) => {
          const v = Number(funnel[st.key] || 0);
          const share = pct(v, base);
          const prevV = i > 0 ? Number(funnel[stages[i - 1].key] || 0) : null;
          const stepRate = prevV ? pct(v, prevV) : null;
          return (
            <div key={st.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <span style={{ width: 100, fontSize: 11, color: colors.textMuted, flexShrink: 0, textAlign: "right" }}>
                {st.label}
              </span>
              <div style={{ flex: 1, height: 18, borderRadius: 4, background: colors.borderFaint, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${Math.max(share, v > 0 ? 2 : 0)}%`, borderRadius: 4,
                  background: colors.secondary, opacity: 0.35 + 0.65 * (share / 100),
                }} />
              </div>
              <span style={{ width: 50, fontSize: 12, fontWeight: 600, color: colors.text, textAlign: "right" }}>
                {v.toLocaleString()}
              </span>
              <span style={{ width: 58, fontSize: 10, color: colors.textFaded, textAlign: "right" }}>
                {stepRate !== null ? `${stepRate}% of prev` : ""}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{
        borderRadius: 14, background: "#fff", border: `1px solid ${colors.border}`,
        padding: "12px 14px", boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
      }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, color: colors.textFaded, marginBottom: 8 }}>
          Which CTA converts
        </div>
        {locations.length === 0 && <EmptyNote small>No CTA clicks in range.</EmptyNote>}
        {locations.map((l) => {
          const max = locations[0]?.visitors || 1;
          const meta = CTA_META[l.location] || { label: l.location.replace(/_/g, " "), place: "" };
          return (
            <div key={l.location} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
              <div style={{ flex: 1, minWidth: 0, opacity: meta.retired ? 0.55 : 1 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {meta.label}
                  {meta.retired && (
                    <span style={{
                      marginLeft: 5, fontSize: 9, fontWeight: 600, color: colors.textFaded,
                      border: `1px solid ${colors.border}`, borderRadius: 4, padding: "0px 4px",
                      verticalAlign: "1px",
                    }}>
                      retired
                    </span>
                  )}
                </div>
                {meta.place && (
                  <div style={{ fontSize: 9.5, color: colors.textFaded }}>{meta.place}</div>
                )}
              </div>
              <div style={{ width: 56, height: 4, borderRadius: 2, background: colors.borderFaint, flexShrink: 0 }}>
                <div style={{ height: "100%", borderRadius: 2, background: meta.retired ? colors.textFaded : colors.accent, width: `${pct(l.visitors, max)}%` }} />
              </div>
              <span style={{ width: 28, fontSize: 11, fontWeight: 600, color: colors.text, textAlign: "right", flexShrink: 0 }}>
                {l.visitors}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Two cumulative lines on independent axes (guests dwarf accounts ~17:1):
// guest records filled teal on the left axis, app accounts as a pink line on
// the right. Both start from pre-range baselines, so these are real totals.
function GrowthChart({ days }) {
  if (!days.length) return <EmptyNote>No growth data in this range.</EmptyNote>;
  const W = 720, H = 170;
  const PAD = { top: 14, right: 40, bottom: 22, left: 40 };
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const maxG = Math.max(1, ...days.map((d) => d.guests));
  const maxA = Math.max(1, ...days.map((d) => d.accounts));
  const x = (i) => PAD.left + (i / (days.length - 1 || 1)) * iw;
  const yG = (v) => PAD.top + ih - (v / maxG) * ih;
  const yA = (v) => PAD.top + ih - (v / maxA) * ih;
  const gPts = days.map((d, i) => `${x(i).toFixed(1)},${yG(d.guests).toFixed(1)}`).join(" ");
  const aPts = days.map((d, i) => `${x(i).toFixed(1)},${yA(d.accounts).toFixed(1)}`).join(" ");
  const last = days[days.length - 1];
  const step = Math.max(1, Math.floor(days.length / 6));
  return (
    <div style={{
      borderRadius: 14, background: "#fff", border: `1px solid ${colors.border}`,
      padding: "14px 12px 8px", boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
    }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={PAD.left + iw} y1={PAD.top + ih - f * ih} y2={PAD.top + ih - f * ih}
              stroke="rgba(10,10,10,0.07)" strokeDasharray="4,4" />
            <text x={PAD.left - 5} y={PAD.top + ih - f * ih + 3} textAnchor="end"
              fill={colors.secondary} opacity={0.7} fontSize="10">{Math.round(maxG * f)}</text>
            <text x={PAD.left + iw + 5} y={PAD.top + ih - f * ih + 3} textAnchor="start"
              fill={colors.accent} opacity={0.7} fontSize="10">{Math.round(maxA * f)}</text>
          </g>
        ))}
        <polygon
          points={`${PAD.left},${PAD.top + ih} ${gPts} ${PAD.left + iw},${PAD.top + ih}`}
          fill={colors.secondarySoft}
        />
        <polyline points={gPts} fill="none" stroke={colors.secondary} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={aPts} fill="none" stroke={colors.accent} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />
        {days.map((d, i) =>
          i % step === 0 || i === days.length - 1 ? (
            <text key={d.date} x={x(i)} y={H - 4} textAnchor="middle" fill="rgba(10,10,10,0.35)" fontSize="10">
              {new Date(d.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </text>
          ) : null
        )}
      </svg>
      <div style={{ display: "flex", gap: 16, marginTop: 6, paddingLeft: PAD.left, fontSize: 11, color: colors.textMuted }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 14, height: 2, background: colors.secondary, display: "inline-block" }} />
          guest records — now {last.guests.toLocaleString()}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 14, height: 2, background: colors.accent, display: "inline-block" }} />
          app accounts — now {last.accounts.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// The activation ladder: every rung is "of everyone on the rung above".
function Ladder({ ladder }) {
  const rungs = [
    { key: "universe", label: "In the universe", sub: "every person PullUp has touched" },
    { key: "openedApp", label: "Opened the app", sub: "have a dashboard profile" },
    { key: "createdEvent", label: "Created an event", sub: "became a host" },
    { key: "activeHosts90d", label: "Hosting now", sub: "created an event in the last 90 days" },
  ];
  const base = Number(ladder.universe || 0) || 1;
  return (
    <div style={{
      borderRadius: 14, background: "#fff", border: `1px solid ${colors.border}`,
      padding: "14px 16px", boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
    }}>
      {rungs.map((r, i) => {
        const v = Number(ladder[r.key] || 0);
        const prevV = i > 0 ? Number(ladder[rungs[i - 1].key] || 0) : null;
        const stepRate = prevV ? pct(v, prevV) : null;
        const share = Math.max(pct(v, base), v > 0 ? 2 : 0);
        return (
          <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
            <div style={{ width: 150, flexShrink: 0, textAlign: "right" }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.text }}>{r.label}</div>
              <div style={{ fontSize: 9.5, color: colors.textFaded }}>{r.sub}</div>
            </div>
            <div style={{ flex: 1, height: 18, borderRadius: 4, background: colors.borderFaint, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${share}%`, borderRadius: 4,
                background: `linear-gradient(90deg, ${colors.secondary}, ${colors.accent})`,
                opacity: 0.35 + 0.65 * ((i + 1) / rungs.length),
              }} />
            </div>
            <span style={{ width: 48, fontSize: 13, fontWeight: 700, color: colors.text, textAlign: "right" }}>
              {v.toLocaleString()}
            </span>
            <span style={{ width: 64, fontSize: 10, color: colors.textFaded, textAlign: "right" }}>
              {stepRate !== null ? `${stepRate}% of prev` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// The number this whole page exists to move: guests who became hosts.
function Flywheel({ matrix }) {
  const graduated = Number(matrix.rsvpHosts || 0);
  const warming = Number(matrix.rsvpDormant || 0);
  return (
    <div style={{
      borderRadius: 14, border: `1px solid ${graduated > 0 ? colors.secondaryBorder : colors.border}`,
      background: graduated > 0 ? colors.secondarySoft : "#fff",
      padding: "14px 16px", boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
      display: "flex", flexDirection: "column", justifyContent: "center",
    }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, color: colors.textFaded }}>
        The flywheel
      </div>
      <div style={{ fontSize: 34, fontWeight: 800, color: graduated > 0 ? colors.secondary : colors.text, lineHeight: 1.1, marginTop: 4 }}>
        {graduated}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: colors.text, marginTop: 2 }}>
        guests turned host
      </div>
      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 6, lineHeight: 1.5 }}>
        {warming} came in as guests and already opened the app — one event away.
        When this number moves, the loop is closing.
      </div>
    </div>
  );
}

function EmptyNote({ children, small }) {
  return (
    <div style={{
      padding: small ? "8px 0" : "18px 16px", fontSize: small ? 11 : 12.5,
      color: colors.textSubtle,
      ...(small ? {} : {
        borderRadius: 14, background: "#fff", border: `1px dashed ${colors.border}`,
      }),
    }}>
      {children}
    </div>
  );
}
