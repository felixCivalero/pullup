import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Upload, Plus, Check, CloudOff, CalendarPlus } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { useSession } from "../../lib/owner.js";
import { colors } from "../../theme/colors.js";
import { PlannerCanvas } from "../../components/planner/PlannerCanvas.jsx";
import { layoutKey } from "../../lib/plannerStore.js";
import { AdminShell } from "./AdminShell.jsx";

/* /admin/timeline — the content timeline: a pan/zoom canvas with dated lanes.
   Content cards (drop media or add a placeholder) pin to dates; event marks
   are added here too ("Add event") and edited on their flip side. */

// The canvas works in local dates; the API stores 'YYYY-MM-DD'. Noon keeps a
// date on the same day in every timezone.
const toCanvas = (e) => ({ ...e, startsAt: `${e.startsAt}T12:00:00` });
const toApi = (patch) => (patch.startsAt ? { ...patch, startsAt: patch.startsAt.slice(0, 10) } : patch);

export function TimelinePage() {
  return (
    <AdminShell title="Tidslinje" fill>
      <Timeline />
    </AdminShell>
  );
}

function Timeline() {
  const session = useSession();
  const storageKey = session?.user?.id ? layoutKey(session.user.id) : null;
  const [events, setEvents] = useState([]);
  const [saveStatus, setSaveStatus] = useState("saved");
  const canvasRef = useRef(null);

  useEffect(() => {
    let alive = true;
    authenticatedFetch("/admin/planner/events")
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => alive && setEvents((d.events || []).map(toCanvas)))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

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
    write("/admin/planner/events", { method: "POST", body: JSON.stringify(toApi(ev)) });
  }, [write]);

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
      <style>{`@keyframes crm-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

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
