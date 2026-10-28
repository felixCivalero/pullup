import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { BrandKicker } from "../../components/admin/ByBrand.jsx";
import { AdminShell } from "./AdminShell.jsx";
import { EVENT_ADMIN_CSS } from "./eventAdminCss.js";

/* /admin/people — the CRM: every person on PullUp, one row each, with every
   event they signed up to and how many they actually came to. The relationship
   data the old platform built, still growing with every sign-up. */

const SHOW_STEP = 150;
const nf = new Intl.NumberFormat("sv-SE");
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) : "–");
const SOURCE_SV = { event: "Event", direct: "Event", ig_comment: "Instagram", ig_dm: "Instagram", ig_story_link: "Instagram", whatsapp: "WhatsApp", email: "E-post", csv: "Import" };

function csv(rows) {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(cell).join(",")).join("\n");
}

export function PeoplePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [eventId, setEventId] = useState("");
  const [only, setOnly] = useState("all");
  const [shown, setShown] = useState(SHOW_STEP);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    authenticatedFetch("/admin/people")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, []);

  const events = useMemo(() => new Map((data?.events || []).map((e) => [e.id, e])), [data]);
  const list = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.people.filter((p) => {
      if (needle && !`${p.name} ${p.email} ${p.instagram}`.toLowerCase().includes(needle)) return false;
      if (eventId && !p.eventIds.includes(eventId)) return false;
      if (only === "consent" && !p.consent) return false;
      if (only === "came" && !p.attended) return false;
      if (only === "regulars" && p.events < 2) return false;
      return true;
    });
  }, [data, q, eventId, only]);

  const stats = useMemo(() => {
    const ps = data?.people || [];
    return {
      total: ps.length,
      withEvents: ps.filter((p) => p.events).length,
      came: ps.filter((p) => p.attended).length,
      regulars: ps.filter((p) => p.events >= 2).length,
      consent: ps.filter((p) => p.consent).length,
    };
  }, [data]);

  const exportCsv = () => {
    const rows = [["Namn", "E-post", "Telefon", "Instagram", "Event", "Kom", "Senaste event", "Vill ha inbjudningar"], ...list.map((p) => [p.name, p.email, p.phone, p.instagram, p.events, p.attended, p.lastEventTitle || "", p.consent ? "ja" : ""])];
    const blob = new Blob(["﻿" + csv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pullup-crm.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const person = open ? data.people.find((p) => p.id === open) : null;
  const sortedEvents = [...(data?.events || [])].sort((a, b) => (b.startsAt || "").localeCompare(a.startsAt || ""));

  return (
    <AdminShell title="CRM">
      <style>{EVENT_ADMIN_CSS + PEOPLE_CSS}</style>
      <div className="ea">
        <div className="ea-head">
          <div>
            <BrandKicker />
            <h1>CRM</h1>
            {data && <p className="ea-muted">{nf.format(stats.total)} personer · {nf.format(stats.withEvents)} har anmält sig till event · {nf.format(stats.came)} har kommit · {nf.format(stats.regulars)} återkommande · {nf.format(stats.consent)} vill ha inbjudningar</p>}
          </div>
          <button type="button" className="ea-btn" onClick={exportCsv} disabled={!list.length}>Exportera {list.length ? nf.format(list.length) : ""}</button>
        </div>
        {error && <p className="ea-error">Kunde inte hämta CRM:et.</p>}
        {!data && !error && <p className="ea-muted">Hämtar…</p>}
        {data && (
          <>
            <div className="pp-filters">
              <input className="ea-search" placeholder="Sök namn, e-post eller Instagram" value={q} onChange={(e) => { setQ(e.target.value); setShown(SHOW_STEP); }} />
              <select className="ea-input" value={eventId} onChange={(e) => { setEventId(e.target.value); setShown(SHOW_STEP); }}>
                <option value="">Alla event</option>
                {sortedEvents.map((e) => <option key={e.id} value={e.id}>{e.title || "Utan titel"}{e.startsAt ? ` · ${day(e.startsAt)}` : ""}</option>)}
              </select>
            </div>
            <div className="ea-tabs">
              {[["all", "Alla"], ["came", "Har kommit"], ["regulars", "Återkommande (2+)"], ["consent", "Vill ha inbjudningar"]].map(([k, l]) => (
                <button key={k} type="button" className={only === k ? "is-on" : ""} onClick={() => { setOnly(k); setShown(SHOW_STEP); }}>{l}</button>
              ))}
            </div>
            <p className="ea-muted pp-count">{nf.format(list.length)} {list.length === 1 ? "person" : "personer"}</p>
            <div className="ea-wrap">
              <table className="ea-table">
                <thead><tr><th>Namn</th><th>E-post</th><th className="num">Event</th><th className="num">Kom</th><th>Senaste event</th><th title="Vill ha inbjudningar">Inbj.</th></tr></thead>
                <tbody>
                  {list.slice(0, shown).map((p) => (
                    <tr key={p.id} className="is-click" onClick={() => setOpen(p.id)}>
                      <td><b>{p.name || "–"}</b></td>
                      <td>{p.email}</td>
                      <td className="num">{p.events || "–"}</td>
                      <td className="num">{p.attended || "–"}</td>
                      <td className="pp-last">{p.lastEventTitle ? <>{p.lastEventTitle} <span className="ea-muted">{day(p.lastEventAt)}</span></> : <span className="ea-muted">–</span>}</td>
                      <td><i className={`ea-dot${p.consent ? " is-on" : ""}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {list.length > shown && <button type="button" className="ea-btn pp-more" onClick={() => setShown(shown + SHOW_STEP)}>Visa fler ({nf.format(list.length - shown)} kvar)</button>}
          </>
        )}
      </div>
      {person && (
        <div className="pp-drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && setOpen(null)}>
          <aside className="pp-drawer">
            <button type="button" className="pp-close" onClick={() => setOpen(null)} aria-label="Stäng"><X size={20} /></button>
            <h2>{person.name || person.email}</h2>
            <p className="ea-muted">{person.email}{person.phone ? ` · ${person.phone}` : ""}{person.instagram ? ` · @${person.instagram.replace(/^@/, "")}` : ""}</p>
            <div className="pp-facts">
              <div><b>{person.events}</b><span>event</span></div>
              <div><b>{person.attended}</b><span>kom</span></div>
              <div><b>{person.consent ? "Ja" : "Nej"}</b><span>inbjudningar</span></div>
            </div>
            <p className="ea-muted">I CRM:et sedan {day(person.createdAt)}{person.source ? ` · via ${SOURCE_SV[person.source] || person.source}` : ""}</p>
            <h3>Event</h3>
            {person.eventIds.length ? (
              <ul className="pp-events">
                {person.eventIds.map((id) => {
                  const e = events.get(id);
                  return (
                    <li key={id}>
                      <Link to={`/admin/events/${id}`}>{e?.title || "Event"}</Link>
                      <span className="ea-muted">{day(e?.startsAt)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="ea-muted">Inga event än.</p>}
          </aside>
        </div>
      )}
    </AdminShell>
  );
}

const PEOPLE_CSS = `
  .pp-filters { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 280px); gap: 8px; margin-bottom: 12px; }
  @media (max-width: 620px) { .pp-filters { grid-template-columns: 1fr; } }
  .pp-count { margin: 0 0 6px; }
  .pp-last { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pp-more { margin-top: 12px; }
  .pp-drawer-bg { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.25); display: flex; justify-content: flex-end; }
  .pp-drawer { position: relative; width: min(420px, 100%); height: 100%; overflow-y: auto; background: #fff; padding: 28px 22px; box-sizing: border-box; box-shadow: -10px 0 40px rgba(0,0,0,0.12); }
  .pp-drawer h2 { margin: 0 32px 4px 0; font-size: 22px; letter-spacing: -0.02em; }
  .pp-drawer h3 { margin: 22px 0 8px; font-size: 13px; color: #6e6e73; text-transform: uppercase; letter-spacing: 0.04em; }
  .pp-close { position: absolute; top: 18px; right: 16px; border: 0; background: none; cursor: pointer; color: #6e6e73; }
  .pp-facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 16px 0 12px; }
  .pp-facts > div { border: 1px solid rgba(0,0,0,0.1); border-radius: 12px; padding: 10px 12px; display: grid; }
  .pp-facts b { font-size: 20px; }
  .pp-facts span { font-size: 12px; color: #6e6e73; }
  .pp-events { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .pp-events li { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.06); }
  .pp-events a { color: #0a0a0a; font-weight: 600; text-decoration: none; }
  .pp-events a:hover { text-decoration: underline; }
`;
