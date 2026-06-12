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
  hero: "Hero",
  proof: "Proof wall",
  room: "01 · The Room",
  person: "02 · Every person",
  chat: "03 · One chat",
  fill: "04 · Fill the room",
  mcp: "05 · No new app",
  final_cta: "Final CTA",
  showcase: "Showcase wall",
  coda: "Founder's note",
  footer: "Footer — the very bottom",
};

const ORIGIN_COLORS = {
  landing: colors.accent,
  rsvp: colors.secondary,
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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Date objects from the page-level DateRangePicker → stable ISO strings so
  // the effect doesn't refire on referentially-new-but-equal dates.
  const startIso = dateRange.startDate ? dateRange.startDate.toISOString() : null;
  const endIso = dateRange.endDate ? dateRange.endDate.toISOString() : null;

  useEffect(() => {
    if (!startIso || !endIso) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ startDate: startIso, endDate: endIso });
    authenticatedFetch(`/admin/analytics/landing-view?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) { setData(json); setLoading(false); }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
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

  const landingSignupsByDate = useMemo(() => {
    const map = {};
    for (const row of data?.signupSeries || []) {
      if (row.origin === "landing") map[row.day] = (map[row.day] || 0) + row.signups;
    }
    return map;
  }, [data]);

  const signupDays = useMemo(() => {
    if (!data?.signupSeries) return [];
    const byDay = new Map();
    for (const row of data.signupSeries) {
      const e = byDay.get(row.day) || { date: row.day, views: 0, bySource: {} };
      e.views += Number(row.signups || 0);
      e.bySource[row.origin] = (e.bySource[row.origin] || 0) + Number(row.signups || 0);
      byDay.set(row.day, e);
    }
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const guestAccountsByDate = useMemo(() => {
    const map = {};
    for (const row of data?.rsvpAccountSeries || []) map[row.day] = row.accounts;
    return map;
  }, [data]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: colors.textSubtle, fontSize: 13 }}>Loading…</div>;
  }
  if (!data) {
    return <div style={{ padding: 40, textAlign: "center", color: colors.textSubtle, fontSize: 13 }}>Couldn't load landing analytics.</div>;
  }

  const k = data.kpis || {};
  const sessions = Number(k.sessions || 0);
  const bounceRate = sessions > 0 ? pct(Number(k.bouncedSessions || 0), sessions) : null;
  const conversion = k.visitors ? ((k.landingSignups / k.visitors) * 100).toFixed(1) : "0.0";
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
          <Kpi value={Number(k.landingSignups || 0).toLocaleString()} label="host signups" color={colors.accent} change={pctChange(k.landingSignups, k.prevLandingSignups)} />
          <Kpi value={`${conversion}%`} label="visit → host signup" color={colors.secondary} />
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
              byDate: landingSignupsByDate,
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
        <SectionLabel>From visit to host</SectionLabel>
        <CtaFunnel funnel={funnel} locations={data.ctaLocations || []} />
      </div>

      {/* ─── Signups by origin ─── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionLabel>Signups — landing-born vs RSVP-born</SectionLabel>
        </div>
        {signupDays.length > 0 ? (
          <LandingDailyChart
            daily={signupDays}
            allSources={["landing", "rsvp"]}
            colorFor={(s) => ORIGIN_COLORS[s] || colors.textFaded}
            lineOverlay={{
              byDate: guestAccountsByDate,
              color: colors.secondary,
              label: "guest accounts created",
            }}
          />
        ) : (
          <EmptyNote>No signups in this range.</EmptyNote>
        )}
      </div>

      {/* ─── Origin × hostness matrix (all time) ─── */}
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>Where accounts come from — all time</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <MatrixCard label="Landing-born hosts" sub="signed up, created events" value={matrix.landingHosts} color={colors.accent} />
          <MatrixCard label="Landing-born, dormant" sub="signed up, no event yet" value={matrix.landingDormant} color={colors.textMuted} />
          <MatrixCard label="RSVP-born hosts" sub="came as a guest, now hosting" value={matrix.rsvpHosts} color={colors.secondary} />
          <MatrixCard label="RSVP-born members" sub="opened the dashboard, no event" value={matrix.rsvpDormant} color={colors.textMuted} />
          <MatrixCard label="Guests" sub="have an account, never opened the app" value={matrix.guestsWithoutProfile} color={colors.textSubtle} />
        </div>
        {matrix.inferredCount > 0 && (
          <p style={{ margin: "8px 0 0", fontSize: 11, color: colors.textFaded }}>
            {matrix.inferredCount} pre-tracking account{matrix.inferredCount === 1 ? "" : "s"} classified
            retroactively (created events → landing; linked guest record → RSVP).
          </p>
        )}
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
    { key: "authStarted", label: "Started signup" },
    { key: "signedIn", label: "Signed in" },
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
          return (
            <div key={l.location} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
              <span style={{ flex: 1, fontSize: 11, color: colors.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.location.replace(/_/g, " ")}
              </span>
              <div style={{ width: 56, height: 4, borderRadius: 2, background: colors.borderFaint }}>
                <div style={{ height: "100%", borderRadius: 2, background: colors.accent, width: `${pct(l.visitors, max)}%` }} />
              </div>
              <span style={{ width: 28, fontSize: 11, fontWeight: 600, color: colors.text, textAlign: "right" }}>
                {l.visitors}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatrixCard({ label, sub, value, color }) {
  return (
    <div style={{
      borderRadius: 12, background: "#fff", border: `1px solid ${colors.border}`,
      padding: "12px 14px", boxShadow: "0 4px 16px rgba(10,10,10,0.04)",
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.2 }}>
        {Number(value || 0).toLocaleString()}
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.text, marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 10.5, color: colors.textFaded }}>{sub}</div>
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
