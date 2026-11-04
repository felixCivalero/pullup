import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "../../lib/api.js";
import { AdminShell } from "./AdminShell.jsx";
import { EVENT_ADMIN_CSS } from "./eventAdminCss.js";
import { STATS_CSS, fmt } from "../../components/admin/statsFormat.js";

/* /admin/platform — the owner's view of the event tool (backend
   routes/adminPlatform.js): how many organisers have signed up, how many
   events are out, and every account with its brands, events, sign-ups and
   mail credits; credits can be given to a customer set up by hand. */
export function PlatformPage() {
  return (
    <AdminShell title="Statistik · Eventverktyget">
      <Platform />
    </AdminShell>
  );
}

const day = (iso) => (iso ? new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) : "–");

function Platform() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [onlyNew, setOnlyNew] = useState(true);
  const load = useCallback(() => {
    authenticatedFetch("/admin/platform").then((r) => (r.ok ? r.json() : Promise.reject())).then(setData).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const give = async (a) => {
    const n = window.prompt(`Hur många utskick ska ${a.email} få?`, "5000");
    if (!n) return;
    const note = window.prompt("Anteckning (t.ex. Nigab, uppstart)", "") || "";
    const res = await authenticatedFetch("/admin/platform/credits", { method: "POST", body: JSON.stringify({ hostId: a.id, count: Number(n), note }) });
    if (!res.ok) { window.alert("Det gick inte."); return; }
    load();
  };

  const t = data?.totals;
  const rows = (data?.accounts || []).filter((a) => !onlyNew || !a.fromOldApp);
  return (
    <>
      <style>{EVENT_ADMIN_CSS + STATS_CSS + PF_CSS}</style>
      <div className="ea">
        <div className="ea-head"><div><h1>Eventverktyget</h1><p className="ea-muted">Hur det går för gratisverktyget: sidan, konton, event och utskick.</p></div></div>
        {error && <p className="ea-error">Kunde inte hämta plattformen.</p>}
        {!data && !error && <p className="ea-muted">Hämtar…</p>}
        {t && (
          <>
            {data.page && (
              <div className="st-tiles">
                <div><span>Besök på /eventverktyg</span><b>{fmt(data.page.visits7)}</b><small>senaste veckan · {fmt(data.page.visits30)} på 30 dagar</small></div>
                <div><span>Klick på Skapa konto</span><b>{fmt(data.page.signupClicks)}</b><small>besök som klickade, 30 dagar</small></div>
                <div><span>Kopierade MCP-adressen</span><b>{fmt(data.page.mcpCopies)}</b><small>besök, 30 dagar</small></div>
              </div>
            )}
            <div className="st-tiles">
              <div><span>Nya konton</span><b>{fmt(t.sinceRelaunch)}</b><small>sedan 19 okt · {fmt(t.new7)} senaste veckan</small></div>
              <div><span>Konton totalt</span><b>{fmt(t.accounts)}</b><small>med den gamla appens</small></div>
              <div><span>Event</span><b>{fmt(t.events)}</b><small>{fmt(t.published)} publicerade</small></div>
              <div><span>Kommande</span><b>{fmt(t.upcoming)}</b><small>publicerade, inte passerade</small></div>
              <div><span>Anmälningar</span><b>{fmt(t.signups)}</b><small>på arrangörernas event</small></div>
            </div>
            <section className="st-card">
              <div className="st-card-head">
                <h3>Konton</h3>
                <label className="pf-toggle"><input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> Bara nya sedan 19 okt</label>
              </div>
              <div className="ea-wrap"><table className="ea-table st-table">
                <thead><tr><th>Konto</th><th>Varumärken</th><th className="num">Event</th><th className="num">Publ.</th><th className="num">Anmälda</th><th className="num">Utskick</th><th>Skapat</th><th>Senast inne</th><th /></tr></thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td><b>{a.email}</b></td>
                      <td>{a.brands.map((b) => (b.under ? `└ ${b.name}` : b.name)).join(", ")}</td>
                      <td className="num">{fmt(a.events)}</td>
                      <td className="num">{fmt(a.published)}</td>
                      <td className="num">{fmt(a.signups)}</td>
                      <td className="num">{a.credits == null ? "–" : fmt(a.credits)}</td>
                      <td>{day(a.createdAt)}</td>
                      <td>{day(a.lastSignIn)}</td>
                      <td><button type="button" className="ea-btn" onClick={() => give(a)}>Ge utskick</button></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              {!rows.length && <p className="ea-muted st-empty">Inga konton här än.</p>}
            </section>
          </>
        )}
      </div>
    </>
  );
}

const PF_CSS = `
  .pf-toggle { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: #3a3935; cursor: pointer; }
  .pf-toggle input { accent-color: #ec178f; }
`;
