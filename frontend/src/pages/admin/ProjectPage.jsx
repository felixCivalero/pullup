import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, Upload, Plus, Check, CloudOff, CalendarPlus, FileText, ChevronDown, X } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { useSession } from "../../lib/owner.js";
import { colors } from "../../theme/colors.js";
import { PlannerCanvas } from "../../components/planner/PlannerCanvas.jsx";
import { layoutKey } from "../../lib/plannerStore.js";
import { ProjectBoard } from "../../components/project/ProjectBoard.jsx";
import { ProjectBrief } from "../../components/project/ProjectBrief.jsx";
import { AdminShell } from "./AdminShell.jsx";
import { pitchFor } from "./pitch/index.js";
import { ProjectPitch } from "./pitch/ProjectPitch.jsx";

/* /admin/projects — one project per brand (a row in the sales sheet: Won
   rows get one by themselves, any other row via "Nytt projekt"), picked at
   the top (?kund=P-666), in the order the work flows (?vy=):
     pitch      the brand's pitch, the ground everything stands on (linked,
                the same one as under Pitch)
     strategi   the strategy document: grundbultar + content buckets
     board      free-form, for developing formats in meetings
     tidslinje  the content timeline: cards pinned to dates, event marks
   A content bucket is a format: the same name on the board's format frames
   and on the timeline's cards. The strategy shows each bucket's count and
   opens it on the timeline or board (?format= focuses it); renaming a bucket
   or frame renames the format on its cards. Meeting notes live in the
   client's Google Doc, linked from the bar. */

// The canvas works in local dates; the API stores 'YYYY-MM-DD'. Noon keeps a
// date on the same day in every timezone.
const toCanvas = (e) => ({ ...e, startsAt: `${e.startsAt}T12:00:00` });
const toApi = (patch) => (patch.startsAt ? { ...patch, startsAt: patch.startsAt.slice(0, 10) } : patch);
const dayLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

const VIEWS = [["pitch", "Pitch"], ["strategi", "Strategi"], ["board", "Board"], ["tidslinje", "Tidslinje"]];

export function ProjectPage() {
  return (
    <AdminShell title="Projekt" fill>
      <Projects />
    </AdminShell>
  );
}

function Projects() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    authenticatedFetch("/admin/clients")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) return <Empty>Kunde inte hämta kunderna.</Empty>;
  if (!data) return null;

  const clients = [...data.clients].sort((a, b) => (a.stage === "Won" ? 0 : 1) - (b.stage === "Won" ? 0 : 1));
  const current = clients.find((c) => c.prospectId === params.get("kund")) || clients[0] || null;
  const view = VIEWS.some(([v]) => v === params.get("vy")) ? params.get("vy") : "strategi";
  const go = (next) => setParams(Object.fromEntries(Object.entries({ kund: current?.prospectId, vy: view, ...next }).filter(([, v]) => v)), { replace: true });
  const pick = (key) => setParams({ kund: key, vy: view }, { replace: true });
  const updateClient = (client) => setData((d) => ({ ...d, clients: d.clients.map((c) => (c.id === client.id ? { ...c, ...client } : c)) }));
  const addClient = (client) => {
    setData((d) => ({ ...d, clients: [...d.clients.filter((c) => c.id !== client.id), client] }));
    setParams({ kund: client.prospectId, vy: "strategi" }, { replace: true });
  };

  if (!current) {
    return (
      <Empty>
        Inga projekt än. Starta ett för en rad i säljarket:
        <span style={{ display: "block", marginTop: 14, textAlign: "left" }}><NewProject onCreated={addClient} /></span>
      </Empty>
    );
  }

  return (
    <>
      <Project key={current.id} client={current} view={view} focusFormat={params.get("format")} go={go} />
      <ProjectBar key={`bar-${current.id}`} clients={clients} current={current} view={view} onView={(vy) => go({ vy, format: null })} onPick={pick} onUpdate={updateClient} onCreated={addClient} />
    </>
  );
}

