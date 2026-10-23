import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "../../lib/api.js";
import { AdminShell } from "./AdminShell.jsx";

/* /admin/sales — where sales stand today and what to do next. Everything is
   read from the Google Sheet (the record; edit it there). The page answers:
   how many did I send today, am I on pace for the plan, who's next, and what
   is waiting on me. */
const STAGE_SV = {
  "Not contacted": "Ej kontaktad",
  Emailed: "Mejlad",
  "Followed up": "Uppföljd",
  Replied: "Svarat",
  "Meeting booked": "Möte bokat",
  "Proposal sent": "Offert skickad",
  Won: "Vunnen",
  Lost: "Förlorad",
  "Not a fit": "Passar inte",
};
const LOG_SV = { "Email out": "Mejl ut", "Follow-up": "Uppföljning", "Email in": "Svar in", Note: "Autosvar / notering", Meeting: "Möte", Call: "Samtal" };
const FUNNEL = ["Emailed", "Followed up", "Replied", "Meeting booked", "Proposal sent", "Won"];

const nf = new Intl.NumberFormat("sv-SE");
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : "–");
const dayLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
const time = (iso) => new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
const daysAgo = (d, today) => Math.round((Date.parse(today) - Date.parse(d)) / 86400000);
// "stänger idag" / "stänger om 3 d" for a job ad's last day.
function closes(deadline, today) {
  const n = -daysAgo(deadline, today);
  if (n <= 0) return "stänger idag";
  if (n === 1) return "stänger imorgon";
  return n <= 14 ? `stänger om ${n} d` : `stänger ${dayLabel(deadline)}`;
}

function pace(delta) {
  if (delta > 0) return `${nf.format(delta)} före`;
  if (delta < 0) return `${nf.format(-delta)} efter`;
  return "i fas";
}

