import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { formatEventWhen } from "../../lib/zonedTime.js";
import { BrandKicker, TeamOnly } from "../../components/admin/ByBrand.jsx";
import { useCurrentBrand } from "../../lib/brand.js";
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
  return (
    <AdminShell title="Event">
      <EventsList />
    </AdminShell>
  );
}

// Inside AdminShell, so it knows the brand on screen (and the ones under it).
function EventsList() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState("mine");
  // A main brand shows the events of the brands under it too: one row of
  // brands to narrow it down, and every event says whose it is.
  const brand = useCurrentBrand();
  const family = brand?.under?.length ? [brand, ...brand.under] : [];
  const [only, setOnly] = useState("");
  const newEvent = () => navigate(only ? `/admin/events/new?brand=${only}` : "/admin/events/new");

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
  // Delete right from the list: the bin beside a row asks once, in the row.
  const [asking, setAsking] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const canDelete = (e) => e.mine && brand?.role !== "event";
  const remove = async (e) => {
    setDeleting(true);
    try {
      const res = await authenticatedFetch(`/admin/events/${e.id}/delete`, { method: "POST", body: JSON.stringify({ confirmTitle: e.title || "" }) });
      if (!res.ok) throw new Error();
      setData((d) => d.filter((x) => x.id !== e.id));
      setAsking(null);
    } catch {
      window.alert("Kunde inte radera eventet.");
    } finally {
      setDeleting(false);
    }
  };

  const [now] = useState(() => Date.now());
  const isPast = (e) => new Date(e.endsAt || e.startsAt).getTime() < now;
  const all = (data || []).filter((e) => !only || e.brandId === only);
  const lists = {
    mine: all.filter((e) => e.mine),
    upcoming: all.filter((e) => !isPast(e) && new Date(e.startsAt).getFullYear() < 2090).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    all,
  };
  const list = lists[filter];
  const totals = lists.all.reduce((t, e) => ({ guests: t.guests + e.attending, came: t.came + e.pulledUp }), { guests: 0, came: 0 });

  return (
    <>
      <style>{EVENT_ADMIN_CSS + EVENTS_CSS}</style>
      <div className="ea">
        <div className="ea-head">
          <div>
            <BrandKicker />
            <h1>Event</h1>
            {data && <p className="ea-muted">{lists.all.length} event · {totals.guests} anmälda · {totals.came} kom</p>}
          </div>
          <TeamOnly><button type="button" className="ea-btn is-dark" onClick={newEvent}><Plus size={16} /> Nytt event</button></TeamOnly>
        </div>

        {error && <p className="ea-error">Kunde inte hämta eventen.</p>}
        {!data && !error && <p className="ea-muted">Hämtar…</p>}

        {data && (
          <>
            {family.length > 0 && (
              <div className="evl-family" role="group" aria-label="Varumärken">
                <button type="button" className={!only ? "is-on" : ""} onClick={() => setOnly("")}>
                  Alla <small>{data.length}</small>
                </button>
                {family.filter((b, i) => i || data.some((e) => e.brandId === b.id)).map((b) => (
                  <button key={b.id} type="button" className={`${only === b.id ? "is-on" : ""}${b.id === brand.id ? " is-main" : " is-under"}`} onClick={() => setOnly(b.id)}>
                    {b.name} <small>{data.filter((e) => e.brandId === b.id).length}</small>
                  </button>
                ))}
              </div>
            )}
            <div className="ea-tabs">
              {FILTERS.filter(([k]) => k !== "all" || lists.all.length !== lists.mine.length).map(([k, label]) => (
                <button key={k} type="button" className={filter === k ? "is-on" : ""} onClick={() => setFilter(k)}>
                  {label} <small>{lists[k].length}</small>
                </button>
              ))}
            </div>
            <ul className="evl">
              {list.map((e) => (
                <li key={e.id} className={asking === e.id ? "is-asking" : ""}>
                  {asking === e.id ? (
                    <div className="evl-ask">
                      <span>
                        <b>Radera {e.title || "eventet"}?</b>
                        <span className="ea-muted">{e.attending > 0 ? `${e.attending} anmälningar, bilderna och statistiken försvinner. Gästerna finns kvar i CRM:et.` : "Sidan försvinner för gott."}</span>
                      </span>
                      <button type="button" className="ea-btn" onClick={() => setAsking(null)} disabled={deleting}>Avbryt</button>
                      <button type="button" className="ea-btn is-danger" onClick={() => remove(e)} disabled={deleting}>{deleting ? "Raderar…" : "Radera"}</button>
                    </div>
                  ) : (
                  <button type="button" className="evl-row" onClick={() => navigate(`/admin/events/${e.id}`)}>
                    {e.imageUrl ? <img src={e.imageUrl} alt="" loading="lazy" /> : <span className="evl-noimg" />}
                    <span className="evl-main">
                      <b>{e.title || "Utan titel"}</b>
                      <span className="ea-muted">{formatEventWhen(e.startsAt, null, e.timezone, { year: true })}{e.location ? ` · ${e.location}` : ""}</span>
                      {!e.mine && e.host && <span className="evl-host">{e.host}</span>}
                      {e.mine && family.length > 0 && e.host && <span className={`evl-brand${e.brandId === brand.id ? " is-main" : ""}`}>{e.host}</span>}
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
                  )}
                  {canDelete(e) && asking !== e.id && (
                    <button type="button" className="evl-bin" onClick={() => setAsking(e.id)} aria-label={`Radera ${e.title || "eventet"}`} title="Radera"><Trash2 size={16} /></button>
                  )}
                </li>
              ))}
            </ul>
            {!list.length && (lists.all.length ? <p className="ea-muted">Inga event här än.</p> : (
              // A brand with nothing yet: the one thing to do.
              <div className="evl-first">
                <b>{only ? `Inga event för ${family.find((b) => b.id === only)?.name || "varumärket"} än` : "Inga event än"}</b>
                <p className="ea-muted">
                  {family.length && !only
                    ? `${brand.name} är admin för varumärkena under: här samlas allas event. Ett event skapas alltid i ett av varumärkena.`
                    : "Skapa en eventsida, dela länken och se anmälningarna komma in här. Gästerna hamnar i CRM:et."}
                </p>
                <TeamOnly><button type="button" className="ea-btn is-dark" onClick={newEvent}><Plus size={16} /> Skapa ditt första event</button></TeamOnly>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}

const EVENTS_CSS = `
  .evl-family { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 12px; padding: 0 0 14px; border-bottom: 1px solid rgba(0,0,0,0.08); }
  .evl-family button { font: inherit; font-size: 13.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; border-radius: 999px; border: 1px solid rgba(0,0,0,0.12); background: #fff; color: #0a0a0a; cursor: pointer; }
  .evl-family button small { font-size: 11.5px; color: #8a8a8e; font-weight: 600; }
  .evl-family button.is-main { border-color: #0a0a0a; }
  .evl-family button.is-under::before { content: "└"; color: #b0b0b4; font-weight: 400; margin-right: -2px; }
  .evl-family button.is-on { background: #0a0a0a; border-color: #0a0a0a; color: #fff; }
  .evl-family button.is-on small, .evl-family button.is-on::before { color: rgba(255,255,255,0.6); }
  .evl-brand { justify-self: start; margin-top: 3px; font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #efeeea; color: #3a3a3c; }
  .evl-brand.is-main { background: #0a0a0a; color: #fff; }
  .evl-first { display: grid; justify-items: start; gap: 8px; padding: 28px; border: 1px dashed rgba(0,0,0,0.18); border-radius: 16px; }
  .evl-first b { font-size: 17px; }
  .evl-first p { margin: 0 0 6px; max-width: 46ch; line-height: 1.5; }
  .evl { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .evl li { display: grid; grid-template-columns: minmax(0, 1fr) 36px; align-items: center; gap: 6px; }
  .evl-bin { width: 36px; height: 36px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 999px; background: none; color: #8a8a8e; cursor: pointer; opacity: 0; transition: opacity .15s ease, background .15s ease, color .15s ease; }
  .evl li:hover .evl-bin, .evl-bin:focus-visible { opacity: 1; }
  .evl-bin:hover { background: #fdecea; color: #c0392b; }
  @media (hover: none) { .evl-bin { opacity: 1; } }
  .evl-ask { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 14px 16px; border: 1px solid rgba(192,57,43,0.35); border-radius: 16px; background: #fdf3f1; min-height: 64px; }
  .evl-ask > span { display: grid; gap: 2px; min-width: 0; }
  .evl-ask b { font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .evl-ask .ea-muted { margin: 0; font-size: 13px; }
  .evl-ask .ea-btn.is-danger { background: #b3261e; border-color: #8c1d17; color: #fff; }
  .evl li.is-asking { grid-template-columns: minmax(0, 1fr); }
  .evl .evl-row { font: inherit; width: 100%; display: grid; grid-template-columns: 64px minmax(0, 1fr) auto auto; align-items: center; gap: 14px; padding: 10px 14px 10px 10px; border: 1px solid rgba(0,0,0,0.1); border-radius: 16px; background: #fff; text-align: left; cursor: pointer; color: #0a0a0a; }
  .evl .evl-row:hover { border-color: rgba(0,0,0,0.25); }
  .evl img, .evl-noimg { width: 64px; height: 64px; border-radius: 10px; object-fit: cover; background: #f0f0f0; display: block; }
  .evl-main { display: grid; gap: 2px; min-width: 0; }
  .evl-main b { font-size: 15.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .evl-main .ea-muted { margin: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .evl-main .ea-muted::first-letter { text-transform: uppercase; }
  .evl-host { font-size: 12px; color: #8a8a8e; }
  .evl-nums { display: grid; gap: 1px; justify-items: end; font-size: 12.5px; color: #6e6e73; white-space: nowrap; }
  .evl-nums b { color: #0a0a0a; font-size: 14px; }
  @media (max-width: 620px) {
    .evl .evl-row { grid-template-columns: 52px minmax(0, 1fr) auto; }
    .evl-ask { grid-template-columns: 1fr 1fr; }
    .evl-ask > span { grid-column: 1 / -1; }
    .evl img, .evl-noimg { width: 52px; height: 52px; }
    .evl-nums { display: none; }
  }
`;