// One client's project: the format list and counts that tie the strategy's
// buckets, the board and the timeline together, and whichever view is open.
function Project({ client, view, focusFormat, go }) {
  const [boardFormats, setBoardFormats] = useState([]);
  const [bucketNames, setBucketNames] = useState([]);
  const [cards, setCards] = useState([]);

  // The strategy's content buckets: formats too.
  useEffect(() => {
    authenticatedFetch(`/admin/projects/${client.id}/brief`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setBucketNames((d.doc?.blocks || []).filter((b) => b.type === "bucket").map((b) => String(b.title || "").trim()).filter(Boolean)))
      .catch(() => {});
  }, [client.id]);

  // Formats named on the board, for the timeline's format picker.
  useEffect(() => {
    authenticatedFetch(`/admin/projects/${client.id}/board`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setBoardFormats((d.doc?.items || []).filter((i) => i.type === "frame").map((i) => String(i.title || "").trim()).filter(Boolean)))
      .catch(() => {});
  }, [client.id]);

  // The timeline's cards, for the counts on the board's format frames.
  const loadCards = useCallback(() => {
    authenticatedFetch(`/admin/planner/cards?client=${client.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCards(d.cards || []))
      .catch(() => {});
  }, [client.id]);
  useEffect(() => { if (view === "board" || view === "strategi" || focusFormat) loadCards(); }, [view, focusFormat, loadCards]);
  const formats = [...new Set([...bucketNames, ...boardFormats])];

  const formatCounts = {};
  for (const c of cards) {
    const f = String(c.meta?.format || "").trim();
    if (f) formatCounts[f] = (formatCounts[f] || 0) + 1;
  }

  // Renaming a frame renames the format on its timeline cards.
  const renameFormat = useCallback(async (from, to) => {
    const r = await authenticatedFetch(`/admin/planner/cards?client=${client.id}`).catch(() => null);
    const list = r?.ok ? (await r.json()).cards || [] : [];
    await Promise.all(list.filter((c) => String(c.meta?.format || "").trim() === from).map((c) =>
      authenticatedFetch(`/admin/planner/cards/${c.id}`, { method: "PATCH", body: JSON.stringify({ meta: { ...c.meta, format: to } }) }).catch(() => null)));
    loadCards();
  }, [client.id, loadCards]);

  if (view === "board") {
    return (
      <ProjectBoard
        clientId={client.id}
        formatCounts={formatCounts}
        focusFormat={focusFormat}
        onOpenFormat={(format) => go({ vy: "tidslinje", format })}
        onRenameFormat={renameFormat}
        onFramesChange={setBoardFormats}
      />
    );
  }
  if (view === "pitch") return <ProjectPitch entry={pitchFor(client.prospectId)} projectName={client.company} />;
  if (view === "strategi") {
    return (
      <ProjectBrief
        clientId={client.id}
        projectName={client.company}
        pitch={pitchFor(client.prospectId)}
        formatCounts={formatCounts}
        onOpenFormat={(vy, format) => go({ vy, format })}
        onRenameBucket={renameFormat}
        onBucketsChange={(names) => setBucketNames(names.map((n) => String(n).trim()).filter(Boolean))}
      />
    );
  }
  return (
    <ClientCanvas
      clientId={client.id}
      boardFormats={formats}
      focusFormat={focusFormat}
      focusCount={formatCounts[focusFormat] || 0}
      onClearFocus={() => go({ format: null })}
      onOpenFormat={(format) => go({ vy: "board", format })}
    />
  );
}

function ClientCanvas({ clientId, boardFormats, focusFormat, focusCount, onClearFocus, onOpenFormat }) {
  const session = useSession();
  const storageKey = session?.user?.id ? `${layoutKey(session.user.id)}:${clientId}` : null;
  const scope = `?client=${clientId}`;
  const [events, setEvents] = useState([]);
  const [saveStatus, setSaveStatus] = useState("saved");
  const canvasRef = useRef(null);

  useEffect(() => {
    let alive = true;
    authenticatedFetch(`/admin/planner/events${scope}`)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => alive && setEvents((d.events || []).map(toCanvas)))
      .catch(() => {});
    return () => { alive = false; };
  }, [scope]);

  // Event writes are optimistic; a failed write shows in the save status.
  const write = useCallback(async (path, init) => {
    setSaveStatus("saving");
    try {
      const res = await authenticatedFetch(path, init);
      if (!res.ok) throw new Error(String(res.status));
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, []);

  const onEventCreate = useCallback((ev) => {
    setEvents((p) => [...p, ev]);
    write(`/admin/planner/events${scope}`, { method: "POST", body: JSON.stringify(toApi(ev)) });
  }, [write, scope]);

  const onEventChange = useCallback((id, patch) => {
    setEvents((p) => p.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    write(`/admin/planner/events/${id}`, { method: "PATCH", body: JSON.stringify(toApi(patch)) });
  }, [write]);

  const onEventDelete = useCallback((id) => {
    setEvents((p) => p.filter((e) => e.id !== id));
    write(`/admin/planner/events/${id}`, { method: "DELETE" });
  }, [write]);

  if (!storageKey) return null;

  return (
    <div style={{ position: "absolute", inset: 0, background: colors.background, overflow: "hidden" }}>
      <PlannerCanvas
        ref={canvasRef}
        storageKey={storageKey}
        clientId={clientId}
        extraFormats={boardFormats}
        focusFormat={focusFormat}
        onOpenFormat={onOpenFormat}
        events={events}
        onSaveStatus={setSaveStatus}
        onEventCreate={onEventCreate}
        onEventChange={onEventChange}
        onEventDelete={onEventDelete}
      />

      <div
        style={{
          position: "absolute",
          bottom: 22,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 8,
          padding: 8,
          borderRadius: 14,
          background: colors.background,
          border: `1px solid ${colors.border}`,
          boxShadow: "0 10px 30px rgba(10,10,10,0.08)",
          maxWidth: "calc(100vw - 24px)",
          overflowX: "auto",
        }}
      >
        <SaveStatus status={saveStatus} />
        <Divider />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", fontSize: 13, fontWeight: 500, color: colors.textSubtle, whiteSpace: "nowrap" }}>
          <Upload size={15} />
          Drop content anywhere
        </span>
        <Divider />
        <ToolButton onClick={() => canvasRef.current?.addPlaceholder()} icon={<Plus size={16} />} label="Add placeholder" />
        <ToolButton onClick={() => canvasRef.current?.addEvent()} icon={<CalendarPlus size={16} />} label="Add event" />
      </div>
      {focusFormat && (
        <div style={{ position: "absolute", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 25, display: "inline-flex", alignItems: "center", gap: 10, padding: "7px 8px 7px 14px", borderRadius: 999, background: "#0a0a0a", color: "#fff", fontSize: 13, fontWeight: 600, boxShadow: "0 10px 30px rgba(10,10,10,0.18)", whiteSpace: "nowrap" }}>
          {focusCount ? `${focusCount} kort i formatet ${focusFormat}` : `Inga kort i formatet ${focusFormat} än`}
          <button type="button" onClick={() => onOpenFormat(focusFormat)} style={{ font: "inherit", fontSize: 12.5, padding: "4px 10px", borderRadius: 999, border: 0, background: "rgba(255,255,255,0.16)", color: "#fff", cursor: "pointer" }}>Till boarden</button>
          <button type="button" onClick={onClearFocus} aria-label="Visa allt" style={{ display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 999, border: 0, background: "none", color: "#fff", cursor: "pointer" }}><X size={15} /></button>
        </div>
      )}
      <style>{`@keyframes crm-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24, background: colors.background }}>
      <div style={{ maxWidth: 420, textAlign: "center", fontSize: 15, lineHeight: 1.5, color: colors.textSubtle, margin: 0 }}>{children}</div>
    </div>
  );
}

