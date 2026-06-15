// The story of the night — per-event host analytics, Room-era.
//
// Not a dashboard: the event's life told in its four real phases, top to
// bottom — FILL (reach → RSVPs by source) · YOUR PEOPLE (returning vs new,
// how each person entered your world) · THE NIGHT (the pull-up truth) ·
// AFTERLIFE (does the room outlive it). One API call
// (GET /host/events/:id/story); every rate is benchmarked against the
// host's OWN past events — never industry vanity numbers.

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { useEventNav } from "../contexts/EventNavContext.jsx";
import { colors } from "../theme/colors.js";
import { Instagram, MessageCircle, Mail, FileInput, Globe, Users } from "lucide-react";
import {
  SectionLabel,
  LandingDailyChart,
  getLandingSourceColor,
} from "./analytics/chartKit.jsx";

const PHASE_META = {
  draft: { label: "Draft", color: colors.textFaded, bg: colors.surfaceMuted },
  upcoming: { label: "Filling", color: colors.accent, bg: colors.accentSoft },
  live: { label: "Tonight", color: colors.success, bg: colors.successRgba },
  ended: { label: "Ended", color: colors.text, bg: colors.surfaceMuted },
};

const CHANNEL_META = {
  instagram: { label: "Instagram", icon: Instagram, color: "rgba(225,48,108,0.9)" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, color: "#25d366" },
  email: { label: "Email", icon: Mail, color: colors.secondary },
  import: { label: "Imported", icon: FileInput, color: colors.textMuted },
  direct: { label: "Direct", icon: Globe, color: colors.textSubtle },
};

function pct(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}

