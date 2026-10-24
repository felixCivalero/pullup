import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Copy, ExternalLink, ImagePlus, Send } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { supabase } from "../../lib/supabase.js";
import { fromZonedInput, toZonedInput, formatEventWhen } from "../../lib/zonedTime.js";
import { AdminShell } from "./AdminShell.jsx";
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
      .then(setData)
      .catch(() => setError(true));
  }, [id]);
  useEffect(() => { load(); }, [load]);

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
            {ev.mine ? <EditEvent ev={ev} onSaved={load} /> : <p className="ea-muted">Det här eventet skapades av {ev.host || "en annan arrangör"} i den gamla appen. Du ser gästlistan men redigerar det inte här.</p>}
            <Guests guests={data.guests} ev={ev} onChange={load} />
            <Compose ev={ev} />
          </>
        )}
      </div>
    </AdminShell>
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

function EditEvent({ ev, onSaved }) {
  const [f, setF] = useState(() => ({
    title: ev.title || "",
    start: toZonedInput(ev.startsAt, ev.timezone),
    end: toZonedInput(ev.endsAt, ev.timezone),
    location: ev.location || "",
    text: ev.text || "",
    capacity: ev.capacity || "",
    imagePath: ev.imagePath,
    imageUrl: ev.imageUrl,
  }));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async (status) => {
    setBusy(true);
    setNote(null);
    try {
      const body = {
        title: f.title,
        startsAt: fromZonedInput(f.start, ev.timezone),
        endsAt: f.end ? fromZonedInput(f.end, ev.timezone) : null,
        location: f.location,
        text: f.text,
        capacity: f.capacity === "" ? null : Number(f.capacity),
        imagePath: f.imagePath || null,
        ...(status ? { status } : {}),
      };
      const res = await authenticatedFetch(`/admin/events/${ev.id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      setNote({ ok: true, text: status === "PUBLISHED" ? "Publicerat. Länken fungerar nu." : status === "DRAFT" ? "Avpublicerat." : "Sparat." });
      onSaved();
    } catch {
      setNote({ ok: false, text: "Kunde inte spara." });
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await authenticatedFetch("/admin/events/upload-url", { method: "POST", body: JSON.stringify({ mimeType: file.type }) });
      if (!res.ok) throw new Error();
      const tok = await res.json();
      const { error } = await supabase.storage.from(tok.bucket).uploadToSignedUrl(tok.path, tok.token, file);
      if (error) throw error;
      setF((x) => ({ ...x, imagePath: tok.path, imageUrl: tok.publicUrl }));
      setNote({ ok: true, text: "Bilden är uppladdad. Spara för att använda den." });
    } catch {
      setNote({ ok: false, text: "Kunde inte ladda upp bilden." });
    } finally {
      setUploading(false);
    }
  };

  const live = ev.status === "PUBLISHED";
  return (
    <section className="ed-edit">
      <button type="button" className="ed-img" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {f.imageUrl ? <img src={f.imageUrl} alt="" /> : <span><ImagePlus size={22} /> Lägg till omslagsbild</span>}
        {uploading && <i>Laddar upp…</i>}
      </button>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
      <div className="ed-form">
        <label className="ea-field">Namn<input value={f.title} onChange={set("title")} /></label>
        <div className="ea-row">
          <label className="ea-field">Startar<input type="datetime-local" value={f.start} onChange={set("start")} /></label>
          <label className="ea-field">Slutar (valfritt)<input type="datetime-local" value={f.end} onChange={set("end")} /></label>
        </div>
        <div className="ea-row">
          <label className="ea-field">Plats<input value={f.location} onChange={set("location")} placeholder="Adress eller ställe" /></label>
          <label className="ea-field">Max antal (valfritt)<input type="number" min="1" value={f.capacity} onChange={set("capacity")} placeholder="Obegränsat" /></label>
        </div>
        <label className="ea-field">Beskrivning<textarea rows={6} value={f.text} onChange={set("text")} placeholder="Vad händer, vem är det för, vad ska man ta med?" /></label>
        <div className="ed-actions">
          <span className={`ea-chip ${live ? "is-live" : "is-draft"}`}>{live ? "Publicerad" : "Utkast"}</span>
          <button type="button" className="ea-btn" disabled={busy} onClick={() => save()}>Spara</button>
          {live
            ? <button type="button" className="ea-btn" disabled={busy} onClick={() => save("DRAFT")}>Avpublicera</button>
            : <button type="button" className="ea-btn is-green" disabled={busy || !f.title || !f.start} onClick={() => save("PUBLISHED")}>Spara och publicera</button>}
        </div>
        {note && <p className={note.ok ? "ea-ok" : "ea-error"}>{note.text}</p>}
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
  const exportCsv = () => {
    const rows = [["Namn", "E-post", "Status", "Kom", "Anmäld", "Vill ha inbjudningar"], ...guests.map((g) => [g.name, g.email, STATUS_SV[g.status] || g.status, g.pulledUp ? "ja" : "", g.signedUpAt?.slice(0, 16).replace("T", " "), g.consent ? "ja" : ""])];
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
            <thead><tr><th>Namn</th><th>E-post</th><th>Status</th><th>Kom</th><th>Anmäld</th><th title="Vill ha inbjudningar">Inbj.</th></tr></thead>
            <tbody>
              {shown.map((g) => (
                <tr key={g.rsvpId}>
                  <td>{g.name || "–"}</td>
                  <td>{g.email}</td>
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
  const [audience, setAudience] = useState("attending");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [confirm, setConfirm] = useState(false);

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
      if (!res.ok) throw new Error(out.error);
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
      <h2>Mejla</h2>
      <p className="ea-muted">Mejlet får eventets ruta med länk, och en avregistreringslänk. Den som avregistrerat sig får det aldrig.</p>
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
        <button type="button" className="ea-btn is-dark" disabled={busy || !ready || !count} onClick={() => setConfirm(true)}><Send size={15} /> Skicka till {count ?? "…"}</button>
      </div>
      {note && <p className={note.ok ? "ea-ok" : "ea-error"}>{note.text}</p>}
      {confirm && (
        <div className="ea-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setConfirm(false)}>
          <div className="ea-modal">
            <h2>Skicka till {count} personer?</h2>
            <p className="ea-muted" style={{ margin: 0 }}>”{subject}” går ut direkt och går inte att ångra.</p>
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
  .ed-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 0 0 24px; }
  .ed-stats > div { border: 1px solid rgba(0,0,0,0.1); border-radius: 14px; padding: 12px 14px; display: grid; gap: 2px; }
  .ed-stats b { font-size: 24px; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .ed-stats span { font-size: 12.5px; color: #6e6e73; }
  @media (max-width: 620px) { .ed-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .ed-edit { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 20px; align-items: start; }
  @media (max-width: 760px) { .ed-edit { grid-template-columns: 1fr; } }
  .ed-img { position: relative; font: inherit; width: 100%; aspect-ratio: 4 / 3; border: 1px dashed rgba(0,0,0,0.2); border-radius: 16px; background: #fafafa; overflow: hidden; cursor: pointer; padding: 0; color: #6e6e73; }
  .ed-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ed-img span { display: grid; justify-items: center; gap: 6px; font-size: 13.5px; font-weight: 600; }
  .ed-img i { position: absolute; inset: auto 0 0 0; padding: 6px; background: rgba(0,0,0,0.55); color: #fff; font-style: normal; font-size: 12.5px; }
  .ed-form { display: grid; gap: 12px; }
  .ed-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .ed-sec-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .ed-sec-head h2 { margin-bottom: 10px; }
  .ed-status { font: inherit; font-size: 13px; padding: 4px 6px; border: 1px solid rgba(0,0,0,0.14); border-radius: 8px; background: #fff; }
  .ed-compose { display: grid; gap: 12px; max-width: 640px; }
  .ed-compose h2 { margin-bottom: 0; }
  .ed-compose .ea-muted { margin: 0; }
  .ed-count { margin: -4px 0 0; font-size: 13px; font-weight: 600; color: #0a0a0a; }
`;
