// CrmSegment — the mail module's Segment tab: the CRM loaded in place.
// Pick events (people signed up to any of them), narrow to who came, to who
// wants invitations, or by search; the list shows exactly who that is. With
// no event picked it's always "wants invitations" — mailing the whole CRM
// needs people's yes. The server (pickAudience type "crm") applies the same
// rules and gives the authoritative count.
import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { colors } from "./mailColors.js";

const SHOW = 80;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function CrmSegment({ segment, setSegment, total }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [shown, setShown] = useState(SHOW);

  useEffect(() => {
    let alive = true;
    authenticatedFetch("/admin/people")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, []);

  const events = useMemo(
    () => [...(data?.events || [])].sort((a, b) => (b.startsAt || "").localeCompare(a.startsAt || "")),
    [data],
  );
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const chosen = new Set(segment.eventIds);
  const consentForced = segment.eventIds.length === 0;
  const consentOnly = consentForced || segment.consentOnly;

  // Same rules as the server, for the list.
  const people = useMemo(() => {
    if (!data) return [];
    const needle = segment.search.trim().toLowerCase();
    return data.people.filter((p) => {
      if (!p.contactable) return false;
      if (consentOnly && !p.consent) return false;
      const ids = chosen.size ? p.eventIds.filter((id) => chosen.has(id)) : p.eventIds;
      if (chosen.size && !ids.length) return false;
      if (segment.came && !(chosen.size ? p.cameIds.some((id) => chosen.has(id)) : p.cameIds.length)) return false;
      if (needle && !`${p.name} ${p.email}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [data, segment, consentOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => { setSegment({ ...segment, ...patch }); setShown(SHOW); };
  const addEvent = (id) => id && !chosen.has(id) && set({ eventIds: [...segment.eventIds, id] });
  const removeEvent = (id) => set({ eventIds: segment.eventIds.filter((x) => x !== id) });

  if (error) return <p style={{ color: colors.danger, fontSize: 13 }}>Kunde inte hämta CRM:et.</p>;
  if (!data) return <p style={{ color: colors.textSubtle, fontSize: 13 }}>Hämtar CRM:et…</p>;

  return (
    <div className="cs">
      <style>{CSS}</style>
      <label className="cs-search">
        <Search size={15} />
        <input placeholder="Sök namn eller e-post" value={segment.search} onChange={(e) => set({ search: e.target.value })} />
      </label>

      <div className="cs-field">
        <span>Event</span>
        <select value="" onChange={(e) => addEvent(e.target.value)}>
          <option value="">{segment.eventIds.length ? "+ Lägg till ett event" : "Alla i CRM:et – eller välj event"}</option>
          {events.filter((e) => !chosen.has(e.id)).map((e) => (
            <option key={e.id} value={e.id}>{e.title || "Utan titel"}{e.startsAt ? ` · ${day(e.startsAt)}` : ""}</option>
          ))}
        </select>
        {segment.eventIds.length > 0 && (
          <div className="cs-chips">
            {segment.eventIds.map((id) => (
              <span key={id} className="cs-chip">
                {byId.get(id)?.title || "Event"}
                <button type="button" onClick={() => removeEvent(id)} aria-label="Ta bort"><X size={13} /></button>
              </span>
            ))}
          </div>
        )}
        <p className="cs-hint">{segment.eventIds.length ? "Alla som anmält sig till något av dessa." : "Inget event valt: alla i CRM:et som vill ha inbjudningar."}</p>
      </div>

      <div className="cs-toggles">
        <button type="button" className={segment.came ? "is-on" : ""} onClick={() => set({ came: !segment.came })}>Bara de som kom</button>
        <button
          type="button"
          className={consentOnly ? "is-on" : ""}
          disabled={consentForced}
          title={consentForced ? "Alltid på utan event: för att mejla CRM:et krävs att de tackat ja." : ""}
          onClick={() => set({ consentOnly: !segment.consentOnly })}
        >
          Bara de som vill ha inbjudningar
        </button>
      </div>

      <div className="cs-count">
        <b>{total == null ? "…" : total.toLocaleString("sv-SE")}</b>
        <span>mottagare · den som avregistrerat sig får aldrig mejl</span>
      </div>

      <ul className="cs-list">
        {people.slice(0, shown).map((p) => (
          <li key={p.id}>
            <span className="cs-name">{p.name || p.email}<small>{p.name ? p.email : ""}</small></span>
            <span className="cs-meta">{p.events ? `${p.events} ev` : ""}{p.attended ? ` · kom ${p.attended}` : ""}</span>
            <i className={`cs-dot${p.consent ? " is-on" : ""}`} title={p.consent ? "Vill ha inbjudningar" : "Har inte tackat ja till inbjudningar"} />
          </li>
        ))}
      </ul>
      {people.length > shown && (
        <button type="button" className="cs-more" onClick={() => setShown(shown + SHOW)}>Visa fler ({(people.length - shown).toLocaleString("sv-SE")})</button>
      )}
      {!people.length && <p className="cs-hint">Ingen matchar.</p>}
    </div>
  );
}

const CSS = `
  .cs { display: grid; gap: 14px; }
  .cs-search { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border: 1px solid ${colors.border}; border-radius: 10px; background: #fff; color: ${colors.textSubtle}; }
  .cs-search input { flex: 1; border: 0; outline: none; font: inherit; font-size: 14px; color: ${colors.text}; background: none; }
  .cs-field { display: grid; gap: 6px; }
  .cs-field > span { font-size: 11px; color: ${colors.textSubtle}; text-transform: uppercase; letter-spacing: 0.04em; }
  .cs-field select { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid ${colors.border}; background: #fff; color: ${colors.text}; font: inherit; font-size: 14px; }
  .cs-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .cs-chip { display: inline-flex; align-items: center; gap: 4px; padding: 5px 6px 5px 10px; border-radius: 999px; background: #0a0a0a; color: #fff; font-size: 12.5px; font-weight: 600; max-width: 100%; }
  .cs-chip button { display: grid; place-items: center; border: 0; background: rgba(255,255,255,0.18); color: #fff; width: 18px; height: 18px; border-radius: 999px; cursor: pointer; padding: 0; }
  .cs-hint { margin: 0; font-size: 12px; color: ${colors.textSubtle}; line-height: 1.45; }
  .cs-toggles { display: flex; flex-wrap: wrap; gap: 6px; }
  .cs-toggles button { font: inherit; font-size: 12.5px; font-weight: 600; padding: 7px 12px; border-radius: 999px; border: 1px solid ${colors.border}; background: #fff; color: ${colors.text}; cursor: pointer; }
  .cs-toggles button.is-on { background: #0a0a0a; border-color: #0a0a0a; color: #fff; }
  .cs-toggles button:disabled { cursor: default; opacity: 0.75; }
  .cs-count { padding: 12px 14px; border-radius: 12px; border: 1px solid ${colors.border}; background: #fff; }
  .cs-count b { display: block; font-size: 26px; letter-spacing: -0.02em; }
  .cs-count span { font-size: 12px; color: ${colors.textSubtle}; }
  .cs-list { list-style: none; margin: 0; padding: 0; border: 1px solid ${colors.border}; border-radius: 12px; background: #fff; overflow: hidden; }
  .cs-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto 8px; gap: 10px; align-items: center; padding: 8px 12px; border-bottom: 1px solid ${colors.borderFaint}; font-size: 13px; }
  .cs-list li:last-child { border-bottom: 0; }
  .cs-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .cs-name small { font-weight: 400; color: ${colors.textSubtle}; margin-left: 6px; }
  .cs-meta { font-size: 12px; color: ${colors.textSubtle}; white-space: nowrap; }
  .cs-dot { width: 8px; height: 8px; border-radius: 999px; background: #d4d4d8; }
  .cs-dot.is-on { background: ${colors.success}; }
  .cs-more { font: inherit; font-size: 13px; font-weight: 600; padding: 8px 12px; border-radius: 999px; border: 1px solid ${colors.border}; background: #fff; cursor: pointer; justify-self: start; }
`;