export function EventAnalyticsPage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { setEventNav } = useEventNav();

  const [story, setStory] = useState(undefined); // undefined=loading, null=failed

  // The event nav (title + Room/Guests/Insights/Edit tabs) is driven by
  // eventNav.myRole and is fetched FIRST, independently of the heavier story
  // payload — so the menu bar lights up the moment the page mounts and stays
  // up even if the story is slow or fails. Ownership/redirect is decided by
  // the event fetch alone; a story 403 just shows an inline message (the host
  // can still navigate away via the bar).
  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    (async () => {
      try {
        const eventRes = await authenticatedFetch(`/host/events/${id}`);
        if (cancelled) return;
        // Not your event → graceful exit into the room they can see.
        if (eventRes.status === 403) { navigate(`/events/${id}/room`, { replace: true }); return; }
        if (eventRes.ok) {
          const ev = await eventRes.json();
          setEventNav({ title: ev.title, slug: ev.slug, status: ev.status, myRole: ev.myRole, kind: ev.kind || "event" });
        }
        const storyRes = await authenticatedFetch(`/host/events/${id}/story`);
        if (cancelled) return;
        setStory(storyRes.ok ? await storyRes.json() : null);
      } catch {
        if (!cancelled) setStory(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user, id, navigate, setEventNav]);

  if (authLoading || story === undefined) {
    return <Center>Loading…</Center>;
  }
  if (!story?.event) {
    return <Center>Couldn't load this event's story.</Center>;
  }

  const { event, fill, people, night, afterlife, benchmarks, money } = story;
  const phase = PHASE_META[event.phase] || PHASE_META.upcoming;
  const bench = benchmarks || {};

  // Chart shape: visitors by source as stacked bars, RSVPs as the overlay line.
  const chartDays = (story.daily || []).map((d) => ({
    date: d.day,
    views: Number(d.visitors || 0),
    bySource: d.bySource || {},
  }));
  const rsvpsByDate = Object.fromEntries((story.daily || []).map((d) => [d.day, d.rsvps || 0]));
  const allSources = [...new Set((story.sources || []).map((s) => s.source))];

  return (
    <div className="page-with-header" style={{
      minHeight: "100vh", background: "#fff", boxSizing: "border-box",
      paddingLeft: "clamp(12px, 3vw, 24px)", paddingRight: "clamp(12px, 3vw, 24px)", paddingBottom: 60,
    }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        {/* ─── Header: where the night stands ─── */}
        <div style={{ margin: "0 0 22px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: "clamp(18px, 4vw, 24px)", fontWeight: 700, color: colors.text }}>
              The story of the night
            </h1>
            <span style={{
              fontSize: 11, fontWeight: 700, color: phase.color, background: phase.bg,
              borderRadius: 999, padding: "3px 10px", textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              {phase.label}
            </span>
          </div>
          <Verdict event={event} fill={fill} night={night} afterlife={afterlife} people={people} bench={bench} />
        </div>

        {/* ─── Chapter 1 · FILL ─── */}
        <Chapter n="01" title="Fill" sub="who saw it, who's coming">
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "baseline", marginBottom: 14 }}>
            <Big v={fill.uniqueVisitors} label="people saw the page" />
            <Big v={fill.rsvps} label={`coming${fill.partyTotal > fill.rsvps ? ` · ${fill.partyTotal} with +1s` : ""}`} color={colors.accent} />
            <BenchStat
              v={fill.conversionPct} unit="%"
              label="say yes"
              benchV={bench.avgConversionPct}
              benchN={bench.eventsCompared}
            />
            {fill.waitlist > 0 && <Big v={fill.waitlist} label="on the waitlist" color={colors.secondary} />}
          </div>

          {event.capacity > 0 && (
            <FillBar taken={fill.partyTotal} capacity={event.capacity} />
          )}

          {event.phase === "upcoming" && (fill.rsvps7d > 0 || fill.rsvpsPrev7d > 0) && (
            <p style={{ fontSize: 12, color: colors.textMuted, margin: "10px 0 0" }}>
              Momentum: <strong>{fill.rsvps7d}</strong> RSVP{fill.rsvps7d === 1 ? "" : "s"} this week
              {fill.rsvpsPrev7d > 0 && <> vs {fill.rsvpsPrev7d} the week before
                {fill.rsvps7d > fill.rsvpsPrev7d ? " — picking up" : fill.rsvps7d < fill.rsvpsPrev7d ? " — cooling, time for a story post" : ""}</>}
            </p>
          )}

          {chartDays.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <LandingDailyChart
                daily={chartDays}
                allSources={allSources}
                lineOverlay={{ byDate: rsvpsByDate, color: colors.accent, label: "RSVPs" }}
              />
            </div>
          )}

          {(story.sources || []).length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {story.sources.map((s) => (
                <span key={s.source} style={{
                  display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11,
                  color: colors.textMuted, border: `1px solid ${colors.borderFaint}`,
                  borderRadius: 999, padding: "3px 10px",
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: getLandingSourceColor(s.source) }} />
                  {s.source} · <strong style={{ color: colors.text }}>{s.visitors}</strong>
                </span>
              ))}
            </div>
          )}
        </Chapter>

        {/* ─── Chapter 2 · YOUR PEOPLE ─── */}
        <Chapter n="02" title="Your people" sub="who they are to you">
          {people.total === 0 ? (
            <Empty>No one yet — this chapter starts with the first RSVP.</Empty>
          ) : (
            <>
              <ReturningSplit people={people} />
              {(story.channels || []).length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                  {story.channels.map((c) => {
                    const meta = CHANNEL_META[c.channel] || { label: c.channel, icon: Users, color: colors.textSubtle };
                    const Icon = meta.icon;
                    return (
                      <span key={c.channel} style={{
                        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5,
                        fontWeight: 600, color: colors.text, border: `1px solid ${colors.border}`,
                        borderRadius: 999, padding: "5px 12px",
                      }}>
                        <Icon size={12} style={{ color: meta.color }} />
                        {meta.label} · {c.count}
                      </span>
                    );
                  })}
                </div>
              )}
              {story.enrichmentAnswers > 0 && (
                <p style={{ fontSize: 12, color: colors.textMuted, margin: "12px 0 0" }}>
                  <strong>{story.enrichmentAnswers}</strong> answered your questions — their answers live on each
                  person in the guest list.
                </p>
              )}
            </>
          )}
        </Chapter>

        {/* ─── Chapter 3 · THE NIGHT ─── */}
        <Chapter n="03" title="The night" sub="who actually pulled up">
          {event.phase === "upcoming" || event.phase === "draft" ? (
            <Empty>
              The door hasn't opened yet.
              {bench.avgShowUpPct > 0 && bench.eventsCompared > 0 && (
                <> Across your last {bench.eventsCompared} event{bench.eventsCompared === 1 ? "" : "s"},{" "}
                  <strong>{Math.round(bench.avgShowUpPct)}%</strong> of RSVPs showed up — plan the room for
                  about <strong>{Math.round((fill.partyTotal || fill.rsvps) * bench.avgShowUpPct / 100)}</strong>.</>
              )}
            </Empty>
          ) : (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "baseline" }}>
              <Big v={night.pulledUp} label="pulled up" color={colors.accent} />
              <BenchStat
                v={night.showUpPct} unit="%"
                label="of RSVPs showed"
                benchV={bench.avgShowUpPct}
                benchN={bench.eventsCompared}
              />
              {event.phase === "live" && (
                <span style={{ fontSize: 12, fontWeight: 700, color: colors.success }}>doors are open</span>
              )}
            </div>
          )}
        </Chapter>

        {/* ─── Chapter 4 · AFTERLIFE ─── */}
        <Chapter n="04" title="Afterlife" sub="does the room outlive the night" last>
          {event.phase !== "ended" ? (
            <Empty>Begins after the night — the room, the drops, who comes back.</Empty>
          ) : (
            <>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "baseline", marginBottom: 12 }}>
                <Big v={afterlife.entered} label="entered the room" />
                <Big v={afterlife.returned1d} label={`came back after the night${afterlife.returned7d ? ` · ${afterlife.returned7d} a week later` : ""}`} color={colors.accent} />
                <Big v={afterlife.messages} label={afterlife.guestMessages > 0
                  ? `messages · ${pct(afterlife.guestMessages, afterlife.messages)}% from guests`
                  : "messages"} color={colors.secondary} />
              </div>
              {night.pulledUp > 0 && afterlife.returned1d > 0 && (
                <p style={{ fontSize: 12.5, color: colors.text, fontWeight: 600, margin: "0 0 8px" }}>
                  {pct(afterlife.returned1d, night.pulledUp)}% of the people who showed up came back to the room.
                  That's the number that compounds.
                </p>
              )}
              <p style={{ fontSize: 12, color: afterlife.hostDroppedAfter ? colors.secondary : colors.textMuted, margin: 0 }}>
                {afterlife.hostDroppedAfter
                  ? "✓ You dropped something after the night — that's what gives people a reason to return."
                  : "You haven't dropped anything in the room since the night — the photos, the track, the next invite. That's the single biggest afterlife lever."}
              </p>
              {afterlife.entered === 0 && (
                <p style={{ fontSize: 10.5, color: colors.textFaded, margin: "8px 0 0" }}>
                  Room presence tracking started Jun 12, 2026 — earlier visits weren't recorded.
                </p>
              )}
            </>
          )}
        </Chapter>

        {money?.revenue > 0 && (
          <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 18 }}>
            Paid: {(money.revenue / 100).toLocaleString()} {String(money.currency || "sek").toUpperCase()} collected.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── The verdict — the page's whole answer in one sentence ───────────────

