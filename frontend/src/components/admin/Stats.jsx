import { useState } from "react";

/* The organiser's statistics, drawn (backend lib/eventStats.js): a row of
   numbers, visits and sign-ups day by day as two charts on the same days
   (never one chart with two scales), where visits and sign-ups came from as
   bars, and — for a main brand — one row per brand. One hue: pink for the
   measure, ink for the text. Every chart has its numbers on hover and a
   plain list next to it, so nothing is read off colour alone. */

import { SOURCE_SV, fmt, pct } from "./statsFormat.js";

const label = (k, map = SOURCE_SV) => map[k] || k;

export function Tiles({ totals, extra = [] }) {
  const items = [
    ["Besök", fmt(totals.visits), totals.visitors ? `${fmt(totals.visitors)} besökare` : null],
    ["Anmälda", fmt(totals.signups), totals.waitlist ? `${fmt(totals.waitlist)} i kö` : null],
    ["Konvertering", pct(totals.conversion), "besökare som anmälde sig"],
    ["Kom", fmt(totals.came), totals.signups ? `${Math.round((totals.came / totals.signups) * 100)} % av anmälda` : null],
    ["Vill ha inbjudningar", fmt(totals.consents), totals.signups ? `${Math.round((totals.consents / totals.signups) * 100)} % av anmälda` : null],
    ...extra,
  ];
  return (
    <div className="st-tiles">
      {items.map(([k, v, sub]) => (
        <div key={k}>
          <span>{k}</span>
          <b>{v}</b>
          {sub && <small>{sub}</small>}
        </div>
      ))}
    </div>
  );
}

const dayLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

// One measure per chart, bars per day, a crosshair tooltip with both numbers.
function Bars({ daily, k, hover, setHover, height }) {
  const max = Math.max(1, ...daily.map((d) => d[k]));
  const n = daily.length;
  return (
    <div className="st-bars" style={{ height }} onMouseLeave={() => setHover(null)}>
      {daily.map((d, i) => (
        <button
          key={d.day}
          type="button"
          className={hover === i ? "is-hover" : ""}
          style={{ width: `${100 / n}%` }}
          onMouseEnter={() => setHover(i)}
          onFocus={() => setHover(i)}
          aria-label={`${dayLabel(d.day)}: ${d.visits} besök, ${d.signups} anmälningar`}
        >
          <i style={{ height: d[k] ? `max(3px, ${(d[k] / max) * 100}%)` : 0 }} />
        </button>
      ))}
      <span className="st-max">{fmt(max)}</span>
    </div>
  );
}

export function Daily({ daily, title = "Dag för dag" }) {
  const [hover, setHover] = useState(null);
  if (!daily?.length) return null;
  const h = hover != null ? daily[hover] : null;
  const sum = (k) => daily.reduce((s, d) => s + d[k], 0);
  if (!sum("visits") && !sum("signups")) {
    return (
      <section className="st-card">
        <div className="st-card-head"><h3>{title}</h3></div>
        <p className="ea-muted st-empty">Inga besök eller anmälningar än. Dela länken så syns de här, dag för dag.</p>
      </section>
    );
  }
  return (
    <section className="st-card">
      <div className="st-card-head">
        <h3>{title}</h3>
        <p className="st-read">{h ? <><b>{dayLabel(h.day)}</b> · {fmt(h.visits)} besök · {fmt(h.signups)} anmälningar</> : <>{fmt(sum("visits"))} besök · {fmt(sum("signups"))} anmälningar</>}</p>
      </div>
      <p className="st-axis-label">Besök</p>
      <Bars daily={daily} k="visits" hover={hover} setHover={setHover} height={110} />
      <p className="st-axis-label">Anmälningar</p>
      <Bars daily={daily} k="signups" hover={hover} setHover={setHover} height={56} />
      <div className="st-days"><span>{dayLabel(daily[0].day)}</span><span>{dayLabel(daily[daily.length - 1].day)}</span></div>
    </section>
  );
}

export function Breakdown({ title, rows, map, empty = "Inget än.", note }) {
  const total = rows.reduce((s, r) => s + r.n, 0);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="st-card">
      <div className="st-card-head"><h3>{title}</h3>{total > 0 && <p className="st-read">{fmt(total)}</p>}</div>
      {rows.length ? (
        <ul className="st-list">
          {rows.slice(0, 8).map((r) => (
            <li key={r.key} title={`${label(r.key, map)}: ${r.n}`}>
              <span className="st-list-name">{label(r.key, map)}</span>
              <span className="st-list-bar"><i style={{ width: `${(r.n / max) * 100}%` }} /></span>
              <b>{fmt(r.n)}</b>
              <small>{Math.round((r.n / total) * 100)} %</small>
            </li>
          ))}
        </ul>
      ) : <p className="ea-muted st-empty">{empty}</p>}
      {note && <p className="ea-muted st-note">{note}</p>}
    </section>
  );
}

