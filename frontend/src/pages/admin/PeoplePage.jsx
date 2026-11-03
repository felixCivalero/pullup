import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { BrandKicker, TeamOnly } from "../../components/admin/ByBrand.jsx";
import { useCurrentBrand } from "../../lib/brand.js";
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
  return (
    <AdminShell title="CRM">
      <People />
    </AdminShell>
  );
}

// Inside AdminShell, so it knows the brand on screen. A main brand over other
// brands (an umbrella) holds all their guests: a brand filter, and per person
// which brands they said yes to — consent stays per brand.
function People() {
  const brand = useCurrentBrand();
  const [data, setData] = useState(null);
  const [brandId, setBrandId] = useState("");
  const family = brand?.under?.length ? [brand, ...brand.under] : [];
  const umbrella = family.length > 0;
  const nameOf = (id) => family.find((b) => b.id === id)?.name || "Varumärke";
  const names = (ids) => ids.map(nameOf).join(", ");
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
      if (brandId && !p.brandIds.includes(brandId) && !p.consentBrands.includes(brandId)) return false;
      if (only === "consent" && !(brandId ? p.consentBrands.includes(brandId) : p.consent)) return false;
      if (only === "came" && !p.attended) return false;
      if (only === "regulars" && p.events < 2) return false;
      return true;
    });
  }, [data, q, eventId, only, brandId]);

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
    const rows = umbrella
      ? [["Namn", "E-post", "Telefon", "Instagram", "Event", "Kom", "Senaste event", "Varumärken", "Godkänner mejlutskick från", "Svar"], ...list.map((p) => [p.name, p.email, p.phone, p.instagram, p.events, p.attended, p.lastEventTitle || "", names(p.brandIds), names(p.consentBrands), answersText(p)])]
      : [["Namn", "E-post", "Telefon", "Instagram", "Event", "Kom", "Senaste event", "Godkänner mejlutskick", "Svar"], ...list.map((p) => [p.name, p.email, p.phone, p.instagram, p.events, p.attended, p.lastEventTitle || "", p.consent ? "ja" : "", answersText(p)])];
    const blob = new Blob(["﻿" + csv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pullup-crm.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Their answers to events' own questions, one line: "Event: Fråga: svar; …".
  const answersText = (p) => (p.answers || []).map((a) => `${events.get(a.eventId)?.title || "Event"}: ${Object.entries(a.answers).map(([k, v]) => `${k}: ${v}`).join(", ")}`).join("; ");
  const person = open ? data.people.find((p) => p.id === open) : null;
  const sortedEvents = [...(data?.events || [])]
    .filter((e) => !brandId || e.brandId === brandId)
    .sort((a, b) => (b.startsAt || "").localeCompare(a.startsAt || ""));

  return (
    <>
      <style>{EVENT_ADMIN_CSS + PEOPLE_CSS}</style>
      <div className="ea">
        <div className="ea-head">
          <div>
            <BrandKicker />
            <h1>CRM</h1>
            {data && <p className="ea-muted">{nf.format(stats.total)} personer · {nf.format(stats.withEvents)} har anmält sig till event · {nf.format(stats.came)} har kommit · {nf.format(stats.regulars)} återkommande · {nf.format(stats.consent)} godkänner mejlutskick</p>}
          </div>
          <div className="pp-actions">
            <TeamOnly><Link to="/admin/people/import" className="ea-btn">Importera kontakter</Link></TeamOnly>
            <button type="button" className="ea-btn" onClick={exportCsv} disabled={!list.length}>Exportera {list.length ? nf.format(list.length) : ""}</button>
          </div>
        </div>
        {error && <p className="ea-error">Kunde inte hämta CRM:et.</p>}
        {!data && !error && <p className="ea-muted">Hämtar…</p>}
        {data && (
          <>
            <div className="pp-filters">
              <input className="ea-search" placeholder="Sök namn, e-post eller Instagram" value={q} onChange={(e) => { setQ(e.target.value); setShown(SHOW_STEP); }} />
              {umbrella && (
                <select className="ea-input" value={brandId} onChange={(e) => { setBrandId(e.target.value); setEventId(""); setShown(SHOW_STEP); }}>
                  <option value="">Alla varumärken</option>
                  {family.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              <select className="ea-input" value={eventId} onChange={(e) => { setEventId(e.target.value); setShown(SHOW_STEP); }}>
                <option value="">Alla event</option>
                {sortedEvents.map((e) => <option key={e.id} value={e.id}>{e.title || "Utan titel"}{e.startsAt ? ` · ${day(e.startsAt)}` : ""}</option>)}
              </select>
            </div>
            <div className="ea-tabs">
              {[["all", "Alla"], ["came", "Har kommit"], ["regulars", "Återkommande (2+)"], ["consent", "Godkänner mejlutskick"]].map(([k, l]) => (
                <button key={k} type="button" className={only === k ? "is-on" : ""} onClick={() => { setOnly(k); setShown(SHOW_STEP); }}>{l}</button>
              ))}
            </div>
            <p className="ea-muted pp-count">{nf.format(list.length)} {list.length === 1 ? "person" : "personer"}</p>
            <div className="ea-wrap">
              <table className="ea-table">
                <thead><tr><th>Namn</th><th>E-post</th><th className="num">Event</th><th className="num">Kom</th><th>Senaste event</th>{umbrella ? <th>Godkänner mejlutskick från</th> : <th title="Godkänner mejlutskick">Mejl</th>}</tr></thead>
                <tbody>
                  {list.slice(0, shown).map((p) => (
                    <tr key={p.id} className="is-click" onClick={() => setOpen(p.id)}>
                      <td><b>{p.name || "–"}</b></td>
                      <td>{p.email}</td>
                      <td className="num">{p.events || "–"}</td>
                      <td className="num">{p.attended || "–"}</td>
                      <td className="pp-last">{p.lastEventTitle ? <>{p.lastEventTitle} <span className="ea-muted">{day(p.lastEventAt)}</span></> : <span className="ea-muted">–</span>}</td>
                      {umbrella ? (
                        <td className="pp-yes">{p.consentBrands.length ? p.consentBrands.map((id) => <span key={id}>{nameOf(id)}</span>) : <span className="ea-muted">–</span>}</td>
                      ) : <td><i className={`ea-dot${p.consent ? " is-on" : ""}`} /></td>}
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
              <div><b>{umbrella ? person.consentBrands.length : person.consent ? "Ja" : "Nej"}</b><span>{umbrella ? "samtycken" : "inbjudningar"}</span></div>
            </div>
            {umbrella && (
              <>
                <h3>Godkänner mejlutskick från</h3>
                <ul className="pp-consent">
                  {family.filter((b) => person.brandIds.includes(b.id) || person.consentBrands.includes(b.id)).map((b) => (
                    <li key={b.id}><span>{b.name}</span><b className={person.consentBrands.includes(b.id) ? "is-yes" : ""}>{person.consentBrands.includes(b.id) ? "Ja" : "Nej"}</b></li>
                  ))}
                </ul>
                <p className="ea-muted pp-note">Varje varumärke mejlar bara dem som sagt ja till just det varumärket.</p>
              </>
            )}
            <p className="ea-muted">I CRM:et sedan {day(person.createdAt)}{person.source ? ` · via ${SOURCE_SV[person.source] || person.source}` : ""}</p>
            {person.answers?.length > 0 && (
              <>
                <h3>Svar</h3>
                <ul className="pp-answers">
                  {person.answers.map((a) => (
                    <li key={a.eventId}>
                      <span className="ea-muted">{events.get(a.eventId)?.title || "Event"}</span>
                      {Object.entries(a.answers).map(([k, v]) => <div key={k}><b>{k}</b> {String(v)}</div>)}
                    </li>
                  ))}
                </ul>
              </>
            )}
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
    </>
  );
}

const PEOPLE_CSS = `
  .pp-filters:has(> :nth-child(3)) { grid-template-columns: minmax(0, 1fr) minmax(0, 200px) minmax(0, 260px); }
  .pp-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .pp-yes { display: flex; flex-wrap: wrap; gap: 4px; }
  .pp-yes span:not(.ea-muted) { font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #efeeea; color: #3a3a3c; white-space: nowrap; }
  .pp-consent { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
  .pp-consent li { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid rgba(0,0,0,0.06); font-size: 14px; }
  .pp-consent b { font-size: 13px; color: #8a8a8e; }
  .pp-consent b.is-yes { color: #0a7a3a; }
  .pp-note { margin: 8px 0 0; font-size: 12.5px; }
  .pp-answers { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .pp-answers li { display: grid; gap: 3px; font-size: 14px; padding: 8px 10px; border: 1px solid rgba(0,0,0,0.08); border-radius: 8px; }
  .pp-answers li span { font-size: 12px; margin: 0; }
  .pp-answers b { font-weight: 600; margin-right: 4px; }
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
