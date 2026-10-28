import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { formatEventWhen } from "../../lib/zonedTime.js";
import { AdminShell } from "./AdminShell.jsx";
import { useAgentChanges, usePageContext } from "../../lib/pageContext.js";
import { EVENT_ADMIN_CSS } from "./eventAdminCss.js";

/* /admin/events — your events (the owner sees every event on PullUp),
   newest first, with sign-ups. "Nytt event" starts the basics wizard
   (/admin/events/new), which opens the page editor. */

const FILTERS = [
  ["mine", "Mina"],
  ["upcoming", "Kommande"],
  ["all", "Alla"],
];

export function EventsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState("mine");

  const load = useCallback(() => {
    authenticatedFetch("/admin/events")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d.events))
      .catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  // An assistant in this browser created or changed an event: show it.
  useAgentChanges(load);
  usePageContext({ page: "admin-events" });

  const [now] = useState(() => Date.now());
  const isPast = (e) => new Date(e.endsAt || e.startsAt).getTime() < now;
  const lists = useMemo(() => {
    const all = data || [];
    return {
      mine: all.filter((e) => e.mine),
      upcoming: all.filter((e) => !isPast(e) && new Date(e.startsAt).getFullYear() < 2090).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      all,
    };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = lists[filter];
  const totals = (data || []).reduce((t, e) => ({ guests: t.guests + e.attending, came: t.came + e.pulledUp }), { guests: 0, came: 0 });

  return (
    <AdminShell title="Event">
      <style>{EVENT_ADMIN_CSS + EVENTS_CSS}</style>
      <div className="ea">
        <div className="ea-head">
          <div>
            <h1>Event</h1>
            {data && <p className="ea-muted">{data.length} event · {totals.guests} anmälda · {totals.came} kom</p>}
          </div>
          <button type="button" className="ea-btn is-dark" onClick={() => navigate("/admin/events/new")}><Plus size={16} /> Nytt event</button>
        </div>

        {error && <p className="ea-error">Kunde inte hämta eventen.</p>}
        {!data && !error && <p className="ea-muted">Hämtar…</p>}

        {data && (
          <>
            <div className="ea-tabs">
              {FILTERS.filter(([k]) => k !== "all" || lists.all.length !== lists.mine.length).map(([k, label]) => (
                <button key={k} type="button" className={filter === k ? "is-on" : ""} onClick={() => setFilter(k)}>
                  {label} <small>{lists[k].length}</small>
                </button>
              ))}
            </div>
            <ul className="evl">
              {list.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => navigate(`/admin/events/${e.id}`)}>
                    {e.imageUrl ? <img src={e.imageUrl} alt="" loading="lazy" /> : <span className="evl-noimg" />}
                    <span className="evl-main">
                      <b>{e.title || "Utan titel"}</b>
                      <span className="ea-muted">{formatEventWhen(e.startsAt, null, e.timezone, { year: true })}{e.location ? ` · ${e.location}` : ""}</span>
                      {!e.mine && e.host && <span className="evl-host">{e.host}</span>}
                    </span>
                    <span className="evl-nums">
                      <span><b>{e.attending}</b> anmälda</span>
                      {e.waitlist > 0 && <span>{e.waitlist} i kö</span>}
                      {e.pulledUp > 0 && <span>{e.pulledUp} kom</span>}
                    </span>
                    <span className={`ea-chip ${e.status === "DRAFT" ? "is-draft" : isPast(e) ? "is-past" : "is-live"}`}>
                      {e.status === "DRAFT" ? "Utkast" : isPast(e) ? "Har varit" : "Publicerad"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {!list.length && (data.length ? <p className="ea-muted">Inga event här än.</p> : (
              // A brand with nothing yet: the one thing to do.
              <div className="evl-first">
                <b>Inga event än</b>
                <p className="ea-muted">Skapa en eventsida, dela länken och se anmälningarna komma in här. Gästerna hamnar i CRM:et.</p>
                <button type="button" className="ea-btn is-dark" onClick={() => navigate("/admin/events/new")}><Plus size={16} /> Skapa ditt första event</button>
              </div>
            ))}
          </>
        )}
      </div>
    </AdminShell>
  );
}

const EVENTS_CSS = `
  .evl-first { display: grid; justify-items: start; gap: 8px; padding: 28px; border: 1px dashed rgba(0,0,0,0.18); border-radius: 16px; }
  .evl-first b { font-size: 17px; }
  .evl-first p { margin: 0 0 6px; max-width: 46ch; line-height: 1.5; }
  .evl { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .evl button { font: inherit; width: 100%; display: grid; grid-template-columns: 64px minmax(0, 1fr) auto auto; align-items: center; gap: 14px; padding: 10px 14px 10px 10px; border: 1px solid rgba(0,0,0,0.1); border-radius: 16px; background: #fff; text-align: left; cursor: pointer; color: #0a0a0a; }
  .evl button:hover { border-color: rgba(0,0,0,0.25); }
  .evl img, .evl-noimg { width: 64px; height: 64px; border-radius: 10px; object-fit: cover; background: #f0f0f0; display: block; }
  .evl-main { display: grid; gap: 2px; min-width: 0; }
  .evl-main b { font-size: 15.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .evl-main .ea-muted { margin: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .evl-main .ea-muted::first-letter { text-transform: uppercase; }
  .evl-host { font-size: 12px; color: #8a8a8e; }
  .evl-nums { display: grid; gap: 1px; justify-items: end; font-size: 12.5px; color: #6e6e73; white-space: nowrap; }
  .evl-nums b { color: #0a0a0a; font-size: 14px; }
  @media (max-width: 620px) {
    .evl button { grid-template-columns: 52px minmax(0, 1fr) auto; }
    .evl img, .evl-noimg { width: 52px; height: 52px; }
    .evl-nums { display: none; }
  }
`;