function Verdict({ event, fill, night, afterlife, people, bench }) {
  // Stable per-mount "now" — the verdict shouldn't drift across re-renders.
  const [now] = useState(() => Date.now());
  let text;
  if (event.phase === "upcoming") {
    const daysOut = event.startsAt ? Math.max(0, Math.ceil((new Date(event.startsAt) - now) / 86400000)) : null;
    const conv = fill.conversionPct != null ? `${fill.conversionPct}% of visitors say yes` : null;
    const comp = conv && bench.avgConversionPct
      ? fill.conversionPct >= bench.avgConversionPct ? " — ahead of your usual" : ` — you usually convert ${bench.avgConversionPct}%`
      : "";
    text = [
      daysOut != null ? `${daysOut} day${daysOut === 1 ? "" : "s"} out` : null,
      `${fill.rsvps} in${fill.partyTotal > fill.rsvps ? ` (${fill.partyTotal} with +1s)` : ""}`,
      conv ? conv + comp : null,
    ].filter(Boolean).join(" · ");
  } else if (event.phase === "live") {
    text = `Doors are open — ${night.pulledUp} pulled up so far of ${fill.rsvps} expected.`;
  } else if (event.phase === "ended") {
    const back = night.pulledUp > 0 && afterlife.returned1d > 0
      ? ` · ${Math.round((afterlife.returned1d / night.pulledUp) * 100)}% came back to the room`
      : "";
    text = `${night.pulledUp} pulled up (${night.showUpPct ?? 0}% of RSVPs)${back}.`;
  } else {
    text = "Publish the event to start its story.";
  }
  const newNote = event.phase === "upcoming" && people.total > 0 && people.shownUpBefore > 0
    ? ` ${people.shownUpBefore} of them have shown up for you before.`
    : "";
  return (
    <p style={{ margin: "6px 0 0", fontSize: 13.5, color: colors.textMuted, lineHeight: 1.5 }}>
      {text}{newNote}
    </p>
  );
}

