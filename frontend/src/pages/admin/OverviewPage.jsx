import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { authenticatedFetch } from "../../lib/api.js";
import { AdminShell } from "./AdminShell.jsx";
import { Journey, VISITS_CSS } from "./Visits.jsx";
import { fmt } from "../../components/admin/statsFormat.js";

/* /admin — Översikt (owner): the agency and the event tool as one picture
   (backend lib/overview.js). Today's work from both sides; where people came
   from and how far they got, whichever product they ended up in; and everyone
   who moved, one row each with their whole path and what to do next. The
   detail stays on its own pages: Sajten (the site's traffic and journeys),
   Byrå → Sälj, Eventverktyget → Plattform and Utskick. */
const RANGES = [7, 30, 90];
const TRACK = { byra: "Byrå", event: "Event" };
const FILTERS = [["all", "Alla"], ["byra", "Byrå"], ["event", "Eventverktyget"], ["none", "Utanför listorna"]];
const day = (iso) => (iso ? new Date(String(iso).length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" }) : "");
function ago(iso) {
  if (!iso) return "";
  const min = Math.round((Date.now() - Date.parse(String(iso).length === 10 ? `${iso}T12:00:00` : iso)) / 60000);
  if (min < 60) return `${Math.max(1, min)} min sedan`;
  if (min < 60 * 24) return `${Math.round(min / 60)} h sedan`;
  const d = Math.round(min / 1440);
  return d === 1 ? "i går" : `${d} dagar sedan`;
}

// The columns of the flow table: [key on a list row, key on a traffic row, label].
const COLS = [
  ["mailed", null, "Mejlade"],
  ["visited", "visits", "Besök"],
  ["read", "read", "Läste vidare"],
  ["tested", "tested", "Testade sajten"],
  ["tool", "tool", "Eventverktyget"],
  ["accounts", null, "Nytt konto"],
  ["answered", "requests", "Svar / förfrågan"],
  ["meetings", null, "Möte"],
];

function Cell({ n, of }) {
  if (n == null) return <td className="num ov-none">–</td>;
  return (
    <td className="num">
      <span className={n ? "" : "ov-zero"}>{fmt(n)}</span>
      {of > 0 && <i className="ov-bar"><i style={{ width: `${Math.min(100, (n / of) * 100)}%` }} /></i>}
    </td>
  );
}

function Flows({ flows, sources, other }) {
  return (
    <section className="st-card">
      <div className="st-card-head"><h3>Varifrån och hur långt</h3><span className="ea-muted">listorna räknar personer, trafiken räknar besök</span></div>
      <div className="ea-wrap"><table className="ea-table st-table ov-flows">
        <thead><tr><th>Varifrån</th>{COLS.map(([, , label]) => <th key={label} className="num">{label}</th>)}</tr></thead>
        <tbody>
          {flows.map((r) => (
            <tr key={r.key} className="ov-list">
              <td><b>{r.label}</b></td>
              {COLS.map(([k, , label]) => <Cell key={label} n={r[k]} of={r.mailed} />)}
            </tr>
          ))}
          <tr className="ov-split"><td colSpan={COLS.length + 1}>Utan mejl</td></tr>
          {sources.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              {COLS.map(([, k, label]) => <Cell key={label} n={k ? r[k] : null} of={r.visits} />)}
            </tr>
          ))}
          <tr className="ov-total">
            <td>Utan mejl, totalt</td>
            {COLS.map(([k, t, label]) => <Cell key={label} n={k === "accounts" ? other.accounts : t ? other[t] : null} of={0} />)}
          </tr>
        </tbody>
      </table></div>
      <p className="ea-muted st-note">Besök från en lista räknas när mottagaren klickat själv. Länkar som bara mejlfilter öppnat räknas inte. Ett nytt konto räknas för listan om det skapats efter mejlet. Konton utan mejl är de som hittat verktyget på egen hand.</p>
    </section>
  );
}

function Steps({ p }) {
  const s = [];
  if (p.dateSent) s.push(["", `Mejlad ${day(p.dateSent)}`]);
  if (p.visited) s.push(["", p.visits > 1 ? `Klickade, ${p.visits} besök` : "Klickade"]);
  if (p.read) s.push(["", "Läste vidare"]);
  if (p.check) s.push([p.blocked ? "is-hot" : "", `Sajttest: ${p.check}`]);
  if (p.tool) s.push(["", "Eventverktyget"]);
  if (p.account) s.push(["is-good", `Konto ${day(p.account.createdAt)}${p.account.events ? ` · ${p.account.events} event${p.account.published ? `, ${p.account.published} publ.` : ""}` : ""}`]);
  if (p.lead) s.push(["is-hot", "Skickade förfrågan"]);
  if (p.met) s.push(["is-good", "Möte bokat"]);
  else if (p.answered) s.push(["is-good", "Svarade"]);
  return <span className="ov-steps">{s.map(([c, t], i) => <em key={i} className={c || undefined}>{t}</em>)}</span>;
}

