import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "../../lib/api.js";
import { AdminShell } from "./AdminShell.jsx";
import { EVENT_ADMIN_CSS } from "./eventAdminCss.js";
import { STATS_CSS, fmt, pct } from "../../components/admin/statsFormat.js";

/* /admin/free-tool — Gratisverktyget (owner only): the outreach for the free
   event tool (backend routes/adminFreeTool.js). The event organisers on the
   sales sheet (Track = Event): who's been mailed, who opened their link to
   /eventverktyg, who made an account and whether they've made events since.
   Uppdatera first records sent mail and replies in the sheet (the same mail
   sync as Sälj), then reads everything again. */
export function FreeToolPage() {
  return (
    <AdminShell title="Sälj · Eventverktyget">
      <FreeTool />
    </AdminShell>
  );
}

const day = (iso) => (iso ? new Date(String(iso).length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" }) : "–");
const STAGE_SV = { "Not contacted": "Ej kontaktad", Emailed: "Mejlad", "Followed up": "Påmind", Replied: "Svarat", "Meeting booked": "Möte", "Proposal sent": "Offert", Won: "Vunnen", Lost: "Nej tack", "Not a fit": "Nej tack" };

function FreeTool() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [hover, setHover] = useState(null);
  const load = useCallback((fresh = false) => (
    authenticatedFetch(`/admin/free-tool${fresh ? "?fresh=1" : ""}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { setData(d); setError(false); }).catch(() => setError(true))
  ), []);
  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setBusy(true);
    setNote("");
    try {
      const res = await authenticatedFetch("/admin/sales/sync-mail", { method: "POST" });
      const out = res.ok ? await res.json() : null;
      if (out) setNote(`${fmt(out.log_rows_added ?? out.logRowsAdded ?? 0)} nya mejl loggade`);
      await load(true);
    } finally {
      setBusy(false);
    }
  };

  const t = data?.totals;
  const max = Math.max(1, ...(data?.series || []).map((s) => s.sent));
  const shown = hover != null ? data.series[hover] : null;
  return (
    <>
      <style>{EVENT_ADMIN_CSS + STATS_CSS + FT_CSS}</style>
      <div className="ea">
        <div className="ea-head">
          <div>
            <h1>Eventverktyget</h1>
            <p className="ea-muted">Mejlen till eventarrangörer om gratisverktyget: vem som fått, klickat, skapat konto och gjort event sedan mejlet.</p>
          </div>
          <div className="ft-actions">
            {note && <span className="ea-muted">{note}</span>}
            <button type="button" className="ea-btn is-dark" disabled={busy} onClick={refresh}>{busy ? "Uppdaterar…" : "Uppdatera"}</button>
          </div>
        </div>
        {error && <p className="ea-error">Kunde inte hämta siffrorna.</p>}
        {!data && !error && <p className="ea-muted">Hämtar…</p>}
        {t && (
          <>
            <div className="st-tiles">
              <div><span>Mejlade</span><b>{fmt(t.contacted)}</b><small>av {fmt(t.withEmail)} med mejl · {fmt(t.today)} i dag</small></div>
              <div><span>Klickade</span><b>{fmt(t.clicked)}</b><small>{t.contacted ? pct(t.clicked / t.contacted) : "–"} av de mejlade</small></div>
              <div><span>Nya konton</span><b>{fmt(t.accounts)}</b><small>{t.contacted ? pct(t.accounts / t.contacted) : "–"} av de mejlade{t.hadAccount ? ` · ${fmt(t.hadAccount)} hade redan` : ""}</small></div>
              <div><span>Gjort event sedan</span><b>{fmt(t.withEvent)}</b><small>{fmt(t.published)} har publicerat · {fmt(t.signups)} anmälda</small></div>
              <div><span>Svar</span><b>{fmt(t.answered)}</b><small>{fmt(t.no)} nej tack</small></div>
            </div>

            {data.series.length > 0 && t.contacted > 0 && (
              <section className="st-card">
                <div className="st-card-head">
                  <h3>Mejlade per dag</h3>
                  <span className="ea-muted ft-read">{shown ? `${day(shown.date)}: ${fmt(shown.sent)} mejlade · ${fmt(shown.clicked)} klickade · ${fmt(shown.accounts)} konton` : `sedan ${day(data.since)}`}</span>
                </div>
                <div className="st-bars ft-bars" style={{ height: 120 }} onMouseLeave={() => setHover(null)}>
                  {data.series.map((s, i) => (
                    <button key={s.date} type="button" style={{ width: `${100 / data.series.length}%` }} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} aria-label={`${s.date}: ${s.sent} mejlade, ${s.clicked} klickade, ${s.accounts} konton`}>
                      <i style={{ height: `${(s.sent / max) * 100}%`, opacity: hover == null || hover === i ? 1 : 0.45 }} />
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="st-card">
              <div className="st-card-head"><h3>Mottagarna</h3><span className="ea-muted">{fmt(data.rows.length)} st</span></div>
              <div className="ea-wrap"><table className="ea-table st-table">
                <thead><tr><th>Arrangör</th><th>Lista</th><th>Mejlad</th><th>Steg</th><th>Klick</th><th>Konto</th><th className="num">Event sedan</th><th className="num">Anmälda</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td><b>{r.company}</b><small className="ft-sub">{r.id} · {r.email}</small></td>
                      <td>{r.list}</td>
                      <td>{day(r.dateSent)}</td>
                      <td><span className={`ft-stage${r.answered ? " is-yes" : r.no ? " is-no" : ""}`}>{STAGE_SV[r.stage] || r.stage}</span></td>
                      <td>{r.clicked ? (r.clicked.glanceOnly ? <span className="ea-muted" title="Bara mejlfiltret som öppnade länken">filter</span> : `${day(r.clicked.last)} · ${Math.round(r.clicked.active)} s`) : "–"}</td>
                      <td>{r.account ? (r.account.before ? <span className="ea-muted" title={`Skapat ${day(r.account.createdAt)}`}>hade redan</span> : <b className="ft-yes">{day(r.account.createdAt)}</b>) : "–"}</td>
                      <td className="num">{r.account ? `${fmt(r.account.events)}${r.account.published ? ` (${fmt(r.account.published)} publ.)` : ""}` : "–"}</td>
                      <td className="num">{r.account ? fmt(r.account.signups) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              {!data.rows.length && <p className="ea-muted st-empty">Inga mejl skickade än. De 45 utkasten ligger i Utkast; när du skickat dem och tryckt Uppdatera syns de här.</p>}
            </section>

            <div className="ft-two">
              <section className="st-card">
                <div className="st-card-head"><h3>Per lista</h3></div>
                <div className="ea-wrap"><table className="ea-table st-table">
                  <thead><tr><th>Lista</th><th className="num">På listan</th><th className="num">Mejlade</th><th className="num">Klickade</th><th className="num">Konton</th></tr></thead>
                  <tbody>
                    {data.lists.map((l) => (
                      <tr key={l.list}><td>{l.list}</td><td className="num">{fmt(l.listed)}</td><td className="num">{fmt(l.contacted)}</td><td className="num">{fmt(l.clicked)}</td><td className="num">{fmt(l.accounts)}</td></tr>
                    ))}
                  </tbody>
                </table></div>
              </section>
              <section className="st-card">
                <div className="st-card-head"><h3>Nya konton utanför listan</h3><span className="ea-muted">{data.since ? `sedan ${day(data.since)}` : "efter första mejlet"}</span></div>
                {data.elsewhere.length ? (
                  <div className="ea-wrap"><table className="ea-table st-table">
                    <thead><tr><th>Konto</th><th>Skapat</th><th className="num">Event</th></tr></thead>
                    <tbody>{data.elsewhere.map((a) => <tr key={a.email}><td>{a.email}</td><td>{day(a.createdAt)}</td><td className="num">{fmt(a.events)}</td></tr>)}</tbody>
                  </table></div>
                ) : <p className="ea-muted st-empty">Inga än. Här syns de som hittat verktyget på annat sätt, så du ser om det är mejlen som funkar.</p>}
              </section>
            </div>
            <p className="ea-muted ft-foot">Hela plattformen: {fmt(data.platform?.accounts)} konton, {fmt(data.platform?.events)} event, {fmt(data.platform?.signups)} anmälningar. Listan ligger i <a href={data.sheetUrl} target="_blank" rel="noreferrer">säljarket</a> (Track = Event).</p>
          </>
        )}
      </div>
    </>
  );
}

const FT_CSS = `
  .ft-actions { display: flex; align-items: center; gap: 12px; }
  .ft-read { font-variant-numeric: tabular-nums; }
  .ft-sub { display: block; margin-top: 2px; font-size: 11.5px; color: #8a8a8e; font-weight: 400; }
  .ft-stage { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #f2f2f3; color: #3a3a3c; }
  .ft-stage.is-yes { background: rgba(236,23,143,.12); color: #a50f63; }
  .ft-stage.is-no { background: #f2f2f3; color: #8a8a8e; }
  .ft-yes { color: #a50f63; }
  .ft-two { display: grid; gap: 16px; }
  @media (min-width: 1000px) { .ft-two { grid-template-columns: 1fr 1fr; } }
  .ft-foot { margin-top: 18px; font-size: 13px; }
  .ft-foot a { color: inherit; }
`;