// ─── Chapter scaffolding + atoms ─────────────────────────────────────────

function Chapter({ n, title, sub, children, last }) {
  return (
    <div style={{ padding: "18px 0", borderBottom: last ? "none" : `1px solid ${colors.borderFaint}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: colors.accent, letterSpacing: "0.08em" }}>{n}</span>
        <SectionLabel>{title}</SectionLabel>
        <span style={{ fontSize: 11, color: colors.textFaded }}>{sub}</span>
      </div>
      {children}
    </div>
  );
}

function Big({ v, label, color }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontSize: 24, fontWeight: 700, color: color || colors.text }}>
        {Number(v || 0).toLocaleString()}
      </span>
      <span style={{ fontSize: 12, color: colors.textSubtle }}>{label}</span>
    </div>
  );
}

// A rate with the host's own average right beside it — the only comparator.
function BenchStat({ v, unit, label, benchV, benchN }) {
  if (v == null) return null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontSize: 24, fontWeight: 700, color: colors.secondary }}>{v}{unit}</span>
      <span style={{ fontSize: 12, color: colors.textSubtle }}>{label}</span>
      {benchV != null && benchN > 0 && (
        <span style={{ fontSize: 10.5, color: colors.textFaded }}>
          you usually: {benchV}{unit}
        </span>
      )}
    </div>
  );
}

function FillBar({ taken, capacity }) {
  const share = Math.min(100, Math.round((taken / capacity) * 100));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: colors.textSubtle, marginBottom: 4 }}>
        <span>{taken} of {capacity} spots</span>
        <span style={{ fontWeight: 700, color: share >= 90 ? colors.accent : colors.textMuted }}>{share}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: colors.borderFaint, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${share}%`, borderRadius: 4,
          background: `linear-gradient(90deg, ${colors.secondary}, ${colors.accent})`,
          transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  );
}

// Returning vs new — one bar, three truths.
function ReturningSplit({ people }) {
  const segs = [
    { key: "shownUpBefore", n: people.shownUpBefore, label: "shown up for you before", color: colors.accent },
    { key: "rsvpedBeforeOnly", n: people.rsvpedBeforeOnly, label: "RSVP'd before, never made it", color: colors.secondary },
    { key: "newFaces", n: people.newFaces, label: "brand new faces", color: "rgba(10,10,10,0.25)" },
  ].filter((s) => s.n > 0);
  return (
    <div>
      <div style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
        {segs.map((s) => (
          <div key={s.key} style={{ width: `${(s.n / people.total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {segs.map((s) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: colors.textMuted }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
            <strong style={{ color: colors.text }}>{s.n}</strong> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Empty({ children }) {
  return (
    <p style={{
      margin: 0, fontSize: 12.5, color: colors.textSubtle, lineHeight: 1.6,
      padding: "14px 16px", borderRadius: 12, border: `1px dashed ${colors.border}`, background: "#fff",
    }}>
      {children}
    </p>
  );
}

// Loading/error states keep `page-with-header` so they sit BELOW the event
// menu bar (rendered by ProtectedLayout), not under it — the bar stays
// present and usable while the story loads or if it fails.
function Center({ children }) {
  return (
    <div className="page-with-header" style={{ minHeight: "60vh", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 13, color: colors.textFaded }}>{children}</div>
    </div>
  );
}
