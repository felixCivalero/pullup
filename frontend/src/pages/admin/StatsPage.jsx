import { useEffect, useState } from "react";
import { authenticatedFetch } from "../../lib/api.js";
import { AdminShell } from "./AdminShell.jsx";

/* /admin — the site's numbers, kept simple: page views, CTA clicks (someone
   opened "Jobba med mig") and requests sent, per day; then the leads. */
const RANGES = [7, 30, 90];
// CTA clicks are only tracked from this day on (request_open went live then).
const CLICKS_SINCE = "2026-10-19";

const nf = new Intl.NumberFormat("sv-SE");
const pct = (a, b) => (b ? `${(Math.round((a / b) * 1000) / 10).toLocaleString("sv-SE")} %` : "–");
const dayLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
const when = (iso) => new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function StatsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    authenticatedFetch(`/admin/stats?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [days]);

  const t = data?.totals;
  const max = Math.max(1, ...(data?.series || []).map((d) => d.views));

  return (
    <AdminShell title="Statistik">
      <style>{STATS_CSS}</style>
      <div className="st">
        <div className="st-head">
          <h1>Statistik</h1>
          <div className="st-range">
            {RANGES.map((n) => (
              <button key={n} type="button" className={n === days ? "is-on" : ""} onClick={() => { setError(false); setDays(n); }}>{n} dagar</button>
            ))}
          </div>
        </div>

        {error && <p className="st-muted">Kunde inte hämta statistiken.</p>}
        {!data && !error && <p className="st-muted">Hämtar…</p>}

        {data && (
          <>
            <div className="st-kpis">
              <div><span>Visningar</span><b>{nf.format(t.views)}</b></div>
              <div><span>CTA-klick</span><b>{nf.format(t.clicks)}</b><em>{pct(t.clicks, t.views)} av visningarna</em></div>
              <div><span>Förfrågningar</span><b>{nf.format(t.requests)}</b><em>{pct(t.requests, t.clicks)} av klicken</em></div>
            </div>

            <div className="st-chart" aria-label="Visningar och CTA-klick per dag">
              {data.series.map((d) => (
                <div key={d.date} className="st-col" title={`${dayLabel(d.date)}: ${d.views} visningar, ${d.clicks} klick, ${d.requests} förfrågningar`}>
                  <div className="st-bar" style={{ height: `${(d.views / max) * 100}%` }}>
                    {d.clicks > 0 && <div className="st-click" style={{ height: `${Math.min(100, (d.clicks / Math.max(d.views, 1)) * 100)}%` }} />}
                  </div>
                  {d.requests > 0 && <i className="st-req">{d.requests}</i>}
                </div>
              ))}
            </div>
            <div className="st-legend">
              <span><i className="lg-v" />Visningar</span>
              <span><i className="lg-c" />CTA-klick</span>
              <span><i className="lg-r" />Förfrågan</span>
              <span className="st-muted">CTA-klick räknas från {dayLabel(CLICKS_SINCE)}.</span>
            </div>

            <table className="st-table">
              <thead><tr><th>Dag</th><th>Visningar</th><th>CTA-klick</th><th>Förfrågningar</th></tr></thead>
              <tbody>
                {[...data.series].reverse().map((d) => (
                  <tr key={d.date}>
                    <td>{dayLabel(d.date)}</td>
                    <td>{nf.format(d.views)}</td>
                    <td>{d.clicks ? nf.format(d.clicks) : "–"}</td>
                    <td>{d.requests ? nf.format(d.requests) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2>Leads</h2>
            {data.leads.length === 0 && <p className="st-muted">Inga förfrågningar än.</p>}
            <ul className="st-leads">
              {data.leads.map((l) => (
                <li key={l.id}>
                  <div className="st-lead-top">
                    <b>{l.name}{l.company ? <span> · {l.company}</span> : null}</b>
                    <time>{when(l.created_at)}</time>
                  </div>
                  <a href={`mailto:${l.email}`}>{l.email}</a>
                  {l.description && <p>{l.description}</p>}
                  {l.preferred_time && <p className="st-muted">Kan prata: {l.preferred_time}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </AdminShell>
  );
}

const STATS_CSS = `
  .st { max-width: 960px; margin: 0 auto; padding: clamp(24px, 5vw, 48px) 16px 64px; }
  .st-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
  .st h1 { margin: 0; font-size: clamp(28px, 5vw, 40px); font-weight: 700; letter-spacing: -0.035em; }
  .st h2 { margin: 48px 0 12px; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
  .st-muted { color: #6e6e73; font-size: 14px; }
  .st-range { display: flex; gap: 4px; padding: 3px; border-radius: 999px; background: #f2f2f2; }
  .st-range button { font: inherit; font-size: 13px; font-weight: 600; padding: 6px 12px; border: 0; border-radius: 999px; background: none; color: #6e6e73; cursor: pointer; }
  .st-range button.is-on { background: #fff; color: #0a0a0a; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .st-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .st-kpis > div { border: 1px solid rgba(0,0,0,0.1); border-radius: 16px; padding: 16px; display: grid; gap: 4px; }
  .st-kpis span { font-size: 13px; color: #6e6e73; }
  .st-kpis b { font-size: clamp(26px, 4vw, 34px); font-weight: 700; letter-spacing: -0.03em; line-height: 1.1; }
  .st-kpis em { font-style: normal; font-size: 12.5px; color: #D9480F; font-weight: 600; }
  @media (max-width: 600px) { .st-kpis { grid-template-columns: 1fr; } }
  .st-chart { margin-top: 24px; height: 180px; display: flex; align-items: flex-end; gap: 2px; border-bottom: 1px solid rgba(0,0,0,0.12); }
  .st-col { position: relative; flex: 1; height: 100%; display: flex; align-items: flex-end; }
  .st-bar { position: relative; width: 100%; min-height: 1px; border-radius: 3px 3px 0 0; background: #d4d4d8; display: flex; align-items: flex-end; overflow: hidden; }
  .st-click { width: 100%; background: #D9480F; }
  .st-col:hover .st-bar { background: #a1a1aa; }
  .st-req { position: absolute; left: 50%; bottom: calc(100% + 2px); translate: -50% 0; font-style: normal; font-size: 10px; font-weight: 700; color: #fff; background: #0a0a0a; border-radius: 999px; min-width: 16px; height: 16px; display: grid; place-items: center; }
  .st-col .st-req { bottom: auto; top: -18px; }
  .st-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; font-size: 12.5px; color: #3a3a3e; align-items: center; }
  .st-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
  .lg-v { background: #d4d4d8; } .lg-c { background: #D9480F; } .lg-r { background: #0a0a0a; border-radius: 50% !important; }
  .st-table { width: 100%; margin-top: 28px; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
  .st-table th { text-align: left; font-size: 12px; font-weight: 600; color: #6e6e73; padding: 8px 6px; border-bottom: 1px solid rgba(0,0,0,0.12); }
  .st-table td { padding: 8px 6px; border-bottom: 1px solid rgba(0,0,0,0.06); }
  .st-table th:not(:first-child), .st-table td:not(:first-child) { text-align: right; }
  .st-leads { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .st-leads li { border: 1px solid rgba(0,0,0,0.1); border-radius: 14px; padding: 14px 16px; display: grid; gap: 4px; }
  .st-lead-top { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .st-lead-top b span { font-weight: 500; color: #6e6e73; }
  .st-lead-top time { font-size: 12.5px; color: #6e6e73; }
  .st-leads a { font-size: 14px; color: #0a0a0a; text-decoration-color: #D9480F; text-underline-offset: 3px; justify-self: start; }
  .st-leads p { margin: 4px 0 0; font-size: 14px; line-height: 1.5; color: #3a3a3e; white-space: pre-wrap; }
`;
