// DraftSwitcher — a compact picker in the design step that lists the host's
// saved drafts (and scheduled, not-yet-sent campaigns) so they can switch
// between them or delete the ones piling up, without juggling ?campaignId=
// URLs. Owns its own list fetch + delete request; selection/new/reset are
// handed back up to CrmPage which drives the composer state.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Trash2, FileText, Clock, Check } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { useToast } from "../Toast";

// "3h ago", "2d ago", "just now" — small, dependency-free relative time.
function relTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function DraftSwitcher({
  currentDraftId,
  reloadSignal,
  onSelect,
  onNew,
  onDeleted,
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const rootRef = useRef(null);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch("/host/crm/campaigns?limit=100");
      if (!res.ok) throw new Error("Failed to load drafts");
      const all = await res.json();
      // Only campaigns that can still be edited/removed belong in the picker.
      const editable = (Array.isArray(all) ? all : []).filter(
        (c) => c.status === "draft" || c.status === "scheduled",
      );
      setItems(editable);
    } catch (err) {
      console.error("[DraftSwitcher] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch on mount and whenever the parent bumps reloadSignal (after a
  // save/update so the list reflects the latest subject + new drafts).
  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts, reloadSignal]);

  // Click-outside / Escape closes the panel.
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (deletingId) return;
    if (!window.confirm("Delete this draft? This can't be undone.")) return;
    setDeletingId(id);
    try {
      const res = await authenticatedFetch(`/host/crm/campaigns/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || "Failed to delete draft");
      }
      setItems((prev) => prev.filter((c) => c.id !== id));
      showToast("Draft deleted", "success");
      if (id === currentDraftId) onDeleted?.(id);
    } catch (err) {
      console.error("[DraftSwitcher] delete failed:", err);
      showToast(err.message || "Failed to delete draft", "error");
    } finally {
      setDeletingId(null);
    }
  }

  const current = items.find((c) => c.id === currentDraftId);
  const label = current
    ? current.subject?.trim() || "Untitled draft"
    : currentDraftId
      ? "Untitled draft"
      : "New draft";
  const count = items.length;

  return (
    <div ref={rootRef} style={wrapStyle}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={triggerStyle}
        title="Switch between saved drafts"
      >
        <FileText size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
        <span style={triggerLabelStyle}>{label}</span>
        {count > 0 && <span style={badgeStyle}>{count}</span>}
        <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
      </button>

      {open && (
        <div style={panelStyle}>
          <button
            type="button"
            onClick={() => {
              onNew?.();
              setOpen(false);
            }}
            style={newRowStyle}
          >
            <Plus size={14} />
            <span>New draft</span>
          </button>

          <div style={dividerStyle} />

          {loading && items.length === 0 ? (
            <div style={emptyStyle}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={emptyStyle}>No saved drafts yet.</div>
          ) : (
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {items.map((c) => {
                const active = c.id === currentDraftId;
                const scheduled = c.status === "scheduled";
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      onSelect?.(c.id);
                      setOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        onSelect?.(c.id);
                        setOpen(false);
                      }
                    }}
                    style={{
                      ...itemStyle,
                      background: active ? "rgba(212,175,55,0.1)" : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = active
                        ? "rgba(212,175,55,0.1)"
                        : "transparent";
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={itemTitleRow}>
                        {active && <Check size={13} style={{ color: "#d4af37", flexShrink: 0 }} />}
                        <span style={itemTitleStyle}>
                          {c.subject?.trim() || "Untitled draft"}
                        </span>
                      </div>
                      <div style={itemMetaStyle}>
                        {scheduled ? (
                          <span style={{ color: "#fde68a", display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <Clock size={11} />
                            {c.scheduledAt
                              ? new Date(c.scheduledAt).toLocaleString("en-GB", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })
                              : "scheduled"}
                          </span>
                        ) : (
                          <span>Saved {relTime(c.createdAt)}</span>
                        )}
                        {c.totalRecipients > 0 && (
                          <span style={{ opacity: 0.6 }}>· {c.totalRecipients} recipients</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, c.id)}
                      disabled={deletingId === c.id}
                      style={trashStyle}
                      title="Delete draft"
                      aria-label="Delete draft"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const wrapStyle = { position: "relative", width: "100%" };

const triggerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.9)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textAlign: "left",
};

const triggerLabelStyle = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const badgeStyle = {
  flexShrink: 0,
  fontSize: 11,
  fontWeight: 700,
  color: "#d4af37",
  background: "rgba(212,175,55,0.14)",
  borderRadius: 999,
  padding: "1px 7px",
};

const panelStyle = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  right: 0,
  zIndex: 50,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(20,16,30,0.98)",
  backdropFilter: "blur(12px)",
  boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
  overflow: "hidden",
  padding: 4,
};

const newRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "#d4af37",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textAlign: "left",
};

const dividerStyle = {
  height: 1,
  background: "rgba(255,255,255,0.08)",
  margin: "4px 2px",
};

const emptyStyle = {
  padding: "14px 10px",
  fontSize: 12.5,
  color: "rgba(255,255,255,0.5)",
  textAlign: "center",
};

const itemStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 10px",
  borderRadius: 8,
  cursor: "pointer",
};

const itemTitleRow = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  minWidth: 0,
};

const itemTitleStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: "rgba(255,255,255,0.92)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const itemMetaStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginTop: 2,
  fontSize: 11,
  color: "rgba(255,255,255,0.55)",
};

const trashStyle = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "rgba(255,255,255,0.45)",
  cursor: "pointer",
};
