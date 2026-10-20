import { useCallback, useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "../../lib/api.js";
import { AdminShell } from "./AdminShell.jsx";

/* /admin/clients — Kunder: everyone Felix is working with. A card appears
   when the sheet row reaches a meeting, or when he pulls someone in from
   Sälj. Stage, next step and notes are read live from the sheet (edit them
   there); meeting time and prep live here. */
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
const CLOSED = new Set(["Won", "Lost", "Not a fit"]);

const when = (iso) => new Date(iso).toLocaleString("sv-SE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
// <input type="datetime-local"> speaks local time without a zone.
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function ClientsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback((fresh = false) =>
    authenticatedFetch(`/admin/clients${fresh ? "?fresh=1" : ""}`)
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || "failed");
      })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message)), []);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const list = data?.clients || [];
    const now = Date.now();
    const stage = (c) => c.sheet?.stage || "";
    const upcoming = list.filter((c) => c.meetingAt && Date.parse(c.meetingAt) >= now - 3600000 && !CLOSED.has(stage(c)))
      .sort((a, b) => Date.parse(a.meetingAt) - Date.parse(b.meetingAt));
    const active = list.filter((c) => !upcoming.includes(c) && !CLOSED.has(stage(c)));
    const closed = list.filter((c) => CLOSED.has(stage(c)));
    return [["Kommande möten", upcoming], ["Pågående", active], ["Avslutade", closed]];
  }, [data]);

  const open = data?.clients.find((c) => c.id === openId) || null;

  async function save(id, patch) {
    setSaving(true);
    try {
      const r = await authenticatedFetch(`/admin/clients/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      if (!r.ok) throw new Error();
      const { client } = await r.json();
      setData((d) => ({ ...d, clients: d.clients.map((c) => (c.id === id ? { ...c, ...client } : c)) }));
    } catch {
      setError("save_failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell title="Kunder">
      <style>{CLIENTS_CSS}</style>
      <div className="cl">
        <div className="cl-head">
          <div>
            <h1>Kunder</h1>
            <p className="cl-muted">Alla du jobbar med. Läget kommer från arket, förberedelsen bor här.</p>
          </div>
          {data && <a className="cl-sheet" href={data.sheetUrl} target="_blank" rel="noreferrer">Öppna arket ↗</a>}
        </div>

        {error === "not_configured" && <p className="cl-muted">Arket är inte kopplat på servern.</p>}
        {error && error !== "not_configured" && <p className="cl-muted">{error === "save_failed" ? "Kunde inte spara." : "Kunde inte hämta kunderna."}</p>}
        {!data && !error && <p className="cl-muted">Hämtar…</p>}

        {data && data.clients.length === 0 && (
          <p className="cl-empty">Inga kunder än. När en rad i arket når <b>Meeting booked</b> dyker den upp här, eller ta in någon direkt från Sälj.</p>
        )}

        {data && data.clients.length > 0 && (
          <div className="cl-grid">
            <div className="cl-list">
              {groups.map(([label, list]) => list.length > 0 && (
                <section key={label}>
                  <h2>{label} <span>{list.length}</span></h2>
                  <ul>
                    {list.map((c) => (
                      <li key={c.id}>
                        <button type="button" className={c.id === openId ? "is-on" : ""} onClick={() => setOpenId(c.id)}>
                          <b>{c.company}</b>
                          <span>{c.meetingAt ? when(c.meetingAt) : STAGE_SV[c.sheet?.stage] || "Saknas i arket"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <div className="cl-detail">
              {!open && <p className="cl-muted">Välj en kund.</p>}
              {open && (
                <ClientDetail key={open.id} client={open} saving={saving} onSave={(patch) => save(open.id, patch)} />
              )}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function ClientDetail({ client, saving, onSave }) {
  const s = client.sheet;
  const [prep, setPrep] = useState(client.prep);
  const [meeting, setMeeting] = useState(toLocalInput(client.meetingAt));

  return (
    <article>
      <div className="cl-top">
        <div>
          <h2>{client.company}</h2>
          <p className="cl-muted">
            {[client.person, client.prospectId, s?.location].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="cl-stage">{STAGE_SV[s?.stage] || "Saknas i arket"}</span>
      </div>

      {client.email && <a className="cl-mail" href={`mailto:${client.email}`}>{client.email}</a>}

      <label className="cl-field">
        <span>Möte</span>
        <input
          type="datetime-local"
          value={meeting}
          onChange={(e) => setMeeting(e.target.value)}
          onBlur={() => {
            const next = meeting ? new Date(meeting).toISOString() : null;
            if (next !== (client.meetingAt ? new Date(client.meetingAt).toISOString() : null)) onSave({ meetingAt: next });
          }}
        />
      </label>

      <label className="cl-field">
        <span>Förberedelse {saving && <em>sparar…</em>}</span>
        <textarea
          rows={12}
          value={prep}
          placeholder="Vad vet vi om dem? Vad vill de? Vad ska mötet landa i?"
          onChange={(e) => setPrep(e.target.value)}
          onBlur={() => prep !== client.prep && onSave({ prep })}
        />
      </label>

      {s && (
        <dl className="cl-facts">
          {s.why && <><dt>Varför PullUp</dt><dd>{s.why}</dd></>}
          {s.nextStep && <><dt>Nästa steg</dt><dd>{s.nextStep}{s.nextStepDate ? ` · ${s.nextStepDate}` : ""}</dd></>}
          {s.contactNote && <><dt>Kontakt</dt><dd>{s.contactNote}</dd></>}
          {s.notes && <><dt>Noteringar</dt><dd>{s.notes}</dd></>}
          {s.source && <><dt>Källa</dt><dd>{s.source}</dd></>}
          {s.dateSent && <><dt>Första mejl</dt><dd>{s.dateSent}</dd></>}
          {s.value > 0 && <><dt>Värde</dt><dd>{s.value.toLocaleString("sv-SE")} kr/mån</dd></>}
        </dl>
      )}
      <p className="cl-muted cl-foot">Steg, nästa steg och noteringar ändrar du i arket. Det här kortet ändras aldrig därifrån.</p>
    </article>
  );
}

const CLIENTS_CSS = `
  .cl { max-width: 1100px; margin: 0 auto; padding: clamp(24px, 5vw, 48px) 16px 64px; }
  .cl-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
  .cl h1 { margin: 0; font-size: clamp(28px, 5vw, 40px); font-weight: 700; letter-spacing: -0.035em; }
  .cl-muted { margin: 4px 0 0; color: #6e6e73; font-size: 14px; }
  .cl-sheet { font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 999px; background: #0a0a0a; color: #fff; text-decoration: none; }
  .cl-empty { border: 1px dashed rgba(0,0,0,0.2); border-radius: 16px; padding: 24px; color: #3a3a3e; font-size: 15px; line-height: 1.5; }
  .cl-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 28px; align-items: start; }
  @media (max-width: 760px) { .cl-grid { grid-template-columns: 1fr; } }
  .cl-list h2 { margin: 18px 0 6px; font-size: 12px; font-weight: 700; color: #6e6e73; text-transform: uppercase; letter-spacing: 0.05em; }
  .cl-list h2 span { color: #a1a1aa; margin-left: 4px; }
  .cl-list ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .cl-list button { width: 100%; text-align: left; font: inherit; border: 1px solid transparent; background: none; border-radius: 12px; padding: 10px 12px; display: grid; gap: 2px; cursor: pointer; }
  .cl-list button:hover { background: #f5f5f5; }
  .cl-list button.is-on { border-color: rgba(0,0,0,0.12); background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
  .cl-list button b { font-size: 14.5px; }
  .cl-list button span { font-size: 12.5px; color: #6e6e73; }
  .cl-detail { border: 1px solid rgba(0,0,0,0.1); border-radius: 18px; padding: clamp(16px, 3vw, 28px); min-height: 200px; }
  .cl-top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .cl-detail h2 { margin: 0; font-size: 24px; letter-spacing: -0.02em; }
  .cl-stage { font-size: 12px; font-weight: 700; padding: 5px 10px; border-radius: 999px; background: #0a0a0a; color: #fff; white-space: nowrap; }
  .cl-mail { display: inline-block; margin-top: 10px; font-size: 14px; color: #0a0a0a; text-decoration-color: #D9480F; text-underline-offset: 3px; }
  .cl-field { display: grid; gap: 6px; margin-top: 20px; }
  .cl-field > span { font-size: 12px; font-weight: 700; color: #6e6e73; text-transform: uppercase; letter-spacing: 0.05em; }
  .cl-field em { font-style: normal; text-transform: none; letter-spacing: 0; font-weight: 500; color: #D9480F; margin-left: 6px; }
  .cl-field input, .cl-field textarea { font: inherit; font-size: 15px; border: 1px solid rgba(0,0,0,0.15); border-radius: 12px; padding: 10px 12px; background: #fff; color: #0a0a0a; }
  .cl-field input { justify-self: start; }
  .cl-field textarea { resize: vertical; line-height: 1.55; }
  .cl-facts { margin: 24px 0 0; display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 8px 16px; font-size: 14px; }
  .cl-facts dt { color: #6e6e73; }
  .cl-facts dd { margin: 0; line-height: 1.5; white-space: pre-wrap; }
  @media (max-width: 520px) { .cl-facts { grid-template-columns: 1fr; } .cl-facts dd { margin-bottom: 6px; } }
  .cl-foot { margin-top: 20px; font-size: 12.5px; }
`;
