// Admin analytics — the Rooms tab: is the Room being used, and does it
// outlive the night?
//
// One call (GET /admin/analytics/rooms-view). The hero number is AFTERLIFE:
// of the people who pulled up to an ended event, the share who came back to
// its room 1+ days after the night. That's "relationships outlive events"
// as a single percentage. Below it: reach (do guests even get in), pulse
// (is anyone talking, and is it only the host), and the per-room table.

import { useEffect, useState } from "react";
import { authenticatedFetch } from "../../lib/api.js";
import { colors } from "../../theme/colors.js";
import { SectionLabel } from "./chartKit.jsx";

function pct(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}

export function RoomsOverview({ dateRange }) {
  const [data, setData] = useState(undefined);

  const startIso = dateRange.startDate ? dateRange.startDate.toISOString() : null;
  const endIso = dateRange.endDate ? dateRange.endDate.toISOString() : null;

  useEffect(() => {
    if (!startIso || !endIso) return;
    let cancelled = false;
    const params = new URLSearchParams({ startDate: startIso, endDate: endIso });
    authenticatedFetch(`/admin/analytics/rooms-view?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => { if (!cancelled) setData(json); })
      .catch(() => { if (!cancelled) setData((prev) => prev ?? null); });
    return () => { cancelled = true; };
  }, [startIso, endIso]);

  if (data === undefined) {
    return <div style={{ padding: 40, textAlign: "center", color: colors.textSubtle, fontSize: 13 }}>Loading…</div>;
  }
  if (!data) {
    return <div style={{ padding: 40, textAlign: "center", color: colors.textSubtle, fontSize: 13 }}>Couldn't load rooms analytics.</div>;
  }

  const k = data.kpis || {};
  const rooms = data.rooms || [];
  const afterlife = pct(k.afterlifeBack, k.afterlifeBase);
  const guestShare = pct(k.guestMessages, k.messages);
  // Presence tracking shipped 2026-06-12 — until views accumulate, presence-
  // derived numbers read 0 and deserve an honest "collecting" framing.
  const collecting = Number(k.roomViews || 0) === 0;

  return (
    <>
      {/* ─── Afterlife hero ─── */}
      <div style={{
        display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap",
        borderRadius: 14, border: `1px solid ${colors.accentBorder}`,
        background: colors.accentSoft, padding: "16px 20px", marginBottom: 24,
      }}>
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: colors.accent }}>
            Afterlife — the thesis metric
          </div>
          <div style={{ fontSize: 38, fontWeight: 800, color: colors.text, lineHeight: 1.1, marginTop: 2 }}>
            {afterlife !== null && !collecting ? `${afterlife}%` : "—"}
          </div>
          <div style={{ fontSize: 12, color: colors.textMuted, maxWidth: 460, lineHeight: 1.5, marginTop: 4 }}>
            Of the <strong>{Number(k.afterlifeBase || 0).toLocaleString()}</strong> people who pulled up
            to an ended event, how many came back to its room at least a day after the night.
            {collecting && " Presence tracking went live Jun 12 — this fills in as rooms get re-entered."}
          </div>
        </div>
      </div>

      {/* ─── KPI strip ─── */}
      <div style={{ marginBottom: 24 }}>
        <SectionLabel>Room activity in this range</SectionLabel>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline" }}>
          <Kpi value={Number(k.roomsAlive || 0)} label="rooms alive" sub="had a visit or a message" />
          <Kpi value={Number(k.roomViews || 0)} label="room visits" hint={collecting ? "collecting" : null} />
          <Kpi value={Number(k.roomPeople || 0)} label="people in rooms" hint={collecting ? "collecting" : null} />
          <Kpi
            value={Number(k.messages || 0)}
            label="messages"
            sub={guestShare !== null ? `${guestShare}% from guests` : null}
            subColor={guestShare > 0 ? colors.secondary : colors.textFaded}
          />
        </div>
      </div>

      {/* ─── Per-room table ─── */}
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>Every room — most recently alive first</SectionLabel>
        <div style={{
          borderRadius: 14, background: "#fff", border: `1px solid ${colors.border}`,
          overflow: "hidden", boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
        }}>
          <div style={{ ...rowStyle, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, color: colors.textFaded, background: colors.surface }}>
            <span style={{ flex: 1, minWidth: 0 }}>Room</span>
            <span style={cellNum}>Pulled up</span>
            <span style={cellNum}>Entered</span>
            <span style={cellWide}>Pulse</span>
            <span style={cellNum}>Afterlife</span>
            <span style={cellTiny}>Drop after</span>
          </div>
          {rooms.length === 0 && (
            <div style={{ padding: "18px 16px", fontSize: 12.5, color: colors.textSubtle }}>
              No rooms with activity yet.
            </div>
          )}
          {rooms.map((r, i) => (
            <RoomRow key={r.id} room={r} last={i === rooms.length - 1} />
          ))}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 10.5, color: colors.textFaded, lineHeight: 1.5 }}>
          Entered = signed-in guests who ever opened the room (excludes the host). Pulse = messages
          in the selected range, teal share from guests. Afterlife = pulled-up guests back in the
          room 1+ days after the night (· 7d+ in parentheses). Drop after = host posted something
          once the night was over.
        </p>
      </div>
    </>
  );
}

const rowStyle = {
  display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
};
const cellNum = { width: 64, textAlign: "right", flexShrink: 0 };
const cellWide = { width: 120, flexShrink: 0 };
const cellTiny = { width: 64, textAlign: "center", flexShrink: 0 };

function RoomRow({ room: r, last }) {
  const reach = pct(r.entered, r.rsvps);
  const afterlife = pct(r.backPulled1d, r.pulledUp);
  const guestShare = pct(r.guestMsgsInRange, r.msgsInRange);
  const dateLabel = r.startsAt
    ? new Date(r.startsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : "no date";
  return (
    <div style={{ ...rowStyle, borderTop: `1px solid ${colors.borderFaint}`, borderBottom: last ? "none" : undefined }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.title || "Untitled"}
        </div>
        <div style={{ fontSize: 10, color: colors.textFaded }}>
          {dateLabel} · {r.ended ? "ended" : "upcoming"} · {r.rsvps} RSVP{r.rsvps === 1 ? "" : "s"}
        </div>
      </div>
      <span style={{ ...cellNum, fontSize: 12.5, fontWeight: 600, color: colors.text }}>
        {r.pulledUp || "—"}
      </span>
      <span style={{ ...cellNum, fontSize: 12.5, fontWeight: 600, color: r.entered ? colors.text : colors.textFaded }}>
        {r.entered ? `${r.entered}${reach !== null ? ` · ${reach}%` : ""}` : "—"}
      </span>
      <span style={{ ...cellWide, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: r.msgsInRange ? colors.text : colors.textFaded, width: 24, textAlign: "right" }}>
          {r.msgsInRange || "—"}
        </span>
        {r.msgsInRange > 0 && (
          <span style={{ flex: 1, height: 4, borderRadius: 2, background: colors.borderFaint, overflow: "hidden", display: "flex" }}>
            <span style={{ width: `${guestShare || 0}%`, background: colors.secondary }} />
            <span style={{ flex: 1, background: colors.textFaded, opacity: 0.4 }} />
          </span>
        )}
      </span>
      <span style={{ ...cellNum, fontSize: 12.5, fontWeight: 700, color: afterlife ? colors.accent : colors.textFaded }}>
        {r.ended
          ? afterlife !== null && r.backPulled1d > 0
            ? `${afterlife}% (${r.backPulled7d})`
            : "—"
          : ""}
      </span>
      <span style={{ ...cellTiny, fontSize: 13 }}>
        {r.ended ? (r.hostAfter ? <span style={{ color: colors.secondary, fontWeight: 700 }}>✓</span> : <span style={{ color: colors.textFaded }}>—</span>) : ""}
      </span>
    </div>
  );
}

function Kpi({ value, label, sub, subColor, hint }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontSize: 24, fontWeight: 700, color: colors.text }}>{Number(value).toLocaleString()}</span>
      <span style={{ fontSize: 12, color: colors.textSubtle }}>{label}</span>
      {sub && <span style={{ fontSize: 11, fontWeight: 600, color: subColor || colors.textFaded }}>{sub}</span>}
      {hint && <span style={{ fontSize: 10, color: colors.textFaded }}>{hint}</span>}
    </div>
  );
}