// Top of the project: whose it is (a dropdown of clients), the views, their
// meetings doc, and the next step from the sheet. Keyed by client.
function ProjectBar({ clients, current, view, onView, onPick, onUpdate, onCreated }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(current.company || "");
  const [url, setUrl] = useState(current.docUrl || "");
  const [saving, setSaving] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => {
    if (!menu) return undefined;
    const onDown = (e) => { if (!pickerRef.current?.contains(e.target)) setMenu(false); };
    const onKey = (e) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const saveDoc = async (e) => {
    e.preventDefault();
    setSaving(true);
    const r = await authenticatedFetch(`/admin/clients/${current.id}`, { method: "PATCH", body: JSON.stringify({ docUrl: url.trim() }) }).catch(() => null);
    if (r?.ok) {
      onUpdate((await r.json()).client);
      setEditing(false);
    }
    setSaving(false);
  };

  // The project's name (the sheet keeps its own company name).
  const saveName = async (e) => {
    e.preventDefault();
    const next = name.trim();
    if (!next || next === current.company) { setRenaming(false); return; }
    setSaving(true);
    const r = await authenticatedFetch(`/admin/clients/${current.id}`, { method: "PATCH", body: JSON.stringify({ company: next }) }).catch(() => null);
    if (r?.ok) {
      onUpdate((await r.json()).client);
      setRenaming(false);
    }
    setSaving(false);
  };

  return (
    <div className="tl-bar">
      <style>{BAR_CSS}</style>
      <div className="tl-picker" ref={pickerRef}>
        <button type="button" className="tl-current" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
          <span>{current.company}</span>
          <ChevronDown size={16} />
        </button>
        {menu && (
          <ul className="tl-menu">
            {clients.map((c) => (
              <li key={c.id}>
                <button type="button" className={c.id === current.id ? "is-on" : undefined} onClick={() => { setMenu(false); onPick(c.prospectId); }}>
                  <b>{c.company}</b>
                  {c.stage !== "Won" && <span>{c.stage || "saknas i arket"}</span>}
                  {c.id === current.id && <Check size={14} />}
                </button>
              </li>
            ))}
            <li className="tl-new"><NewProject onCreated={(c) => { setMenu(false); onCreated(c); }} /></li>
          </ul>
        )}
      </div>
      <div className="tl-views" role="tablist">
        {VIEWS.map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={v === view} className={v === view ? "is-on" : undefined} onClick={() => onView(v)}>{label}</button>
        ))}
      </div>
      <div className="tl-meta">
        {renaming && (
          <form onSubmit={saveName}>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Projektets namn" />
            <button type="submit" disabled={saving}>{saving ? "Sparar…" : "Spara"}</button>
            <button type="button" className="tl-link" onClick={() => setRenaming(false)}>Avbryt</button>
          </form>
        )}
        {!editing && !renaming && (
          <button type="button" className="tl-link" onClick={() => { setName(current.company || ""); setRenaming(true); }}>Döp om</button>
        )}
        {!editing && current.docUrl && (
          <a href={current.docUrl} target="_blank" rel="noreferrer"><FileText size={14} /> Möten</a>
        )}
        {!editing && !renaming && (
          <button type="button" className="tl-link" onClick={() => setEditing(true)}>{current.docUrl ? "Byt dokument" : "Lägg till mötesdokument"}</button>
        )}
        {editing && (
          <form onSubmit={saveDoc}>
            <input autoFocus type="url" placeholder="Länk till Google Doc" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button type="submit" disabled={saving}>{saving ? "Sparar…" : "Spara"}</button>
            <button type="button" className="tl-link" onClick={() => setEditing(false)}>Avbryt</button>
          </form>
        )}
        {current.nextStepDate && (
          <span title={current.nextStep}>Nästa: {dayLabel(current.nextStepDate)}</span>
        )}
      </div>
    </div>
  );
}

