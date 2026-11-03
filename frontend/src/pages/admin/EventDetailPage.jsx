import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Copy, ExternalLink, Send } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { followBrand, useCurrentBrand, useEventBrand } from "../../lib/brand.js";
import { BrandKicker, TeamOnly } from "../../components/admin/ByBrand.jsx";
import { TeamList } from "../../components/admin/Team.jsx";
import { teamApi } from "../../lib/team.js";
import { formatEventWhen } from "../../lib/zonedTime.js";
import { AdminShell } from "./AdminShell.jsx";
import { Breakdown, Daily } from "../../components/admin/Stats.jsx";
import { STATS_CSS, fmt as num, pct } from "../../components/admin/statsFormat.js";
import { useAgentChanges, usePageContext } from "../../lib/pageContext.js";
import { CreditsLine, CreditsPaywall } from "../../components/admin/EmailCredits.jsx";
import { useEmailCredits } from "../../components/admin/useEmailCredits.js";
import { EVENT_ADMIN_CSS } from "./eventAdminCss.js";

/* /admin/events/:id — one event: fill it in and publish (your own events),
   the guest list (move between going / waitlist / cancelled, mark who came,
   export), and mail the guests. Other hosts' events from the old app are
   read-only here except for their guest list. */

const STATUS_SV = { attending: "Anmäld", waitlist: "Väntelista", cancelled: "Avbokad" };
const AUDIENCES = [
  ["attending", "Alla anmälda"],
  ["waitlist", "Väntelistan"],
  ["all", "Anmälda + väntelista"],
  ["consent", "Alla i CRM:et som sagt ja till inbjudningar"],
];
const fmt = (iso) => new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function csv(rows) {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(cell).join(",")).join("\n");
}

