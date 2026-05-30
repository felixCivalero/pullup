import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, Plus, Check, CloudOff } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors.js";
import { PlannerCanvas } from "../components/planner/PlannerCanvas.jsx";
import { layoutKey } from "../lib/plannerStore.js";

export function ContentPlannerPage() {
  const { user, loading: authLoading } = useAuth();
  const storageKey = user?.id ? layoutKey(user.id) : null;

  const [events, setEvents] = useState([]);
  const [saveStatus, setSaveStatus] = useState("saved");
  const canvasRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await authenticatedFetch("/events");
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        setEvents(
          (Array.isArray(data) ? data : [])
            .filter((e) => e.startsAt)
            .map((e) => ({
              id: e.id,
              title: e.title || "Untitled event",
              startsAt: e.startsAt,
              thumb: e.coverImageUrl || e.imageUrl || e.cover_image_url || e.image_url || null,
            })),
        );
      } catch {
        /* ignore — timeline just shows no marks */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (authLoading || !storageKey) {
    return (
      <div className="page-with-header" style={{ height: "100dvh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={20} style={{ animation: "crm-spin 0.9s linear infinite", color: colors.textSubtle }} />
        <style>{`@keyframes crm-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="page-with-header" style={{ position: "fixed", inset: 0, background: colors.background, overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 70, left: 0, right: 0, bottom: 0 }}>
        <PlannerCanvas ref={canvasRef} storageKey={storageKey} events={events} onSaveStatus={setSaveStatus} />

        {/* Bottom-center toolbar */}
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
          }}
        >
          <SaveStatus status={saveStatus} />
          <div style={{ width: 1, background: colors.border, margin: "2px 0" }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", fontSize: 13, fontWeight: 500, color: colors.textSubtle }}>
            <Upload size={15} />
            Drop content anywhere
          </span>
          <div style={{ width: 1, background: colors.border, margin: "2px 0" }} />
          <button
            onClick={() => canvasRef.current?.addPlaceholder()}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 10, border: `1px solid ${colors.borderStrong}`, background: "transparent", color: colors.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={16} />
            Add placeholder
          </button>
        </div>
      </div>
      <style>{`@keyframes crm-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
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