// Start a project for a row in the sales sheet: search by name or P-ID.
function NewProject({ onCreated }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return undefined;
    const t = setTimeout(() => {
      authenticatedFetch(`/admin/clients/candidates?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setHits(d.candidates))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const create = async (prospectId) => {
    setBusy(prospectId);
    const r = await authenticatedFetch("/admin/clients", { method: "POST", body: JSON.stringify({ prospectId }) }).catch(() => null);
    setBusy(null);
    if (r?.ok) onCreated((await r.json()).client);
  };
  return (
    <div className="tl-newproj">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="+ Nytt projekt: sök i arket" aria-label="Nytt projekt" />
      {q.trim().length >= 2 && (
        <ul>
          {hits.map((h) => (
            <li key={h.prospectId}>
              <button type="button" onClick={() => create(h.prospectId)} disabled={!!busy}>
                <b>{h.company}</b>
                <span>{busy === h.prospectId ? "Skapar…" : `${h.prospectId}${h.stage ? ` · ${h.stage}` : ""}`}</span>
              </button>
            </li>
          ))}
          {!hits.length && <li className="tl-none">Ingen träff utan projekt</li>}
        </ul>
      )}
    </div>
  );
}

const BAR_CSS = `
  .tl-bar { position: absolute; top: 14px; left: 14px; right: 14px; z-index: 20; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; pointer-events: none; }
  .tl-bar > * { pointer-events: auto; }
  .tl-picker { position: relative; }
  .tl-current { display: inline-flex; align-items: center; gap: 8px; font: inherit; font-size: 14px; font-weight: 700; padding: 9px 12px 9px 16px; border-radius: 999px; border: 0; background: #0a0a0a; color: #fff; cursor: pointer; box-shadow: 0 6px 20px rgba(10,10,10,0.12); max-width: 70vw; }
  .tl-current span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tl-menu { position: absolute; top: calc(100% + 6px); left: 0; min-width: 240px; margin: 0; padding: 6px; list-style: none; border-radius: 14px; background: #fff; border: 1px solid rgba(0,0,0,0.1); box-shadow: 0 14px 38px rgba(10,10,10,0.14); }
  .tl-menu button { width: 100%; display: flex; align-items: center; gap: 8px; font: inherit; font-size: 14px; text-align: left; padding: 9px 10px; border-radius: 9px; border: 0; background: none; color: #0a0a0a; cursor: pointer; }
  .tl-menu button:hover { background: #f4f4f5; }
  .tl-menu b { font-weight: 600; flex: 1; }
  .tl-menu span { font-size: 12px; color: #8e8e93; }
  .tl-views { display: flex; gap: 2px; padding: 4px; border-radius: 999px; background: #fff; border: 1px solid rgba(0,0,0,0.1); box-shadow: 0 6px 20px rgba(10,10,10,0.06); }
  .tl-views button { font: inherit; font-size: 13.5px; font-weight: 600; padding: 6px 14px; border-radius: 999px; border: 0; background: none; color: #6e6e73; cursor: pointer; white-space: nowrap; }
  .tl-views button:hover { color: #0a0a0a; }
  .tl-views button.is-on { background: #f0f0f0; color: #0a0a0a; }
  .tl-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 6px 14px; border-radius: 999px; background: rgba(255,255,255,0.94); border: 1px solid rgba(0,0,0,0.08); font-size: 13px; color: #6e6e73; }
  .tl-meta a { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: #0a0a0a; text-decoration: none; }
  .tl-meta a:hover { text-decoration: underline; }
  .tl-meta form { display: flex; align-items: center; gap: 8px; }
  .tl-meta input { font: inherit; font-size: 13px; width: min(320px, 52vw); padding: 5px 10px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.18); }
  .tl-meta form button[type=submit] { font: inherit; font-size: 12.5px; font-weight: 600; padding: 5px 12px; border-radius: 999px; border: 0; background: #0a0a0a; color: #fff; cursor: pointer; }
  .tl-new { margin-top: 4px; padding-top: 6px; border-top: 1px solid #ececec; }
  .tl-newproj input { width: 100%; box-sizing: border-box; font: inherit; font-size: 13.5px; padding: 8px 10px; border-radius: 9px; border: 1px solid rgba(0,0,0,0.14); outline: none; }
  .tl-newproj input:focus { border-color: #0a0a0a; }
  .tl-newproj ul { list-style: none; margin: 6px 0 0; padding: 0; }
  .tl-newproj .tl-none { font-size: 12.5px; color: #8e8e93; padding: 6px 10px; }
  .tl-link { font: inherit; font-size: 13px; color: #6e6e73; background: none; border: 0; padding: 0; cursor: pointer; }
  .tl-link:hover { color: #0a0a0a; }
  @media (max-width: 640px) { .tl-bar { top: 66px; left: 10px; right: 10px; } }
`;

const Divider = () => <div style={{ width: 1, background: colors.border, margin: "2px 0", flexShrink: 0 }} />;

function ToolButton({ onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 10, border: `1px solid ${colors.borderStrong}`, background: "transparent", color: colors.text, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}
    >
      {icon}
      {label}
    </button>
  );
}

function SaveStatus({ status }) {
  const map = {
    saving: { icon: <Loader2 size={14} style={{ animation: "crm-spin 0.9s linear infinite" }} />, label: "Saving…", color: "rgba(10,10,10,0.45)" },
    saved: { icon: <Check size={14} />, label: "Saved", color: "#16a34a" },
    error: { icon: <CloudOff size={14} />, label: "Couldn't save", color: "#dc2626" },
  };
  const s = map[status] || map.saved;
  return (
    <span title={status === "error" ? "Changes couldn't be saved — they'll retry on your next edit" : "Your board autosaves to the cloud"} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, color: s.color, whiteSpace: "nowrap" }}>
      {s.icon}
      {s.label}
    </span>
  );
}