export function SalesPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback((fresh = false) =>
    authenticatedFetch(`/admin/sales${fresh ? "?fresh=1" : ""}`)
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || "failed");
      })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false)), []);

  useEffect(() => { load(); }, [load]);
  const refresh = () => { setLoading(true); load(true); };

  const plan = data?.plan;
  const t = data?.totals;
  // A full bar is the day's goal; anything sent past it shows as a +N bonus
  // above the bar, so one big day doesn't make every other day look short.
  const maxDay = plan?.perDay || 1;
  const maxStage = Math.max(1, ...(data?.stages || []).filter((s) => FUNNEL.includes(s.stage)).map((s) => s.count));
  const stageCount = (s) => data?.stages.find((x) => x.stage === s)?.count || 0;
  const waiting = data ? data.toAnswer.length + data.followUps.length + data.due.length : 0;

  return (
    <AdminShell title="Sälj">
      <style>{SALES_CSS}</style>
      <div className="sl">
        <div className="sl-head">
          <div>
            <h1>Sälj</h1>
            {data && <p className="sl-muted">Läst från arket {time(data.readAt)}</p>}
          </div>
          <div className="sl-actions">
            <button type="button" onClick={refresh} disabled={loading}>{loading ? "Läser…" : "Uppdatera"}</button>
            {data && <a href={data.sheetUrl} target="_blank" rel="noreferrer">Öppna arket ↗</a>}
          </div>
        </div>

        {error === "not_configured" && <p className="sl-muted">Arket är inte kopplat på servern (GOOGLE_SERVICE_ACCOUNT_JSON / SALES_SHEET_ID saknas).</p>}
        {error && error !== "not_configured" && <p className="sl-muted">Kunde inte läsa arket.</p>}
        {!data && !error && <p className="sl-muted">Hämtar…</p>}

        {data && (
          <>
            <section className={`sl-today${data.leftToday === 0 ? " is-done" : ""}`}>
              <div className="sl-today-head">
                <div>
                  <span>Idag · {dayLabel(data.today)}</span>
                  <b>
                    {data.leftToday === 0
                      ? `Dagens ${data.perDay} är skickade.`
                      : data.sentToday === 0
                        ? `Skicka dagens ${data.perDay}.`
                        : `Kvar idag: ${data.leftToday} av ${data.perDay}.`}
                  </b>
                </div>
                <strong>{data.sentToday}<small> / {data.perDay}</small></strong>
              </div>
              <i className="sl-meter"><i style={{ width: `${Math.min(100, (data.sentToday / data.perDay) * 100)}%` }} /></i>
              {data.sentTodayList.length > 0 && (
                <ul className="sl-sent">
                  {data.sentTodayList.map((p) => (
                    <li key={p.id} title={p.email}>{p.company}{p.stage !== "Emailed" ? <em> · {STAGE_SV[p.stage]}</em> : null}</li>
                  ))}
                </ul>
              )}
            </section>

            <div className="sl-kpis">
              <div>
                <span>Planen</span>
                {plan && !plan.started
                  ? <><b className="sl-small">Startar {dayLabel(plan.start)}</b><em className="sl-grey">{nf.format(plan.target)} mejl på {plan.days} dagar</em></>
                  : <><b>{plan ? nf.format(plan.sent) : "–"}<small> / {plan ? nf.format(plan.target) : "–"}</small></b>
                    {plan && <em className={plan.delta < 0 ? "is-behind" : ""}>{pace(plan.delta)}</em>}</>}
              </div>
              <div>
                <span>Dagar kvar</span>
                <b>{plan ? plan.daysLeft : "–"}</b>
                {plan && plan.daysLeft > 0 && <em className="sl-grey">till {dayLabel(plan.end)}</em>}
              </div>
              <div>
                <span>Svar</span>
                <b>{pct(t.answered, t.contacted)}</b>
                <em className="sl-grey">{nf.format(t.answered)} av {nf.format(t.contacted)} mejlade har svarat · {nf.format(t.met)} {t.met === 1 ? "möte" : "möten"}</em>
              </div>
              <div>
                <span>Väntar på dig</span>
                <b>{waiting}</b>
                <em className="sl-grey">{waiting ? "svar, uppföljningar, nästa steg" : "inget just nu"}</em>
              </div>
            </div>

            {plan?.started && (
              <>
                <div className="sl-chart" aria-label="Skickade per dag mot målet">
                  <div className="sl-target" style={{ bottom: `${(plan.perDay / maxDay) * 100}%` }} />
                  {plan.series.map((d) => (
                    <div
                      key={d.date}
                      className={`sl-col${d.future ? " is-future" : ""}${d.date === data.today ? " is-today" : ""}`}
                      title={`${dayLabel(d.date)}: ${d.sent} skickade${d.sent > plan.perDay ? ` (+${d.sent - plan.perDay} bonus)` : ""}`}
                    >
                      <div className={`sl-bar${d.sent >= plan.perDay ? " is-hit" : ""}`} style={{ height: d.future ? "100%" : `${(Math.min(d.sent, maxDay) / maxDay) * 100}%` }}>
                        {!d.future && d.sent > plan.perDay && <span className="sl-bonus">+{d.sent - plan.perDay}</span>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="sl-axis"><span>{dayLabel(plan.start)}</span><span>Mål {plan.perDay} / dag</span><span>{dayLabel(plan.end)}</span></div>
              </>
            )}

            <div className="sl-grid">
              <section>
                <h2>{data.queueFor === "today" ? `Att skicka idag (${data.queue.length})` : `Imorgon: nästa ${data.queue.length}`}</h2>
                <p className="sl-muted">
                  {data.queueFor === "today" ? "Inte mejlade än. " : "Du är klar för idag. Det här är tur imorgon. "}
                  Prioritet först, sedan närmast deadline. {nf.format(t.notContactedReachable)} kvar med mejladress
                  {t.hiringOpen > 0 && <> · {nf.format(t.hiringOpen)} rekryterar just nu</>}
                  {t.expired > 0 && <> · {nf.format(t.expired)} {t.expired === 1 ? "annons stängd" : "annonser stängda"} innan vi hann skriva</>}.
                </p>
                <ol className="sl-queue">
                  {data.queue.map((p) => (
                    <li key={p.id}>
                      <div className="sl-row-top">
                        <b>{p.company}</b>
                        <span className="sl-tag">
                          {p.deadline && <em className={-daysAgo(p.deadline, data.today) <= 7 ? "is-soon" : ""}>{closes(p.deadline, data.today)}</em>}
                          P{p.priority} · {p.emailType || "–"}
                        </span>
                      </div>
                      {p.person && <div className="sl-sub">{p.person}</div>}
                      <a href={`mailto:${p.email}`}>{p.email}</a>
                      {p.why && <p>{p.why}</p>}
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                {data.meetings.length > 0 && (
                  <>
                    <h2>Bokade möten</h2>
                    <ul className="sl-list sl-meetings">
                      {data.meetings.map((p) => (
                        <li key={p.id}>
                          <b>{p.company}</b>
                          <span>{p.nextStepDate ? dayLabel(p.nextStepDate) : "datum saknas i arket"}{p.person ? ` · ${p.person}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <h2>Väntar på dig{waiting ? ` (${waiting})` : ""}</h2>
                {!waiting && <p className="sl-muted">Inget som väntar just nu. Svar, uppföljningar och nästa steg hamnar här.</p>}
                {data.toAnswer.length > 0 && <h3>Svara</h3>}
                <ul className="sl-list">
                  {data.toAnswer.map((p) => (
                    <li key={p.id}><b>{p.company}</b><span>{p.person || p.email}{p.source === "Website" ? " · via hemsidan" : ""}</span></li>
                  ))}
                </ul>
                {data.due.length > 0 && <h3>Nästa steg</h3>}
                <ul className="sl-list">
                  {data.due.map((p) => (
                    <li key={p.id} className={p.overdue ? "is-late" : undefined}>
                      <b>{p.company}</b>
                      <span>{p.nextStep || STAGE_SV[p.stage]} · {p.overdue ? `sen sedan ${dayLabel(p.nextStepDate)}` : "idag"}</span>
                    </li>
                  ))}
                </ul>
                {data.followUps.length > 0 && <h3>Följ upp</h3>}
                <ul className="sl-list">
                  {data.followUps.map((p) => (
                    <li key={p.id}>
                      <b>{p.company}</b>
                      <span>mejlad {dayLabel(p.lastContact || p.dateSent)}, {daysAgo(p.lastContact || p.dateSent, data.today)} dagar sedan</span>
                    </li>
                  ))}
                </ul>
                {data.needsEmail.length > 0 && (
                  <>
                    <h2>Rekryterar, saknar mejl</h2>
                    <p className="sl-muted">Hitta grundaren eller vd:n innan annonsen stänger.</p>
                    <ul className="sl-list">
                      {data.needsEmail.map((p) => (
                        <li key={p.id}>
                          <b>{p.company}</b>
                          <span>{closes(p.deadline, data.today)} · {p.id}{p.location ? ` · ${p.location}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            </div>

            <h2>Tratten</h2>
            <div className="sl-funnel">
              {FUNNEL.map((s) => (
                <div key={s} className="sl-step">
                  <span>{STAGE_SV[s]}</span>
                  <i><i style={{ width: `${(stageCount(s) / maxStage) * 100}%` }} /></i>
                  <b>{nf.format(stageCount(s))}</b>
                </div>
              ))}
            </div>
            <p className="sl-muted">
              {nf.format(stageCount("Not contacted"))} ej kontaktade · {nf.format(stageCount("Lost"))} förlorade · {nf.format(stageCount("Not a fit"))} passar inte
              {(t.proposalValue > 0 || t.wonValue > 0) && <> · offerter {nf.format(t.proposalValue)} kr/mån · vunnet {nf.format(t.wonValue)} kr/mån</>}
            </p>

            <h2>Senaste i loggen</h2>
            {data.log.length === 0 && <p className="sl-muted">Loggen är tom än.</p>}
            <ul className="sl-list">
              {data.log.map((e, i) => (
                <li key={`${e.date}-${e.id}-${i}`}>
                  <b>{e.company || e.id}</b>
                  <span>{dayLabel(e.date)} · {LOG_SV[e.type] || e.type}{e.summary ? ` · ${e.summary.replace(/^Auto-reply: /, "")}` : ""}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </AdminShell>
  );
}

const SALES_CSS = `
  .sl { max-width: 1040px; margin: 0 auto; padding: clamp(24px, 5vw, 48px) 16px 64px; }
  .sl-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
  .sl h1 { margin: 0; font-size: clamp(28px, 5vw, 40px); font-weight: 700; letter-spacing: -0.035em; }
  .sl h2 { margin: 44px 0 6px; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
  .sl h3 { margin: 18px 0 6px; font-size: 13px; font-weight: 700; color: #6e6e73; text-transform: uppercase; letter-spacing: 0.04em; }
  .sl-muted { margin: 4px 0 0; color: #6e6e73; font-size: 14px; }
  .sl-actions { display: flex; gap: 8px; align-items: center; }
  .sl-actions button, .sl-actions a { font: inherit; font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 999px; border: 1px solid rgba(0,0,0,0.12); background: #fff; color: #0a0a0a; cursor: pointer; text-decoration: none; }
  .sl-actions a { background: #0a0a0a; color: #fff; border-color: #0a0a0a; }
  .sl-actions button:disabled { color: #6e6e73; cursor: default; }
  .sl-today { border: 1px solid rgba(0,0,0,0.1); border-radius: 18px; padding: 18px 20px; margin-bottom: 12px; }
  .sl-today.is-done { background: #f3faf5; border-color: rgba(31,122,58,0.25); }
  .sl-today-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
  .sl-today-head span { display: block; font-size: 13px; color: #6e6e73; margin-bottom: 4px; }
  .sl-today-head b { font-size: clamp(22px, 3.4vw, 30px); font-weight: 700; letter-spacing: -0.03em; }
  .sl-today.is-done .sl-today-head b { color: #1f7a3a; }
  .sl-today-head strong { font-size: clamp(28px, 4vw, 38px); font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sl-today-head strong small { font-size: 0.5em; color: #6e6e73; font-weight: 600; }
  .sl-today .sl-meter { margin-top: 12px; }
  .sl-today.is-done .sl-meter i { background: #1f7a3a; }
  .sl-sent { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .sl-sent li { font-size: 13px; padding: 5px 10px; border-radius: 999px; background: #fff; border: 1px solid rgba(0,0,0,0.1); }
  .sl-sent em { font-style: normal; color: #1f7a3a; font-weight: 600; }
  .sl-kpis em.sl-grey { color: #6e6e73; font-weight: 500; }
  .sl-kpis b.sl-small { font-size: clamp(20px, 2.6vw, 24px); }
  .sl-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .sl-kpis > div { border: 1px solid rgba(0,0,0,0.1); border-radius: 16px; padding: 16px; display: grid; gap: 4px; align-content: start; }
  .sl-kpis span { font-size: 13px; color: #6e6e73; }
  .sl-kpis b { font-size: clamp(26px, 4vw, 34px); font-weight: 700; letter-spacing: -0.03em; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .sl-kpis b small { font-size: 0.5em; font-weight: 600; color: #6e6e73; letter-spacing: 0; }
  .sl-kpis em { font-style: normal; font-size: 12.5px; color: #1f7a3a; font-weight: 600; }
  .sl-kpis em.is-behind { color: #D9480F; }
  .sl-meter { display: block; height: 6px; border-radius: 999px; background: #f0f0f0; overflow: hidden; margin-top: 6px; }
  .sl-meter i { display: block; height: 100%; background: #D9480F; border-radius: 999px; }
  @media (max-width: 760px) { .sl-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .sl-chart { position: relative; margin-top: 24px; height: 140px; display: flex; align-items: flex-end; gap: 2px; border-bottom: 1px solid rgba(0,0,0,0.12); }
  .sl-target { position: absolute; left: 0; right: 0; border-top: 1px dashed rgba(0,0,0,0.35); pointer-events: none; }
  .sl-col { flex: 1; height: 100%; display: flex; align-items: flex-end; }
  .sl-bar { position: relative; width: 100%; min-height: 1px; border-radius: 3px 3px 0 0; background: #f1a37e; }
  .sl-bonus { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 3px; font-size: 11px; font-weight: 700; color: #1f7a3a; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .sl-bar.is-hit { background: #D9480F; }
  .sl-col.is-future .sl-bar { background: none; }
  .sl-col.is-today { outline: 1px solid rgba(0,0,0,0.25); outline-offset: 1px; border-radius: 3px; }
  .sl-axis { display: flex; justify-content: space-between; margin-top: 8px; font-size: 12px; color: #6e6e73; }
  .sl-grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 32px; }
  @media (max-width: 760px) { .sl-grid { grid-template-columns: 1fr; gap: 0; } }
  .sl-queue { margin: 14px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; counter-reset: q; }
  .sl-queue li { counter-increment: q; position: relative; border: 1px solid rgba(0,0,0,0.1); border-radius: 14px; padding: 12px 14px 12px 44px; display: grid; gap: 2px; }
  .sl-queue li::before { content: counter(q); position: absolute; left: 14px; top: 12px; width: 20px; height: 20px; border-radius: 999px; background: #0a0a0a; color: #fff; font-size: 11px; font-weight: 700; display: grid; place-items: center; }
  .sl-row-top { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
  .sl-tag { font-size: 11.5px; font-weight: 600; color: #6e6e73; white-space: nowrap; display: flex; gap: 8px; align-items: baseline; }
  .sl-tag em { font-style: normal; color: #3a3a3e; }
  .sl-tag em.is-soon { color: #D9480F; }
  .sl-sub { font-size: 13.5px; color: #3a3a3e; }
  .sl-queue a { font-size: 13.5px; color: #0a0a0a; text-decoration-color: #D9480F; text-underline-offset: 3px; justify-self: start; overflow-wrap: anywhere; }
  .sl-queue p { margin: 2px 0 0; font-size: 13px; line-height: 1.45; color: #6e6e73; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sl-list { list-style: none; margin: 0; padding: 0; }
  .sl-list li { display: grid; gap: 2px; padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.07); font-size: 14px; }
  .sl-list li span { color: #6e6e73; font-size: 13px; }
  .sl-list li.is-late span { color: #D9480F; font-weight: 600; }
  .sl-meetings { margin-bottom: 28px; }
  .sl-funnel { display: grid; gap: 8px; margin-top: 12px; }
  .sl-step { display: grid; grid-template-columns: 120px minmax(0, 1fr) 48px; gap: 12px; align-items: center; font-size: 14px; }
  .sl-step > i { display: block; height: 14px; border-radius: 4px; background: #f2f2f2; overflow: hidden; }
  .sl-step > i > i { display: block; height: 100%; min-width: 2px; background: #0a0a0a; border-radius: 4px; }
  .sl-step b { text-align: right; font-variant-numeric: tabular-nums; }
`;