export function EventDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    authenticatedFetch(`/admin/events/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setData(d);
        followBrand(d?.event?.brandId);
      })
      .catch(() => setError(true));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useAgentChanges(load);
  usePageContext({ page: "admin-event", eventId: id });

  const ev = data?.event;
  return (
    <AdminShell title={ev?.title || "Event"}>
      <style>{EVENT_ADMIN_CSS + DETAIL_CSS}</style>
      <div className="ea">
        <Link to="/admin/events" className="ed-back"><ArrowLeft size={16} /> Alla event</Link>
        {error && <p className="ea-error">Kunde inte hämta eventet.</p>}
        {!data && !error && <p className="ea-muted">Hämtar…</p>}
        {ev && (
          <>
            <div className="ea-head">
              <div>
                <BrandKicker />
                <h1>{ev.title || "Utan titel"}</h1>
                <p className="ea-muted ed-when">{formatEventWhen(ev.startsAt, ev.endsAt, ev.timezone, { year: true })}{ev.location ? ` · ${ev.location}` : ""}</p>
              </div>
              <ShareLink url={ev.url} live={ev.status === "PUBLISHED"} />
            </div>
            <div className="ed-stats">
              <div><b>{ev.attending}</b><span>anmälda{ev.capacity ? ` av ${ev.capacity}` : ""}</span></div>
              <div><b>{ev.waitlist}</b><span>i kö</span></div>
              <div><b>{ev.pulledUp}</b><span>kom</span></div>
              <div><b>{data.guests.filter((g) => g.consent).length}</b><span>vill ha inbjudningar</span></div>
            </div>
            {ev.mine ? <DesignCard ev={ev} /> : <p className="ea-muted">Det här eventet skapades av {ev.host || "en annan arrangör"} i den gamla appen. Du ser gästlistan men redigerar det inte här.</p>}
            {ev.mine && <MoveBrand ev={ev} onMoved={load} />}
            <EventStats id={ev.id} />
            <Guests guests={data.guests} ev={ev} onChange={load} />
            <TeamOnly otherwise={<CohostMailNote />}><Compose ev={ev} /></TeamOnly>
            <Cohosts ev={ev} />
          </>
        )}
      </div>
    </AdminShell>
  );
}

// Which brand the event belongs to, and moving it to another of the
// account's brands (backend moveEvent). An event left on a main brand over
// other brands (made before they existed) is pointed out: its guests can't be
// mailed until it sits in one of them.
function MoveBrand({ ev, onMoved }) {
  const brand = useCurrentBrand();
  const all = brand?.all || [];
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const own = all.find((b) => b.id === ev.brandId);
  const isMain = (b) => all.some((x) => x.parentId === b.id);
  const targets = all.filter((b) => b.id !== ev.brandId && b.role !== "event" && !isMain(b) && (!own || b.role === own.role));
  if (!own || own.role === "event" || !targets.length) return null;
  const stuck = isMain(own);
  const move = async () => {
    if (!to) return;
    setBusy(true);
    setErr("");
    try {
      const res = await authenticatedFetch(`/admin/events/${ev.id}/move`, { method: "POST", body: JSON.stringify({ brandId: to }) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.message || out.error);
      setTo("");
      onMoved();
    } catch (e) {
      setErr(e.message || "Kunde inte flytta eventet.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`ed-move${stuck ? " is-stuck" : ""}`}>
      <p>
        {stuck
          ? <>Det här eventet ligger på huvudkontot <b>{own.name}</b>. Flytta det till ett av varumärkena så kan gästerna mejlas.</>
          : <>Hör till <b>{own.name}</b>.</>}
      </p>
      <select className="ea-input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Flytta till varumärke">
        <option value="">Flytta till…</option>
        {targets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <button type="button" className="ea-btn" disabled={!to || busy} onClick={move}>{busy ? "Flyttar…" : "Flytta"}</button>
      {err && <p className="ea-error">{err}</p>}
    </div>
  );
}

// How the event page is found and how it fills (backend lib/eventStats.js):
// visits and visitors, the conversion, where visits and sign-ups came from,
// new vs returning guests, day by day.
function EventStats({ id }) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    let alive = true;
    authenticatedFetch(`/admin/events/${id}/stats`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setSt(d))
      .catch(() => alive && setSt(false));
    return () => { alive = false; };
  }, [id]);
  if (!st) return null;
  const t = st.totals;
  const since = st.countedSince ? new Date(st.countedSince).toLocaleDateString("sv-SE", { day: "numeric", month: "long" }) : null;
  return (
    <section className="ed-statsec">
      <style>{STATS_CSS}</style>
      <h2>Statistik</h2>
      <div className="st-tiles">
        <div><span>Besök</span><b>{num(t.visits)}</b><small>{num(t.visitors)} besökare</small></div>
        <div><span>Konvertering</span><b>{pct(t.conversion)}</b><small>besökare som anmälde sig</small></div>
        <div><span>Återkommande</span><b>{num(st.returning)}</b><small>{t.signups ? `${Math.round((st.returning / t.signups) * 100)} % av anmälda` : "har varit på ert event förut"}</small></div>
        <div><span>Nya gäster</span><b>{num(Math.max(0, t.signups - st.returning))}</b><small>första gången hos er</small></div>
        <div><span>Mobil</span><b>{t.visits ? `${Math.round(((st.devices.find((d) => d.key === "mobile")?.n || 0) / t.visits) * 100)} %` : "–"}</b><small>av besöken</small></div>
      </div>
      <Daily daily={st.daily} />
      <div className="st-grid">
        <Breakdown title="Var besöken kom ifrån" rows={st.sources} empty="Inga besök räknade än." note={since ? `Besök räknas sedan ${since}.` : "Besök räknas från och med nu. Dela länken så syns de här."} />
        <Breakdown title="Var anmälningarna kom ifrån" rows={st.signupSources} empty="Inga anmälningar än." note="Okänd = anmäld innan besök räknades, eller via en AI-assistent." />
      </div>
    </section>
  );
}

// The people who help with this one event (backend lib/teams.js). The
// brand's team invites and removes; a co-host can step down.
function Cohosts({ ev }) {
  const brand = useCurrentBrand();
  const [team, setTeam] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => { teamApi.event(ev.id).then(setTeam).catch(() => setTeam(null)); }, [ev.id]);
  useEffect(() => { load(); }, [load]);
  if (!team || (!team.canManage && !team.cohosts.length)) return null;

  const remove = async (c) => {
    if (!window.confirm(c.you ? `Kliva av som medarrangör på ${ev.title}?` : `Ta bort ${c.email} som medarrangör?`)) return;
    try {
      await teamApi.removeCohost(ev.id, c.userId);
      if (c.you) window.location.assign("/admin/events");
      else load();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <section>
      <h2>Medarrangörer</h2>
      <p className="ea-muted ed-cohost-lead">
        En medarrangör redigerar det här eventet och sköter gästlistan, men ser inget annat{brand?.name ? ` hos ${brand.name}` : ""}.
        {brand?.role !== "event" && <> Teamet har redan tillgång till alla event, det bjuder du in under <Link to="/admin/team">Team</Link>.</>}
      </p>
      <TeamList
        people={team.cohosts.map((c) => ({ key: c.userId, email: c.email, role: "Medarrangör", you: c.you, onRemove: team.canManage || c.you ? () => remove(c) : null }))}
        invites={team.invites}
        canManage={team.canManage}
        inviteLabel="Bjud in medarrangör"
        onInvite={async (email) => { const out = await teamApi.inviteToEvent(ev.id, email); load(); return out; }}
        onCancel={async (id) => { await teamApi.cancel(id).catch(() => {}); load(); }}
      />
      {error && <p className="ea-error">{error}</p>}
    </section>
  );
}

function CohostMailNote() {
  const brand = useCurrentBrand();
  return (
    <section>
      <h2>Mejla</h2>
      <p className="ea-muted">Utskick till gästerna görs av teamet för {brand?.name || "varumärket"}. Be dem skicka.</p>
    </section>
  );
}

function ShareLink({ url, live }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ed-share">
      <a className="ea-btn" href={url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> {live ? "Öppna sidan" : "Förhandsvisa"}</a>
      <button type="button" className="ea-btn" onClick={() => navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
        <Copy size={15} /> {copied ? "Kopierad" : "Kopiera länk"}
      </button>
    </div>
  );
}

// The page itself is designed in the editor (/admin/events/:id/edit).
function DesignCard({ ev }) {
  const live = ev.status === "PUBLISHED";
  return (
    <section className="ed-design">
      <Link to={`/admin/events/${ev.id}/edit`} className="ed-design-img">
        {ev.imageUrl ? <img src={ev.imageUrl} alt="" /> : <span>Inget omslag än</span>}
      </Link>
      <div className="ed-design-body">
        <span className={`ea-chip ${live ? "is-live" : "is-draft"}`}>{live ? "Publicerad" : "Utkast"}</span>
        <p className="ea-muted">Omslag, bild, karusell eller video, innehållet och anmälan designar du i editorn, med sidan live bredvid.</p>
        <Link to={`/admin/events/${ev.id}/edit`} className="ea-btn is-dark">Designa sidan</Link>
      </div>
    </section>
  );
}

function Guests({ guests, ev, onChange }) {
  const [filter, setFilter] = useState("active");
  const shown = guests.filter((g) => (filter === "active" ? g.status !== "cancelled" : filter === "came" ? g.pulledUp : g.status === filter));
  const patch = async (g, body) => {
    await authenticatedFetch(`/admin/rsvps/${g.rsvpId}`, { method: "PATCH", body: JSON.stringify(body) });
    onChange();
  };
  // The sign-up's own fields, as columns: only what this event asks (or
  // what someone answered before a question was removed).
  const form = ev.form || { phone: "off", instagram: "off", plusOnes: 0, questions: [] };
  const hasPhone = form.phone !== "off" || guests.some((g) => g.phone);
  const hasIg = form.instagram !== "off" || guests.some((g) => g.instagram);
  const hasPlus = form.plusOnes > 0 || guests.some((g) => g.plusOnes);
  const qs = form.questions || [];
  const answer = (g, q) => { const v = g.answers?.[q.id]; return v === true ? "Ja" : v || ""; };
  const exportCsv = () => {
    const head = ["Namn", "E-post", ...(hasPhone ? ["Telefon"] : []), ...(hasIg ? ["Instagram"] : []), ...(hasPlus ? ["Tar med", "Antal totalt"] : []), ...qs.map((q) => q.label), "Status", "Kom", "Anmäld", "Vill ha inbjudningar"];
    const rows = [head, ...guests.map((g) => [
      g.name, g.email,
      ...(hasPhone ? [g.phone] : []), ...(hasIg ? [g.instagram ? `@${g.instagram}` : ""] : []),
      ...(hasPlus ? [g.plusOnes || 0, g.party || 1] : []),
      ...qs.map((q) => answer(g, q)),
      STATUS_SV[g.status] || g.status, g.pulledUp ? "ja" : "", g.signedUpAt?.slice(0, 16).replace("T", " "), g.consent ? "ja" : "",
    ])];
    const blob = new Blob(["﻿" + csv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${ev.slug}-gaster.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const count = (k) => guests.filter((g) => (k === "active" ? g.status !== "cancelled" : k === "came" ? g.pulledUp : g.status === k)).length;
  return (
    <section>
      <div className="ed-sec-head">
        <h2>Gäster</h2>
        <button type="button" className="ea-btn" onClick={exportCsv} disabled={!guests.length}>Exportera CSV</button>
      </div>
      <div className="ea-tabs">
        {[["active", "Alla"], ["attending", "Anmälda"], ["waitlist", "Väntelista"], ["came", "Kom"], ["cancelled", "Avbokade"]].map(([k, l]) => (
          <button key={k} type="button" className={filter === k ? "is-on" : ""} onClick={() => setFilter(k)}>{l} <small>{count(k)}</small></button>
        ))}
      </div>
      {shown.length ? (
        <div className="ea-wrap">
          <table className="ea-table">
            <thead><tr><th>Namn</th><th>E-post</th>{hasPhone && <th>Telefon</th>}{hasIg && <th>Instagram</th>}{hasPlus && <th className="num" title="Gäster de tar med">+</th>}{qs.map((q) => <th key={q.id} className="ed-qcol" title={q.label}>{q.label}</th>)}<th>Status</th><th>Kom</th><th>Anmäld</th><th title="Vill ha inbjudningar">Inbj.</th></tr></thead>
            <tbody>
              {shown.map((g) => (
                <tr key={g.rsvpId}>
                  <td>{g.name || "–"}</td>
                  <td>{g.email}</td>
                  {hasPhone && <td className="ea-nowrap">{g.phone ? <a href={`tel:${g.phone}`}>{g.phone}</a> : "–"}</td>}
                  {hasIg && <td>{g.instagram ? <a href={`https://instagram.com/${g.instagram}`} target="_blank" rel="noopener noreferrer">@{g.instagram}</a> : "–"}</td>}
                  {hasPlus && <td className="num">{g.plusOnes ? `+${g.plusOnes}` : "–"}</td>}
                  {qs.map((q) => <td key={q.id} className="ed-qcol" title={answer(g, q)}>{answer(g, q) || "–"}</td>)}
                  <td>
                    <select className="ed-status" value={g.status} onChange={(e) => patch(g, { status: e.target.value })}>
                      {Object.entries(STATUS_SV).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td><input type="checkbox" checked={g.pulledUp} onChange={(e) => patch(g, { pulledUp: e.target.checked })} aria-label="Kom" /></td>
                  <td className="ea-muted">{g.signedUpAt ? fmt(g.signedUpAt) : "–"}</td>
                  <td><i className={`ea-dot${g.consent ? " is-on" : ""}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="ea-muted">Inga gäster här än.</p>
      )}
    </section>
  );
}

function Compose({ ev }) {
  const brand = useEventBrand(ev.brandId);
  const [audience, setAudience] = useState("attending");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const credits = useEmailCredits();

  useEffect(() => {
    if (credits.paid) setNote({ ok: true, text: `Köpet är klart. Du har ${credits.paid.balance.toLocaleString("sv-SE")} utskick.` });
  }, [credits.paid]);

  const aud = audience === "consent"
    ? { type: "consent" }
    : { type: "event", eventId: ev.id, ...(audience === "all" ? {} : { status: audience }) };

  useEffect(() => {
    let alive = true;
    setCount(null);
    authenticatedFetch("/admin/sends/preview", { method: "POST", body: JSON.stringify({ audience: aud }) })
      .then((r) => r.json())
      .then((d) => alive && setCount(d.count ?? 0))
      .catch(() => alive && setCount(0));
    return () => { alive = false; };
  }, [audience, ev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (test) => {
    setBusy(true);
    setNote(null);
    try {
      const res = await authenticatedFetch("/admin/sends", { method: "POST", body: JSON.stringify({ audience: aud, subject, body, eventId: ev.id, test }) });
      const out = await res.json();
      if (res.status === 402) {
        credits.setBalance(out.balance);
        setPaywall(true);
        return;
      }
      if (!res.ok) throw new Error(out.error);
      if (out.balance != null) credits.setBalance(out.balance);
      setNote({ ok: true, text: test ? `Testmejlet skickat till ${out.to}.` : `Skickas nu till ${out.queued} personer.` });
      if (!test) { setSubject(""); setBody(""); }
    } catch {
      setNote({ ok: false, text: "Kunde inte skicka." });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  const ready = subject.trim() && body.trim();
  return (
    <section className="ed-compose">
      <div className="ed-sec-head">
        <h2>Mejla</h2>
        <Link className="ea-btn is-dark" to={`/admin/mail?event=${ev.id}`}>Designa mejl med mallar</Link>
      </div>
      <p className="ea-muted">Ett snabbt meddelande här, eller ett designat mejl med block i mejlmodulen. Båda får en avregistreringslänk, och den som avregistrerat sig får dem aldrig.</p>
      <label className="ea-field">Till
        <select value={audience} onChange={(e) => setAudience(e.target.value)}>
          {AUDIENCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <p className="ed-count">{count == null ? "Räknar…" : `${count} mottagare`}</p>
      <label className="ea-field">Ämne<input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ses på lördag" /></label>
      <label className="ea-field">Meddelande<textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder={"Hej!\n\nTomma rader blir nya stycken. Länkar blir klickbara."} /></label>
      <div className="ed-actions">
        <button type="button" className="ea-btn" disabled={busy || !ready} onClick={() => send(true)}>Skicka test till mig</button>
        <button type="button" className="ea-btn is-dark" disabled={busy || !ready || !count} onClick={() => (credits.balance != null && count > credits.balance ? setPaywall(true) : setConfirm(true))}><Send size={15} /> Skicka till {count ?? "…"}</button>
      </div>
      <CreditsLine balance={credits.balance} needed={count} onBuy={() => setPaywall(true)} />
      {note && <p className={note.ok ? "ea-ok" : "ea-error"}>{note.text}</p>}
      <CreditsPaywall open={paywall} needed={count} balance={credits.balance} packs={credits.packs} onBuy={credits.buy} onClose={() => setPaywall(false)} />
      {confirm && (
        <div className="ea-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setConfirm(false)}>
          <div className="ea-modal">
            <h2>Skicka till {count} personer?</h2>
            <p className="ea-muted" style={{ margin: 0 }}>{brand ? <>Skickas som <b>{brand.name}</b>. </> : null}”{subject}” går ut direkt och går inte att ångra.</p>
            <div className="ea-modal-actions">
              <button type="button" className="ea-btn" onClick={() => setConfirm(false)}>Avbryt</button>
              <button type="button" className="ea-btn is-dark" disabled={busy} onClick={() => send(false)}>{busy ? "Skickar…" : "Skicka"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const DETAIL_CSS = `
  .ed-back { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 600; color: #6e6e73; text-decoration: none; margin-bottom: 14px; }
  .ed-back:hover { color: #0a0a0a; }
  .ed-when::first-letter { text-transform: uppercase; }
  .ed-share { display: flex; gap: 8px; flex-wrap: wrap; }
  .ed-statsec { margin: 30px 0 28px; }
  .ed-qcol { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ea-nowrap { white-space: nowrap; }
  .ed-move { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; margin: 14px 0 0; padding: 10px 12px; border-radius: 12px; background: #f6f5f2; font-size: 13.5px; }
  .ed-move p { flex: 1 1 260px; margin: 0; color: #3a3a3c; }
  .ed-move select { width: auto; min-width: 160px; padding: 7px 10px; font-size: 13.5px; }
  .ed-move .ea-btn { padding: 7px 14px; }
  .ed-move .ea-error { flex-basis: 100%; margin: 0; }
  .ed-move.is-stuck { background: #fdeef6; border: 1px solid rgba(236,23,143,0.35); }
  .ed-statsec > h2 { margin: 0 0 12px; }
  .ed-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 0 0 24px; }
  .ed-stats > div { border: 1px solid rgba(0,0,0,0.1); border-radius: 14px; padding: 12px 14px; display: grid; gap: 2px; }
  .ed-stats b { font-size: 24px; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .ed-stats span { font-size: 12.5px; color: #6e6e73; }
  @media (max-width: 620px) { .ed-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .ed-design { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 18px; align-items: center; padding: 14px; border: 1px solid rgba(0,0,0,0.1); border-radius: 16px; }
  @media (max-width: 620px) { .ed-design { grid-template-columns: 1fr; } }
  .ed-design-img { display: grid; place-items: center; aspect-ratio: 4 / 3; border-radius: 12px; overflow: hidden; background: #05040a; color: rgba(255,255,255,0.6); font-size: 13px; text-decoration: none; }
  .ed-design-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ed-design-body { display: grid; gap: 10px; justify-items: start; }
  .ed-design-body .ea-muted { margin: 0; }
  .ed-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .ed-sec-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .ed-sec-head h2 { margin-bottom: 10px; }
  .ed-status { font: inherit; font-size: 13px; padding: 4px 6px; border: 1px solid rgba(0,0,0,0.14); border-radius: 8px; background: #fff; }
  .ed-compose { display: grid; gap: 12px; max-width: 640px; }
  .ed-compose h2 { margin-bottom: 0; }
  .ed-compose .ea-muted { margin: 0; }
  .ed-count { margin: -4px 0 0; font-size: 13px; font-weight: 600; color: #0a0a0a; }
  .ed-cohost-lead { margin: 0 0 14px; max-width: 640px; line-height: 1.5; }
  .ed-cohost-lead a { color: #0a0a0a; font-weight: 600; }
`;
