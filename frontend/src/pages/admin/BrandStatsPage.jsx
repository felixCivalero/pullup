import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authenticatedFetch } from "../../lib/api.js";
import { setCurrentBrandId, useCurrentBrand } from "../../lib/brand.js";
import { BrandKicker } from "../../components/admin/ByBrand.jsx";
import { Breakdown, Daily, Tiles } from "../../components/admin/Stats.jsx";
import { STATS_CSS, fmt, pct } from "../../components/admin/statsFormat.js";
import { AdminShell } from "./AdminShell.jsx";
import { EVENT_ADMIN_CSS } from "./eventAdminCss.js";

/* /admin/stats — how the brand on screen is doing (backend GET /admin/brand-stats):
   the numbers, the last 60 days, where visits come from, and every event.
   A main brand over other brands compares them, one row each, and a row
   opens that brand. One event's own statistics live on its page. */
export function BrandStatsPage() {
  return (
    <AdminShell title="Statistik">
      <Overview />
    </AdminShell>
  );
}

function Overview() {
  const navigate = useNavigate();
  const brand = useCurrentBrand();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    authenticatedFetch("/admin/brand-stats")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, []);
  const nameOf = (id) => [brand, ...(brand?.under || [])].find((b) => b?.id === id)?.name || "";
  const maxSign = Math.max(1, ...(data?.brands || []).map((b) => b.signups));

  return (
    <>
      <style>{EVENT_ADMIN_CSS + STATS_CSS}</style>
      <div className="ea">
        <div className="ea-head">
          <div>
            <BrandKicker />
            <h1>Statistik</h1>
            {data && <p className="ea-muted">{fmt(data.totals.events)} event{data.brands.length ? ` · ${data.brands.length - 1} varumärken under ${brand?.name || ""}` : ""}</p>}
          </div>
        </div>
        {error && <p className="ea-error">Kunde inte hämta statistiken.</p>}
        {!data && !error && <p className="ea-muted">Hämtar…</p>}
        {data && (
          <>
            <Tiles totals={data.totals} />
            {data.brands.length > 0 && (
              <section className="st-card">
                <div className="st-card-head"><h3>Varumärkena</h3><p className="st-read">Klicka för att gå in i ett varumärke</p></div>
                <div className="ea-wrap">
                  <table className="ea-table st-table">
                    <thead><tr><th>Varumärke</th><th className="num">Event</th><th className="num">Besök</th><th className="num">Anmälda</th><th className="num">Konv.</th><th className="num">Kom</th><th className="num">Inbjudningar</th></tr></thead>
                    <tbody>
                      {data.brands.filter((b, i) => i > 0 || b.events > 0).map((b) => (
                        <tr key={b.id} className="is-click" onClick={() => setCurrentBrandId(b.id)}>
                          <td><b>{b.name}</b></td>
                          <td className="num">{fmt(b.events)}</td>
                          <td className="num">{fmt(b.visits)}</td>
                          <td className="num">{fmt(b.signups)}<span className="st-inline"><i style={{ width: `${(b.signups / maxSign) * 100}%` }} /></span></td>
                          <td className="num">{pct(b.conversion)}</td>
                          <td className="num">{fmt(b.came)}</td>
                          <td className="num">{fmt(b.consents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            <Daily daily={data.daily} title="Senaste 60 dagarna" />
            <div className="st-grid">
              <Breakdown title="Var besöken kommer ifrån" rows={data.sources} empty="Inga besök räknade än. De räknas från och med nu." />
              <section className="st-card">
                <div className="st-card-head"><h3>Bästa eventen</h3><p className="st-read">efter anmälda</p></div>
                {data.events.length ? (
                  <ul className="st-list">
                    {[...data.events].sort((a, b) => b.signups - a.signups).slice(0, 6).map((e) => (
                      <li key={e.id} className="st-ev" onClick={() => navigate(`/admin/events/${e.id}`)}>
                        <span className="st-list-name" title={nameOf(e.brandId) || undefined}>{e.title || "Utan titel"}</span>
                        <span className="st-list-bar"><i style={{ width: `${(e.signups / Math.max(1, data.events.reduce((m, x) => Math.max(m, x.signups), 0))) * 100}%` }} /></span>
                        <b>{fmt(e.signups)}</b>
                        <small>{pct(e.conversion)}</small>
                      </li>
                    ))}
                  </ul>
                ) : <p className="ea-muted st-empty">Inga event än.</p>}
              </section>
            </div>
            {data.events.length > 0 && (
              <section className="st-card">
                <div className="st-card-head"><h3>Alla event</h3></div>
                <div className="ea-wrap">
                  <table className="ea-table st-table">
                    <thead><tr><th>Event</th>{data.brands.length > 0 && <th>Varumärke</th>}<th className="num">Besök</th><th className="num">Anmälda</th><th className="num">Konv.</th><th className="num">Kom</th><th className="num">Inbjudningar</th></tr></thead>
                    <tbody>
                      {data.events.map((e) => (
                        <tr key={e.id} className="is-click" onClick={() => navigate(`/admin/events/${e.id}`)}>
                          <td><b>{e.title || "Utan titel"}</b> <span className="ea-muted">{e.startsAt ? new Date(e.startsAt).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) : ""}</span></td>
                          {data.brands.length > 0 && <td>{nameOf(e.brandId)}</td>}
                          <td className="num">{fmt(e.visits)}</td>
                          <td className="num">{fmt(e.signups)}</td>
                          <td className="num">{pct(e.conversion)}</td>
                          <td className="num">{fmt(e.came)}</td>
                          <td className="num">{fmt(e.consents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
      <style>{`
        .st-ev { cursor: pointer; }
        .st-ev:hover .st-list-name { text-decoration: underline; }
      `}</style>
    </>
  );
}
