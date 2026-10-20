import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Upload, Plus, Check, CloudOff, CalendarPlus, FileText, ChevronDown, X } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { useSession } from "../../lib/owner.js";
import { colors } from "../../theme/colors.js";
import { PlannerCanvas } from "../../components/planner/PlannerCanvas.jsx";
import { layoutKey } from "../../lib/plannerStore.js";
import { ProjectBoard } from "../../components/project/ProjectBoard.jsx";
import { StrategyDeck } from "../../components/project/StrategyDeck.jsx";
import { AdminShell } from "./AdminShell.jsx";

/* /admin/projects — one project per client (a Won row in the sales sheet),
   picked at the top (?kund=P-666), with three views (?vy=):
     tidslinje  the content timeline: cards pinned to dates, event marks
     board      free-form, for developing formats in meetings
     strategi   the strategy deck: vision, goals, audience…
   Formats tie the first two together: a format frame on the board is a
   format on the timeline. The frame links to its cards (?format= focuses
   them) and a card's format label links back to its frame.
   Meeting notes live in the client's Google Doc, linked from the bar. */

// The canvas works in local dates; the API stores 'YYYY-MM-DD'. Noon keeps a
// date on the same day in every timezone.
const toCanvas = (e) => ({ ...e, startsAt: `${e.startsAt}T12:00:00` });
const toApi = (patch) => (patch.startsAt ? { ...patch, startsAt: patch.startsAt.slice(0, 10) } : patch);
const dayLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

const VIEWS = [["tidslinje", "Tidslinje"], ["board", "Board"], ["strategi", "Strategi"]];

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
  const view = VIEWS.some(([v]) => v === params.get("vy")) ? params.get("vy") : "tidslinje";
  const go = (next) => setParams(Object.fromEntries(Object.entries({ kund: current?.prospectId, vy: view, ...next }).filter(([, v]) => v)), { replace: true });
  const pick = (key) => setParams({ kund: key, vy: view }, { replace: true });
  const updateClient = (client) => setData((d) => ({ ...d, clients: d.clients.map((c) => (c.id === client.id ? { ...c, ...client } : c)) }));

  if (!current) {
    return <Empty>Inga kunder än. En kund dyker upp här när raden i arket får Stage <b>Won</b>.</Empty>;
  }

  return (
    <>
      <Project key={current.id} client={current} view={view} focusFormat={params.get("format")} go={go} />
      <ProjectBar key={`bar-${current.id}`} clients={clients} current={current} view={view} onView={(vy) => go({ vy, format: null })} onPick={pick} onUpdate={updateClient} />
    </>
  );
}

// One client's project: the format list and counts that tie the timeline and
// the board together, and whichever view is open.
function Project({ client, view, focusFormat, go }) {
  const [boardFormats, setBoardFormats] = useState([]);
  const [cards, setCards] = useState([]);

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
  useEffect(() => { if (view === "board" || focusFormat) loadCards(); }, [view, focusFormat, loadCards]);

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
  if (view === "strategi") return <StrategyDeck clientId={client.id} projectName={client.company} />;
  return (
    <ClientCanvas
      clientId={client.id}
      boardFormats={boardFormats}
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
      <p style={{ maxWidth: 420, textAlign: "center", fontSize: 15, lineHeight: 1.5, color: colors.textSubtle, margin: 0 }}>{children}</p>
    </div>
  );
}

// Top of the project: whose it is (a dropdown of clients), the views, their
// meetings doc, and the next step from the sheet. Keyed by client.
function ProjectBar({ clients, current, view, onView, onPick, onUpdate }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
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
          </ul>
        )}
      </div>
      <div className="tl-views" role="tablist">
        {VIEWS.map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={v === view} className={v === view ? "is-on" : undefined} onClick={() => onView(v)}>{label}</button>
        ))}
      </div>
      <div className="tl-meta">
        {!editing && current.docUrl && (
          <a href={current.docUrl} target="_blank" rel="noreferrer"><FileText size={14} /> Möten</a>
        )}
        {!editing && (
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