function People({ people }) {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);
  const shown = people.filter((p) => filter === "all" || (filter === "none" ? p.kind === "check" || p.kind === "lead" || p.kind === "account" : p.track === filter && p.kind === "prospect") || (filter === "event" && p.kind === "account"));
  return (
    <section className="st-card">
      <div className="st-card-head">
        <h3>Folk i rörelse <span className="ea-muted">{fmt(shown.length)}</span></h3>
        <div className="ov-filters">
          {FILTERS.map(([k, label]) => <button key={k} type="button" className={k === filter ? "is-on" : ""} onClick={() => setFilter(k)}>{label}</button>)}
        </div>
      </div>
      {!shown.length && <p className="ea-muted st-empty">Ingen här under perioden.</p>}
      <ul className="ov-people">
        {shown.map((p) => (
          <li key={`${p.kind}-${p.id}`}>
            <div className="ov-person">
              <span className={`ov-tag is-${p.kind === "prospect" ? p.track : p.kind}`}>{p.kind === "prospect" ? TRACK[p.track] : p.kind === "lead" ? "Förfrågan" : p.kind === "check" ? "Sajttest" : "Nytt konto"}</span>
              <div className="ov-who">
                <b>{p.name}</b>
                {p.sub && <small>{p.sub}</small>}
                <Steps p={p} />
              </div>
              <div className="ov-next">
                <time>{ago(p.last)}</time>
                {p.hint && <strong>{p.hint}</strong>}
                {p.visitId && <button type="button" className="st-journey-btn" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "Dölj resan" : "Visa resan"}</button>}
              </div>
            </div>
            {open === p.id && <Journey id={p.visitId} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OverviewPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    authenticatedFetch(`/admin/overview?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && (setData(d), setError(false)))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [days]);
  return (
    <AdminShell title="Översikt">
      <OverviewBody data={data} error={error} days={days} onDays={(n) => { setData(null); setDays(n); }} />
    </AdminShell>
  );
}

// The page without the shell (it's drawn on its own in a test harness too).
export function OverviewBody({ data, error, days, onDays }) {
  const w = data?.todayWork;
  return (
    <>
      <style>{VISITS_CSS + OV_CSS}</style>
      <div className="ea ov">
        <div className="ea-head">
          <div><h1>Översikt</h1><p className="ea-muted">Byrån och eventverktyget i en bild: vad som väntar i dag, var folk kommer ifrån och vilka som rör sig.</p></div>
          <div className="ov-range">
            {RANGES.map((n) => <button key={n} type="button" className={n === days ? "is-on" : ""} onClick={() => onDays(n)}>{n} dagar</button>)}
          </div>
        </div>
        {error && <p className="ea-error">Kunde inte hämta översikten.</p>}
        {!data && !error && <p className="ea-muted">Hämtar…</p>}
        {data && (
          <>
            <div className="ov-today">
              <Link to="/admin/sales" className="ov-side">
                <span>Byrå · i dag</span>
                <div>
                  <p><b>{fmt(w.agency.sent)}<small> / {fmt(w.agency.perDay)}</small></b>mejl skickade</p>
                  <p><b>{fmt(w.agency.waiting)}</b>väntar på dig</p>
                  <p><b>{fmt(w.agency.meetings)}</b>{w.agency.meetings === 1 ? "bokat möte" : "bokade möten"}</p>
                </div>
                <em>Till Sälj →</em>
              </Link>
              <Link to="/admin/free-tool" className="ov-side is-tool">
                <span>Eventverktyget · i dag</span>
                <div>
                  <p><b>{fmt(w.tool.mailedToday)}</b>mejlade i dag</p>
                  <p><b>{fmt(w.tool.accounts7)}</b>nya konton, 7 dagar</p>
                  <p><b>{fmt(w.tool.published)}</b>publicerade event · {fmt(w.tool.upcoming)} kommande</p>
                </div>
                <em>Till utskicken →</em>
              </Link>
            </div>
            <Flows flows={data.flows} sources={data.sources} other={data.other} />
            <People people={data.people} />
          </>
        )}
      </div>
    </>
  );
}

const OV_CSS = `
  .ov { max-width: 1120px; margin: 0 auto; padding: clamp(24px, 5vw, 48px) 16px 64px; }
  .ov .ea-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
  .ov h1 { margin: 0; font-size: clamp(28px, 5vw, 40px); font-weight: 700; letter-spacing: -0.035em; }
  .ov .ea-muted { color: #6e6e73; font-size: 14px; margin: 4px 0 0; }
  .ov .ea-error { color: #b42318; }
  .ov-range, .ov-filters { display: flex; gap: 4px; padding: 3px; border-radius: 999px; background: #f2f2f2; }
  .ov-range button, .ov-filters button { font: inherit; font-size: 13px; font-weight: 600; padding: 6px 12px; border: 0; border-radius: 999px; background: none; color: #6e6e73; cursor: pointer; white-space: nowrap; }
  .ov-range button.is-on, .ov-filters button.is-on { background: #fff; color: #0a0a0a; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .ov-today { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  @media (max-width: 760px) { .ov-today { grid-template-columns: 1fr; } }
  .ov-side { display: grid; gap: 10px; padding: 16px 18px; border-radius: 16px; border: 1px solid rgba(0,0,0,0.1); color: inherit; text-decoration: none; border-top: 4px solid #ec178f; }
  .ov-side.is-tool { border-top-color: #0E9384; }
  .ov-side:hover { border-color: rgba(0,0,0,0.25); }
  .ov-side > span { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6e6e73; }
  .ov-side > div { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .ov-side p { margin: 0; display: grid; font-size: 12.5px; color: #6e6e73; }
  .ov-side b { font-size: clamp(24px, 3vw, 30px); letter-spacing: -0.03em; color: #0a0a0a; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .ov-side b small { font-size: .5em; color: #8a8a8e; }
  .ov-side em { font-style: normal; font-size: 13px; font-weight: 600; justify-self: end; }
  .ov .st-card { border: 1px solid rgba(0,0,0,0.1); border-radius: 14px; padding: 14px 16px 16px; background: #fff; margin: 0 0 14px; min-width: 0; }
  .ov .st-card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 0 0 10px; flex-wrap: wrap; }
  .ov .st-card h3 { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
  .ov .st-card-head .ea-muted { margin: 0; font-size: 12.5px; }
  .ov .ea-wrap { overflow-x: auto; }
  .ov-flows { width: 100%; border-collapse: collapse; font-size: 13.5px; font-variant-numeric: tabular-nums; }
  .ov-flows th { font-size: 11.5px; font-weight: 600; color: #6e6e73; text-align: left; padding: 6px 8px; border-bottom: 1px solid rgba(0,0,0,0.12); white-space: nowrap; }
  .ov-flows td { padding: 8px; border-bottom: 1px solid rgba(0,0,0,0.06); white-space: nowrap; }
  .ov-flows .num { text-align: right; }
  .ov-flows .ov-list td { font-size: 15px; }
  .ov-flows .ov-zero, .ov-flows .ov-none { color: #c4c4c8; }
  .ov-bar { display: block; height: 4px; margin-top: 4px; border-radius: 2px; background: #f2f1ee; overflow: hidden; min-width: 40px; }
  .ov-bar i { display: block; height: 100%; background: #ec178f; border-radius: 2px; }
  .ov-split td { padding: 18px 8px 6px; font-size: 11.5px; font-weight: 700; color: #6e6e73; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid rgba(0,0,0,0.12); }
  .ov-flows tr:not(.ov-list) .ov-bar i { background: #0E9384; }
  .ov-total td { font-weight: 700; border-top: 1px solid rgba(0,0,0,0.2); }
  .ov .st-note { margin: 10px 0 0; font-size: 12.5px; line-height: 1.5; }
  .ov-people { list-style: none; margin: 0; padding: 0; border-top: 1px solid rgba(0,0,0,0.08); }
  .ov-people > li { padding: 12px 0; border-bottom: 1px solid rgba(0,0,0,0.08); }
  .ov-person { display: grid; grid-template-columns: 92px minmax(0, 1fr) minmax(180px, 280px); gap: 12px; align-items: start; }
  @media (max-width: 760px) { .ov-person { grid-template-columns: 1fr; gap: 6px; } }
  .ov-tag { justify-self: start; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: #f2f2f3; color: #3a3a3c; white-space: nowrap; }
  .ov-tag.is-byra { background: rgba(236,23,143,.12); color: #a50f63; }
  .ov-tag.is-event, .ov-tag.is-account { background: rgba(14,147,132,.12); color: #0b6e63; }
  .ov-tag.is-lead { background: #0a0a0a; color: #fff; }
  .ov-who { display: grid; gap: 2px; min-width: 0; }
  .ov-who b { font-size: 15px; }
  .ov-who small { font-size: 12.5px; color: #8a8a8e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ov-steps { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .ov-steps em { font-style: normal; font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(0,0,0,0.1); color: #3a3a3c; }
  .ov-steps em + em::before { content: ""; }
  .ov-steps em.is-hot { border-color: #0a0a0a; color: #0a0a0a; font-weight: 600; }
  .ov-steps em.is-good { border-color: rgba(14,147,132,.5); color: #0b6e63; font-weight: 600; }
  .ov-next { display: grid; gap: 4px; justify-items: end; text-align: right; }
  @media (max-width: 760px) { .ov-next { justify-items: start; text-align: left; } }
  .ov-next time { font-size: 12px; color: #8a8a8e; }
  .ov-next strong { font-size: 13px; font-weight: 600; }
  .ov .st-journey-btn { font: inherit; font-size: 12.5px; font-weight: 600; padding: 4px 11px; border: 1px solid rgba(0,0,0,0.12); border-radius: 999px; background: #fff; cursor: pointer; }
  .ov-people .vs-journey { margin-top: 10px; }
`;
