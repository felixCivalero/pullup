import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { fmt } from "./statsFormat.js";

/* The side panel on /admin/platform: one organiser account (backend
   accountDetail in routes/adminPlatform.js). Who it is, its brands and team,
   every event with its numbers, mail and credits, and what the owner can do:
   give or take credits, pause mail or publishing, cap events, stop login,
   unpublish an event. */

const day = (iso) => (iso ? new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) : "–");
const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)} %`);
const REASON_SV = { purchase: "Köpt", send: "Utskick", refund: "Tillbaka", adjust: "Justering" };
const SOURCE_SV = { direct: "Direkt", pullup: "PullUp", instagram: "Instagram", facebook: "Facebook", google: "Google", mail: "Mejl", tiktok: "TikTok", linkedin: "LinkedIn", ai: "AI-chatt" };

export function AccountDrawer({ id, onClose, onChanged }) {
  const [a, setA] = useState(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [limits, setLimits] = useState(null);

  const load = useCallback(() => {
    setError(false);
    authenticatedFetch(`/admin/platform/accounts/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setA(d); setLimits({ ...d.limits, maxEvents: d.limits.maxEvents ?? "" , note: d.limits.note || "" }); })
      .catch(() => setError(true));
  }, [id]);
  useEffect(() => { setA(null); load(); }, [load]);
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  // Every action: post, reload the panel and the list behind it.
  const act = async (path, body, failMsg = "Det gick inte.") => {
    setBusy(true);
    try {
      const res = await authenticatedFetch(path, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        window.alert(e.error === "below_zero" ? "Kontot har inte så många utskick kvar." : failMsg);
        return false;
      }
      load();
      onChanged?.();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const credits = async (sign) => {
    const n = window.prompt(sign > 0 ? `Hur många utskick ska ${a.email} få?` : `Hur många utskick ska dras av från ${a.email}?`, sign > 0 ? "5000" : "");
    if (!n || !Number(n)) return;
    const note = window.prompt("Anteckning (t.ex. Nigab, uppstart)", "") || "";
    act("/admin/platform/credits", { hostId: a.id, count: sign * Math.abs(Math.round(Number(n))), note });
  };
  const saveLimits = () => act(`/admin/platform/accounts/${a.id}/limits`, { mailBlocked: limits.mailBlocked, publishBlocked: limits.publishBlocked, maxEvents: limits.maxEvents === "" ? null : Number(limits.maxEvents), note: limits.note });
  const ban = () => {
    const banned = !a.banned;
    if (banned && !window.confirm(`Spärra inloggningen för ${a.email}? Sidorna ligger kvar, men kontot kan inte logga in förrän du släpper spärren.`)) return;
    act(`/admin/platform/accounts/${a.id}/ban`, { banned });
  };
  const setStatus = (e) => {
    const status = e.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    if (status === "DRAFT" && !window.confirm(`Avpublicera "${e.title}"? Sidan går inte att nå förrän den publiceras igen.`)) return;
    act(`/admin/platform/events/${e.id}/status`, { status });
  };

  const dirty = a && limits && (limits.mailBlocked !== a.limits.mailBlocked || limits.publishBlocked !== a.limits.publishBlocked || String(limits.maxEvents ?? "") !== String(a.limits.maxEvents ?? "") || (limits.note || "") !== (a.limits.note || ""));
  const t = a?.totals;
  const maxSource = Math.max(1, ...(a?.sources || []).map((s) => s.n));

  return (
    <div className="pp-drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="pp-drawer ac-drawer" aria-label="Konto">
        <button type="button" className="pp-close" onClick={onClose} aria-label="Stäng"><X size={20} /></button>
        {error && <p className="ea-error">Kunde inte hämta kontot.</p>}
        {!a && !error && <p className="ea-muted">Hämtar…</p>}
        {a && (
          <>
            <h2>{a.name || a.email}</h2>
            <p className="ea-muted ac-sub"><a href={`mailto:${a.email}`}>{a.email}</a>{a.profile?.phone ? ` · ${a.profile.phone}` : ""}{a.profile?.city ? ` · ${a.profile.city}` : ""}</p>
            <div className="ac-tags">
              {a.banned && <span className="is-bad">Inloggning spärrad</span>}
              {a.limits.mailBlocked && <span className="is-bad">Mejl pausat</span>}
              {a.limits.publishBlocked && <span className="is-bad">Publicering pausad</span>}
              {a.limits.maxEvents != null && <span className="is-warn">Max {a.limits.maxEvents} event</span>}
              {Date.parse(a.createdAt) < Date.parse("2026-10-19") && <span>Gamla appen</span>}
              {!a.confirmed && <span className="is-warn">Ej bekräftad</span>}
            </div>
            <dl className="ac-meta">
              <div><dt>Konto sedan</dt><dd>{day(a.createdAt)}</dd></div>
              <div><dt>Senast inne</dt><dd>{day(a.lastSignIn)}</dd></div>
              <div><dt>Inloggningar</dt><dd>{a.profile?.logins ?? "–"}</dd></div>
              <div><dt>Kom via</dt><dd>{a.profile?.origin || "–"}</dd></div>
            </dl>

            <div className="pp-facts ac-facts">
              <div><b>{fmt(t.events)}</b><span>event · {fmt(a.events.filter((e) => e.upcoming).length)} kommande</span></div>
              <div><b>{fmt(t.signups)}</b><span>anmälda</span></div>
              <div><b>{fmt(t.came)}</b><span>kom</span></div>
              <div><b>{fmt(t.visitors)}</b><span>besökare</span></div>
              <div><b>{pct(t.conversion)}</b><span>besök → anmälan</span></div>
              <div><b>{fmt(t.consents)}</b><span>ja till mejl</span></div>
            </div>

            {a.sources.length > 0 && (
              <>
                <h3>Var besöken kommer ifrån</h3>
                <ul className="ac-bars">
                  {a.sources.slice(0, 6).map((s) => (
                    <li key={s.key}><span>{SOURCE_SV[s.key] || s.key}</span><i style={{ width: `${(s.n / maxSource) * 100}%` }} /><b>{fmt(s.n)}</b></li>
                  ))}
                </ul>
              </>
            )}

            <h3>Event</h3>
            {a.events.length ? (
              <ul className="ac-events">
                {a.events.map((e) => (
                  <li key={e.id}>
                    <div className="ac-ev-head">
                      <Link to={`/admin/events/${e.id}`}>{e.title}</Link>
                      <span className={`ac-pill${e.status === "PUBLISHED" ? (e.upcoming ? " is-up" : "") : " is-draft"}`}>{e.status === "PUBLISHED" ? (e.upcoming ? "Kommande" : "Passerat") : "Utkast"}</span>
                    </div>
                    <div className="ea-muted ac-ev-sub">{day(e.startsAt)}{e.brand ? ` · ${e.brand}` : ""}{e.location ? ` · ${e.location}` : ""}</div>
                    <div className="ac-ev-nums">
                      <span><b>{fmt(e.visitors || 0)}</b> besökare</span>
                      <span><b>{fmt(e.signups || 0)}</b>{e.capacity ? `/${fmt(e.capacity)}` : ""} anmälda</span>
                      {e.waitlist > 0 && <span><b>{fmt(e.waitlist)}</b> väntelista</span>}
                      <span><b>{fmt(e.came || 0)}</b> kom</span>
                      <span><b>{pct(e.conversion)}</b> konv.</span>
                    </div>
                    <div className="ac-ev-actions">
                      {e.status === "PUBLISHED" && <a href={`/e/${e.slug}`} target="_blank" rel="noreferrer">Öppna sidan</a>}
                      <button type="button" disabled={busy} onClick={() => setStatus(e)}>{e.status === "PUBLISHED" ? "Avpublicera" : "Publicera"}</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="ea-muted">Inga event än.</p>}

            <h3>Varumärken och team</h3>
            <ul className="pp-consent">
              {a.brands.map((b) => (
                <li key={b.id}>
                  <span>{b.under ? `└ ${b.name}` : b.name}{b.members.length ? <small className="ea-muted"> · {b.members.join(", ")}</small> : null}</span>
                  <b className={b.senderVerified ? "is-yes" : ""}>{b.sender ? (b.senderVerified ? b.sender : `${b.sender} (ej verifierad)`) : "no-reply@pullup.se"}</b>
                </li>
              ))}
            </ul>

            <h3>Mejl och utskick</h3>
            <div className="pp-facts ac-facts">
              <div><b>{fmt(a.credits)}</b><span>utskick kvar</span></div>
              <div><b>{fmt(a.mail.sends)}</b><span>massutskick</span></div>
              <div><b>{fmt(a.mail.sent)}</b><span>mejl skickade</span></div>
              <div><b>{fmt(a.mail.last30)}</b><span>senaste 30 dagar</span></div>
              <div><b>{fmt(a.mail.failed)}</b><span>studsade/fel</span></div>
              <div><b>{fmt(a.contacts.consented)}</b><span>importerade ja · {fmt(a.contacts.total)} totalt</span></div>
            </div>
            {a.ledger.length > 0 && (
              <ul className="ac-ledger">
                {a.ledger.slice(0, 8).map((l, i) => (
                  <li key={i}><span>{REASON_SV[l.reason] || l.reason}{l.note ? ` · ${l.note}` : ""}</span><span className="ea-muted">{day(l.at)}</span><b className={l.delta > 0 ? "is-yes" : ""}>{l.delta > 0 ? "+" : ""}{fmt(l.delta)}</b></li>
                ))}
              </ul>
            )}
            {a.imports.length > 0 && (
              <p className="ea-muted pp-note">Importer: {a.imports.map((i) => `${i.file || "fil"} (${fmt(i.added)} nya, ${day(i.at)})`).join(" · ")}</p>
            )}

            <h3>Åtgärder</h3>
            <div className="ac-actions">
              <button type="button" className="ea-btn" disabled={busy} onClick={() => credits(1)}>Ge utskick</button>
              <button type="button" className="ea-btn" disabled={busy || a.credits <= 0} onClick={() => credits(-1)}>Dra av utskick</button>
              <a className="ea-btn" href={`mailto:${a.email}`}>Mejla</a>
            </div>

            <h3>Begränsningar</h3>
            <div className="ac-limits">
              <label><input type="checkbox" checked={limits.mailBlocked} onChange={(e) => setLimits({ ...limits, mailBlocked: e.target.checked })} /> <span><b>Pausa mejl</b><small>Inga utskick, och anmälningar sparas men får inget bekräftelsemejl.</small></span></label>
              <label><input type="checkbox" checked={limits.publishBlocked} onChange={(e) => setLimits({ ...limits, publishBlocked: e.target.checked })} /> <span><b>Pausa publicering</b><small>Kan göra utkast men inte publicera. Publicerade sidor ligger kvar.</small></span></label>
              <label className="ac-num"><span><b>Max antal event</b><small>Tomt = ingen gräns. Har {fmt(t.events)} nu.</small></span><input type="number" min="0" value={limits.maxEvents} placeholder="–" onChange={(e) => setLimits({ ...limits, maxEvents: e.target.value })} /></label>
              <textarea rows={2} placeholder="Anteckning (varför)" value={limits.note} onChange={(e) => setLimits({ ...limits, note: e.target.value })} />
              <div className="ac-actions">
                <button type="button" className="ea-btn is-dark" disabled={busy || !dirty} onClick={saveLimits}>Spara begränsningar</button>
                {a.limits.updatedAt && <span className="ea-muted">Ändrat {day(a.limits.updatedAt)}</span>}
              </div>
            </div>
            <div className="ac-danger">
              <span><b>{a.banned ? "Inloggningen är spärrad" : "Spärra inloggning"}</b><small>{a.banned ? `Sedan den spärrades kan kontot inte logga in. Sidorna ligger kvar.` : "Kontot kan inte logga in. Sidorna ligger kvar; avpublicera dem ovan vid behov."}</small></span>
              <button type="button" className={`ea-btn${a.banned ? "" : " is-danger"}`} disabled={busy} onClick={ban}>{a.banned ? "Släpp spärren" : "Spärra"}</button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

export const ACCOUNT_DRAWER_CSS = `
  .pp-drawer-bg { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.25); display: flex; justify-content: flex-end; }
  .pp-drawer { position: relative; width: min(420px, 100%); height: 100%; overflow-y: auto; background: #fff; padding: 28px 22px; box-sizing: border-box; box-shadow: -10px 0 40px rgba(0,0,0,0.12); }
  .pp-drawer h2 { margin: 0 32px 4px 0; font-size: 22px; letter-spacing: -0.02em; }
  .pp-drawer h3 { margin: 24px 0 8px; font-size: 13px; color: #6e6e73; text-transform: uppercase; letter-spacing: 0.04em; }
  .pp-close { position: absolute; top: 18px; right: 16px; border: 0; background: none; cursor: pointer; color: #6e6e73; }
  .pp-facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 16px 0 12px; }
  .pp-facts > div { border: 1px solid rgba(0,0,0,0.1); border-radius: 12px; padding: 10px 12px; display: grid; }
  .pp-facts b { font-size: 20px; }
  .pp-facts span { font-size: 12px; color: #6e6e73; }
  .pp-consent { list-style: none; margin: 0; padding: 0; }
  .pp-consent li { display: flex; justify-content: space-between; gap: 10px; padding: 9px 0; border-bottom: 1px solid rgba(0,0,0,0.06); font-size: 14px; }
  .pp-consent b { font-size: 12.5px; color: #8a8a8e; font-weight: 500; text-align: right; overflow-wrap: anywhere; }
  .pp-consent b.is-yes { color: #0a7a3a; }
  .pp-note { margin: 8px 0 0; font-size: 12.5px; }
  .ac-drawer { width: min(520px, 100%); }
  .ac-sub { margin: 0 0 8px; overflow-wrap: anywhere; }
  .ac-sub a { color: inherit; }
  .ac-tags { display: flex; flex-wrap: wrap; gap: 5px; margin: 8px 0 4px; }
  .ac-tags span { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #efeeea; color: #3a3a3c; }
  .ac-tags .is-bad { background: #fde7ec; color: #b4123f; }
  .ac-tags .is-warn { background: #fff2d9; color: #8a5a00; }
  .ac-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 0; }
  .ac-meta div { margin: 0; }
  .ac-meta dt { font-size: 11px; color: #8a8a8e; }
  .ac-meta dd { margin: 2px 0 0; font-size: 13px; font-weight: 600; }
  .ac-facts b { font-size: 18px; }
  .ac-bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; }
  .ac-bars li { display: grid; grid-template-columns: 96px 1fr 44px; align-items: center; gap: 8px; font-size: 13px; }
  .ac-bars span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ac-bars i { display: block; height: 8px; border-radius: 4px; background: #ec178f; min-width: 2px; }
  .ac-bars b { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
  .ac-events { list-style: none; margin: 0; padding: 0; }
  .ac-events li { padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.06); }
  .ac-ev-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .ac-ev-head a { color: #0a0a0a; font-weight: 600; text-decoration: none; font-size: 14.5px; }
  .ac-ev-head a:hover { text-decoration: underline; }
  .ac-pill { flex: none; font-size: 10.5px; font-weight: 600; padding: 2px 7px; border-radius: 999px; background: #efeeea; color: #6e6e73; }
  .ac-pill.is-up { background: #e3f4ea; color: #0a7a3a; }
  .ac-pill.is-draft { background: #fff2d9; color: #8a5a00; }
  .ac-ev-sub { font-size: 12px; margin: 2px 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ac-ev-nums { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12.5px; color: #3a3a3c; }
  .ac-ev-nums b { font-variant-numeric: tabular-nums; }
  .ac-ev-actions { display: flex; gap: 12px; margin-top: 6px; font-size: 12.5px; }
  .ac-ev-actions a, .ac-ev-actions button { color: #6e6e73; background: none; border: 0; padding: 0; cursor: pointer; font: inherit; text-decoration: underline; }
  .ac-ev-actions button:hover { color: #b4123f; }
  .ac-ledger { list-style: none; margin: 4px 0 0; padding: 0; }
  .ac-ledger li { display: grid; grid-template-columns: 1fr auto 70px; gap: 10px; padding: 6px 0; border-bottom: 1px solid rgba(0,0,0,0.06); font-size: 13px; }
  .ac-ledger b { text-align: right; font-variant-numeric: tabular-nums; }
  .ac-ledger b.is-yes { color: #0a7a3a; }
  .ac-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .ac-actions a.ea-btn { text-decoration: none; }
  .ac-limits { display: grid; gap: 10px; }
  .ac-limits label { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; font-size: 14px; }
  .ac-limits label input[type=checkbox] { margin-top: 3px; accent-color: #ec178f; }
  .ac-limits label span, .ac-danger span { display: grid; gap: 2px; }
  .ac-limits small, .ac-danger small { font-size: 12px; color: #6e6e73; }
  .ac-limits .ac-num { justify-content: space-between; align-items: center; }
  .ac-limits .ac-num input { width: 80px; padding: 6px 8px; border: 1px solid rgba(0,0,0,0.15); border-radius: 6px; font: inherit; }
  .ac-limits textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid rgba(0,0,0,0.15); border-radius: 6px; font: inherit; font-size: 13.5px; resize: vertical; }
  .ac-danger { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 20px; padding: 12px; border: 1px solid #f3c4cf; border-radius: 8px; background: #fff7f9; font-size: 14px; }
  @media (max-width: 480px) { .ac-meta { grid-template-columns: repeat(2, 1fr); } .pp-facts { grid-template-columns: repeat(2, 1fr); } }
`;
