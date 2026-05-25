import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Search,
  Download,
  Upload,
  Users,
  CircleDollarSign,
  CreditCard,
  ClipboardList,
  Calendar,
  Check,
  Clock,
  FileEdit,
  Tag,
  Plus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useToast } from "./Toast";
import { authenticatedFetch } from "../lib/api.js";
import { getEventUrl } from "../lib/urlUtils.js";
import { colors } from "../theme/colors.js";
import { SilverIcon } from "./ui/SilverIcon.jsx";
import { AutoTagButton, AutoTagFlashStyle } from "./crm/AutoTagButton.jsx";
import { SegmentedControl, ChipCloud, FilterGroup } from "./crm/SegmentControls.jsx";

function formatDate(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatEventDate(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCurrency(amount, currency = "SEK") {
  if (!amount) return "0";
  const formatted = (amount / 100).toFixed(2);
  return `${formatted} ${currency.toUpperCase()}`;
}

const PAGE_SIZE = 20;

// Identity fields collected via event form_fields and stored on `people`.
// Render order + small lowercase label (matches the dark/compact UI).
// `format` runs on the raw value, returns null to hide the chip entirely.
const IDENTITY_FIELDS = [
  {
    key: "instagram",
    label: "ig",
    format: (v) => (v.startsWith("@") ? v : `@${v.replace(/^@/, "")}`),
  },
  { key: "phone", label: "phone", format: (v) => v },
  { key: "company", label: "co", format: (v) => v },
  {
    key: "twitter",
    label: "x",
    format: (v) => (v.startsWith("@") ? v : `@${v.replace(/^@/, "")}`),
  },
  {
    key: "tiktok",
    label: "tt",
    format: (v) => (v.startsWith("@") ? v : `@${v.replace(/^@/, "")}`),
  },
  { key: "linkedin", label: "in", format: (v) => v },
  { key: "birthday", label: "bday", format: (v) => v },
];

// Editable identity grid shown inside the expanded contact panel. Each field
// is an inline input that auto-saves on blur (or Enter); blanking + blur
// clears the value server-side. The parent supplies `onSave(patch)` which
// PATCHes /host/crm/people/:id and merges the result back into list state.
function EditableContact({ person, onSave }) {
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(IDENTITY_FIELDS.map((f) => [f.key, person?.[f.key] || ""])),
  );
  const [savingKey, setSavingKey] = useState(null);
  const [savedKey, setSavedKey] = useState(null);

  // If the parent swaps person data (e.g. list refresh), sync drafts back so
  // we don't show stale local edits over fresher server data.
  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        IDENTITY_FIELDS.map((f) => [f.key, person?.[f.key] || ""]),
      ),
    );
  }, [person?.id, person?.instagram, person?.twitter, person?.tiktok, person?.linkedin, person?.company, person?.birthday, person?.phone]);

  const commit = async (key) => {
    const next = drafts[key]?.trim() || "";
    const current = person?.[key] || "";
    if (next === current) return; // no-op
    setSavingKey(key);
    try {
      await onSave({ [key]: next || null });
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1200);
    } catch (e) {
      // Revert draft to stored value on failure so user sees the rollback.
      setDrafts((d) => ({ ...d, [key]: current }));
    } finally {
      setSavingKey((k) => (k === key ? null : k));
    }
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "8px 12px",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {IDENTITY_FIELDS.map((f) => {
        const isSaving = savingKey === f.key;
        const isSaved = savedKey === f.key;
        return (
          <label
            key={f.key}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "3px",
              fontSize: "12px",
            }}
          >
            <span
              style={{
                opacity: 0.55,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontSize: "10px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {f.label}
              {isSaving && <span style={{ opacity: 0.6 }}>· saving…</span>}
              {isSaved && (
                <span style={{ color: "#a3e635", opacity: 0.9 }}>· saved</span>
              )}
            </span>
            <input
              type="text"
              value={drafts[f.key]}
              placeholder="—"
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [f.key]: e.target.value }))
              }
              onBlur={() => commit(f.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setDrafts((d) => ({ ...d, [f.key]: person?.[f.key] || "" }));
                  e.currentTarget.blur();
                }
              }}
              style={{
                padding: "6px 8px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "6px",
                color: "#fff",
                fontSize: "13px",
                outline: "none",
              }}
            />
          </label>
        );
      })}
    </div>
  );
}

// ISO date (YYYY-MM-DD) in the browser's local timezone — what <input type=date>
// expects and what the notes API stores in note_date.
function todayLocalISO() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().slice(0, 10);
}

function formatNoteDate(iso) {
  if (!iso) return "—";
  // note_date is a bare YYYY-MM-DD; append time so it isn't shifted by tz.
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Timeline of dated, host-private observations about a person ("talked Leica on
// the photowalk"). Composer up top, newest-first log below. Each entry is just
// a date + free text, optionally tagged to the event it happened at. The `topic`
// field exists on the record but is AI-only (set via MCP) and never shown here.
function PersonNotes({ notes, loading, eventOptions, onAdd, onEdit, onDelete }) {
  const [content, setContent] = useState("");
  const [eventId, setEventId] = useState("");
  const [noteDate, setNoteDate] = useState(todayLocalISO());
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ content: "", eventId: "", noteDate: "" });
  const [busyId, setBusyId] = useState(null);

  const eventTitleById = useMemo(() => {
    const m = {};
    (eventOptions || []).forEach((e) => {
      m[e.id] = e.title;
    });
    return m;
  }, [eventOptions]);

  // Picking an event snaps the date to that event's date (host can still
  // override afterwards) — matches the "this came up on that walk" mental model.
  const onPickEvent = (id) => {
    setEventId(id);
    const ev = (eventOptions || []).find((e) => e.id === id);
    if (ev && ev.date) setNoteDate(ev.date.slice(0, 10));
  };

  const submit = async () => {
    const text = content.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await onAdd({ content: text, eventId: eventId || null, noteDate });
      setContent("");
      setEventId("");
      setNoteDate(todayLocalISO());
    } catch {
      /* parent shows the toast; keep the draft so nothing is lost */
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (n) => {
    setEditingId(n.id);
    setEditDraft({
      content: n.content,
      eventId: n.eventId || "",
      noteDate: (n.noteDate || todayLocalISO()).slice(0, 10),
    });
  };

  const saveEdit = async (noteId) => {
    const text = editDraft.content.trim();
    if (!text) return;
    setBusyId(noteId);
    try {
      await onEdit(noteId, {
        content: text,
        eventId: editDraft.eventId || null,
        noteDate: editDraft.noteDate,
      });
      setEditingId(null);
    } catch {
      /* keep editing open on failure */
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (noteId) => {
    setBusyId(noteId);
    try {
      await onDelete(noteId);
    } finally {
      setBusyId(null);
    }
  };

  const inputStyle = {
    padding: "6px 8px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "6px",
    color: "#fff",
    fontSize: "13px",
    outline: "none",
  };

  const list = Array.isArray(notes) ? notes : [];

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div
        style={{
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          opacity: 0.55,
          marginBottom: "8px",
        }}
      >
        Notes
      </div>

      {/* Composer */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          padding: "10px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "8px",
          marginBottom: list.length > 0 ? "12px" : "4px",
        }}
      >
        <textarea
          value={content}
          placeholder="What did you learn? e.g. talked Leica M6, wants to get into film…"
          rows={2}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }}
        />
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="date"
            value={noteDate}
            onChange={(e) => setNoteDate(e.target.value)}
            style={{ ...inputStyle, colorScheme: "dark", flex: "0 0 auto" }}
          />
          <select
            value={eventId}
            onChange={(e) => onPickEvent(e.target.value)}
            style={{ ...inputStyle, flex: "1 1 160px", colorScheme: "dark", cursor: "pointer" }}
          >
            <option value="">No event</option>
            {(eventOptions || []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={submit}
            disabled={!content.trim() || saving}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              background: content.trim() && !saving ? colors.gold : "rgba(255,255,255,0.06)",
              color: content.trim() && !saving ? "#000" : "rgba(255,255,255,0.5)",
              border: "none",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: content.trim() && !saving ? "pointer" : "default",
            }}
          >
            {saving ? (
              <Loader2 size={14} style={{ animation: "crm-spin 0.9s linear infinite" }} />
            ) : (
              <Plus size={14} />
            )}
            Add note
          </button>
        </div>
      </div>

      {/* Timeline */}
      {loading && list.length === 0 ? (
        <div style={{ fontSize: "13px", opacity: 0.5, fontStyle: "italic" }}>Loading notes…</div>
      ) : list.length === 0 ? (
        <div style={{ fontSize: "13px", opacity: 0.45, fontStyle: "italic" }}>
          No notes yet — jot down what you learn and it builds a history over time.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {list.map((n) => {
            const isEditing = editingId === n.id;
            const isBusy = busyId === n.id;
            const eventTitle = n.eventId ? eventTitleById[n.eventId] : null;
            return (
              <div
                key={n.id}
                style={{
                  padding: "10px 12px",
                  background: "rgba(12, 10, 18, 0.4)",
                  borderRadius: "8px",
                  fontSize: "13px",
                  opacity: isBusy ? 0.5 : 1,
                }}
              >
                {isEditing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <textarea
                      value={editDraft.content}
                      rows={2}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, content: e.target.value }))
                      }
                      style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }}
                    />
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <input
                        type="date"
                        value={editDraft.noteDate}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, noteDate: e.target.value }))
                        }
                        style={{ ...inputStyle, colorScheme: "dark" }}
                      />
                      <select
                        value={editDraft.eventId}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, eventId: e.target.value }))
                        }
                        style={{ ...inputStyle, flex: "1 1 140px", colorScheme: "dark", cursor: "pointer" }}
                      >
                        <option value="">No event</option>
                        {(eventOptions || []).map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => saveEdit(n.id)}
                        disabled={!editDraft.content.trim()}
                        style={{
                          padding: "6px 10px",
                          background: colors.gold,
                          color: "#000",
                          border: "none",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        title="Cancel"
                        style={{
                          padding: "6px",
                          background: "transparent",
                          color: "rgba(255,255,255,0.6)",
                          border: "none",
                          cursor: "pointer",
                          display: "inline-flex",
                        }}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "11px",
                          opacity: 0.6,
                          marginBottom: "4px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span>{formatNoteDate(n.noteDate)}</span>
                        {eventTitle && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ opacity: 0.5 }}>·</span>
                            <Calendar size={11} />
                            <span style={{ wordBreak: "break-word" }}>{eventTitle}</span>
                          </span>
                        )}
                      </div>
                      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.45 }}>
                        {n.content}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "2px", flex: "0 0 auto" }}>
                      <button
                        type="button"
                        onClick={() => startEdit(n)}
                        title="Edit note"
                        style={{
                          padding: "4px",
                          background: "transparent",
                          color: "rgba(255,255,255,0.45)",
                          border: "none",
                          cursor: "pointer",
                          display: "inline-flex",
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(n.id)}
                        disabled={isBusy}
                        title="Delete note"
                        style={{
                          padding: "4px",
                          background: "transparent",
                          color: "rgba(255,255,255,0.45)",
                          border: "none",
                          cursor: "pointer",
                          display: "inline-flex",
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ContactStrip({ person, compact = false }) {
  const items = IDENTITY_FIELDS.map((f) => {
    const raw = person?.[f.key];
    if (!raw || typeof raw !== "string" || !raw.trim()) return null;
    return { label: f.label, value: f.format(raw.trim()) };
  }).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: compact ? "8px" : "10px 14px",
        fontSize: compact ? "12px" : "13px",
        marginTop: compact ? "4px" : 0,
        marginBottom: compact ? "4px" : 0,
        color: "rgba(255,255,255,0.78)",
        lineHeight: 1.4,
      }}
    >
      {items.map((it, i) => (
        <span key={i} style={{ display: "inline-flex", gap: "5px" }}>
          <span style={{ opacity: 0.45 }}>{it.label}</span>
          <span style={{ wordBreak: "break-word" }}>{it.value}</span>
        </span>
      ))}
    </div>
  );
}

export function CrmTab({ onSegmentChange, initialFilters }) {
  const { showToast } = useToast();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importEventUrl, setImportEventUrl] = useState("");
  const [filters, setFilters] = useState(initialFilters || {});

  // Hydrate filters from a parent-provided initial value (used when CrmPage
  // loads an existing draft via ?campaignId=). Runs once per identity change.
  useEffect(() => {
    if (initialFilters) setFilters(initialFilters);
  }, [initialFilters]);
  const [total, setTotal] = useState(0);
  const [baselineTotal, setBaselineTotal] = useState(null);
  const [page, setPage] = useState(0); // zero-based page index
  const [savedViews, setSavedViews] = useState([]);
  const [activeView, setActiveView] = useState(null);
  const [events, setEvents] = useState([]);

  // CRM UI state
  const [showEventDropdown, setShowEventDropdown] = useState(false);
  const [expandedPersonId, setExpandedPersonId] = useState(null);
  const [personDetails, setPersonDetails] = useState({});
  const [showAllEventsByPerson, setShowAllEventsByPerson] = useState({});

  // Auto-tagging state — drives the per-event "watch it work" animation
  // inside the event filter dropdown. Tags persist on the events themselves
  // so they're visible after the run.
  const [taggingEventId, setTaggingEventId] = useState(null);
  const [newTagsByEventId, setNewTagsByEventId] = useState({});
  const [flashedEventIds, setFlashedEventIds] = useState({});

  // Filter index — lightweight {id, eventIds, hadDinner} per contact loaded
  // once on mount. Drives instant client-side count updates while filters
  // change; the paginated /people fetch refreshes the visible rows in the
  // background. Cleared and refetched whenever a write/migration would
  // make it stale (currently only on mount; events/people don't mutate in
  // ways that affect filtering during a session).
  const [filterIndex, setFilterIndex] = useState(null);
  // True only while a server-driven /people fetch is in flight. Distinct
  // from the count-loading state, which is instant once filterIndex loads.
  const [listLoading, setListLoading] = useState(false);

  // Per-event admin_tags map, derived from events. Used by the client-side
  // filter to evaluate attendedEventTags without hitting the server.
  const tagsByEventId = useMemo(() => {
    const m = new Map();
    for (const e of events) {
      m.set(e.id, new Set(e.adminTags || []));
    }
    return m;
  }, [events]);

  // Pure client-side filter — operates on the lightweight index plus the
  // tag map derived from events. Returns counts for the live recipient
  // badge: { sendable, total }. `sendable` excludes contacts with no email,
  // unsubscribed contacts, and addresses on the global suppression list,
  // so the badge matches what the backend would actually send.
  const optimisticTotal = useMemo(() => {
    if (!filterIndex) return null;
    const wantEventIds = (filters.attendedEventIds || []).length > 0
      ? new Set(filters.attendedEventIds)
      : null;
    const wantTags = (filters.attendedEventTags || []).length > 0
      ? new Set(filters.attendedEventTags)
      : null;
    const wantDinner = filters.hasDinner === true;
    let sendable = 0;
    let total = 0;
    for (const p of filterIndex) {
      if (wantEventIds && !p.eventIds.some((id) => wantEventIds.has(id))) continue;
      if (wantTags) {
        let ok = false;
        for (const eid of p.eventIds) {
          const tags = tagsByEventId.get(eid);
          if (!tags) continue;
          for (const t of tags) {
            if (wantTags.has(t)) { ok = true; break; }
          }
          if (ok) break;
        }
        if (!ok) continue;
      }
      if (wantDinner && !p.hadDinner) continue;
      total += 1;
      // p.sendable is set by the backend (people-filter-index endpoint).
      // Legacy clients/responses without this field fall back to "sendable"
      // so we don't accidentally zero out the count.
      if (p.sendable !== false) sendable += 1;
    }
    return { sendable, total };
  }, [filterIndex, filters, tagsByEventId]);

  // Fetch the filter index once on mount. Tiny payload; failure is
  // non-fatal — we just fall back to the server-driven total.
  useEffect(() => {
    let cancelled = false;
    authenticatedFetch("/host/crm/people-filter-index")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setFilterIndex(Array.isArray(d.index) ? d.index : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Load people with filters. Debounced so a burst of filter clicks fires
  // one server request, not N. The recipient count badge updates instantly
  // from the client-side filterIndex while we wait — see optimisticTotal.
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const isFirstLoad = total === 0 && people.length === 0;
    // First load runs immediately so the page doesn't sit empty; subsequent
    // filter changes get debounced so rapid toggling stays responsive.
    const delay = isFirstLoad ? 0 : 200;

    async function loadPeople() {
      if (cancelled) return;
      setListLoading(true);
      if (isFirstLoad) setLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.append("search", searchQuery);

        // Event attending filter: allow multi-select (comma-separated IDs)
        if (
          filters.attendedEventIds &&
          Array.isArray(filters.attendedEventIds) &&
          filters.attendedEventIds.length > 0
        ) {
          params.append("attendedEventIds", filters.attendedEventIds.join(","));
        }

        // Event tag filter: AI-generated tags that classify event type
        if (
          filters.attendedEventTags &&
          Array.isArray(filters.attendedEventTags) &&
          filters.attendedEventTags.length > 0
        ) {
          params.append(
            "attendedEventTags",
            filters.attendedEventTags.join(","),
          );
        }

        // Dinner filter: true = only guests who had dinner, undefined = no filter
        if (filters.hasDinner !== undefined) {
          params.append("hasDinner", filters.hasDinner.toString());
        }

        // Always route through the advanced CRM filters pipeline so we
        // get enriched eventHistory (with attendanceStatus, cocktails/dinner, etc.)
        // for consistent Pull Up scoring, even when no visible filters are set.
        params.append("eventsAttendedMin", "0");

        params.append("sortBy", "created_at");
        params.append("sortOrder", "desc");
        params.append("limit", PAGE_SIZE.toString());
        params.append("offset", (page * PAGE_SIZE).toString());

        const res = await authenticatedFetch(`/host/crm/people?${params}`);
        if (cancelled) return;
        if (!res.ok) throw new Error("Failed to load people");
        const data = await res.json();
        if (cancelled) return;
        const nextTotal = data.total || 0;
        setPeople(data.people || []);
        setTotal(nextTotal);

        // Capture the unfiltered baseline when there are no search/filters
        if (
          (baselineTotal === null || baselineTotal === 0) &&
          !searchQuery &&
          Object.keys(filters).length === 0
        ) {
          setBaselineTotal(nextTotal);
        }
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        showToast("Failed to load contacts", "error");
      } finally {
        if (!cancelled) {
          setListLoading(false);
          setLoading(false);
        }
      }
    }

    timer = setTimeout(loadPeople, delay);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filters, page]);

  // Push current segment selection up to the parent (CrmPage). Runs whenever
  // search, filters, or total change so the Email tab + Send button stay in sync.
  useEffect(() => {
    if (!onSegmentChange) return;
    const filterCriteria = {
      search: searchQuery || undefined,
      attendedEventIds:
        filters.attendedEventIds && filters.attendedEventIds.length > 0
          ? filters.attendedEventIds
          : undefined,
      attendedEventTags:
        filters.attendedEventTags && filters.attendedEventTags.length > 0
          ? filters.attendedEventTags
          : undefined,
      hasDinner: filters.hasDinner !== undefined ? filters.hasDinner : undefined,
      eventsAttendedMin: 0,
    };
    // Prefer the optimistic count when available so the email composer's
    // "Send to N recipients" reflects filter changes instantly, matching
    // the live count badge above. `sendable` is what we'll actually send to
    // (no-email / unsubscribed / suppressed contacts excluded).
    const optimisticSendable = optimisticTotal?.sendable;
    onSegmentChange({
      filterCriteria,
      total: optimisticSendable != null ? optimisticSendable : total,
    });
  }, [searchQuery, filters, total, optimisticTotal, onSegmentChange]);

  // Load detailed touchpoints (campaign history etc.) for a single person
  async function loadPersonDetails(personId) {
    // Avoid refetch if we already have data or currently loading
    setPersonDetails((prev) => {
      const current = prev[personId] || {};
      if (current.loading) return prev;
      return {
        ...prev,
        [personId]: { ...current, loading: true, error: null },
      };
    });

    try {
      const res = await authenticatedFetch(`/host/crm/people/${personId}`);
      if (!res.ok) {
        throw new Error("Failed to load person details");
      }
      const data = await res.json();
      const emails = data.touchpoints?.emails || [];
      const notes = data.touchpoints?.notes || [];

      // Compute simple campaign stats
      const campaignIds = new Set();
      let lastCampaignAt = null;
      let openCount = 0;
      let clickCount = 0;
      let bounceCount = 0;

      emails.forEach((email) => {
        if (email.campaignId) {
          campaignIds.add(email.campaignId);
        }

        const ts = email.sentAt || email.deliveredAt || email.createdAt;
        if (
          ts &&
          (!lastCampaignAt || new Date(ts) > new Date(lastCampaignAt))
        ) {
          lastCampaignAt = ts;
        }

        if (email.openedAt) openCount += 1;
        if (email.clickedAt) clickCount += 1;

        const status = (email.status || "").toLowerCase();
        if (
          status.includes("bounce") ||
          status.includes("failed") ||
          status.includes("error")
        ) {
          bounceCount += 1;
        }
      });

      const recentEmails = emails.slice(0, 5);

      setPersonDetails((prev) => ({
        ...prev,
        [personId]: {
          ...prev[personId],
          loading: false,
          error: null,
          campaignsSent: campaignIds.size,
          lastCampaignAt,
          recentEmails,
          openCount,
          clickCount,
          bounceCount,
          notes,
        },
      }));
    } catch (error) {
      console.error("Failed to load person details:", error);
      setPersonDetails((prev) => ({
        ...prev,
        [personId]: {
          ...prev[personId],
          loading: false,
          error: error.message || "Failed to load details",
        },
      }));
    }
  }

  // Notes timeline mutations. All three keep personDetails[personId].notes in
  // sync optimistically-ish (we wait for the server, then patch local state)
  // and re-sort newest-first so a backdated entry lands in the right place.
  const sortNotes = (arr) =>
    [...arr].sort((a, b) => {
      const d = (b.noteDate || "").localeCompare(a.noteDate || "");
      if (d !== 0) return d;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

  const setNotesFor = (personId, updater) =>
    setPersonDetails((prev) => {
      const current = prev[personId] || {};
      const next = updater(current.notes || []);
      return { ...prev, [personId]: { ...current, notes: sortNotes(next) } };
    });

  async function addPersonNote(personId, payload) {
    const res = await authenticatedFetch(`/host/crm/people/${personId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      showToast("Failed to add note", "error");
      throw new Error("add note failed");
    }
    const note = await res.json();
    setNotesFor(personId, (notes) => [note, ...notes]);
  }

  async function editPersonNote(personId, noteId, payload) {
    const res = await authenticatedFetch(
      `/host/crm/people/${personId}/notes/${noteId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      showToast("Failed to save note", "error");
      throw new Error("edit note failed");
    }
    const updated = await res.json();
    setNotesFor(personId, (notes) =>
      notes.map((n) => (n.id === noteId ? updated : n)),
    );
  }

  async function removePersonNote(personId, noteId) {
    const res = await authenticatedFetch(
      `/host/crm/people/${personId}/notes/${noteId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      showToast("Failed to delete note", "error");
      throw new Error("delete note failed");
    }
    setNotesFor(personId, (notes) => notes.filter((n) => n.id !== noteId));
  }

  // Load saved views
  useEffect(() => {
    async function loadViews() {
      try {
        const res = await authenticatedFetch("/host/crm/views");
        if (res.ok) {
          const data = await res.json();
          setSavedViews(data.views || []);
        }
      } catch (err) {
        console.error("Failed to load views:", err);
      }
    }
    loadViews();
  }, []);

  // Load user's events for filter dropdown
  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await authenticatedFetch("/events");
        if (res.ok) {
          const data = await res.json();
          setEvents(data || []);
          console.log(
            "[CRM] Loaded events for filter:",
            (data || []).map((e) => ({ id: e.id, title: e.title })),
          );
        }
      } catch (err) {
        console.error("Failed to load events:", err);
      }
    }
    loadEvents();
  }, []);

  // Apply saved view
  useEffect(() => {
    if (activeView) {
      setFilters(activeView.filters || {});
      setPage(0); // Reset to first page when view changes
    }
  }, [activeView]);

  // Flatten the host's event admin_tags into a frequency-sorted vocabulary —
  // drives the tag filter chip cloud below the event dropdown.
  const tagVocabulary = useMemo(() => {
    const counts = {};
    for (const ev of events) {
      for (const t of ev.adminTags || []) {
        if (typeof t !== "string") continue;
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [events]);

  // Patch local events state when AI returns new tags for one of them.
  function handleEventTagged({ eventId, adminTags, generatedTags }) {
    setEvents((prev) =>
      prev.map((ev) => (ev.id === eventId ? { ...ev, adminTags } : ev)),
    );
    setNewTagsByEventId((prev) => ({ ...prev, [eventId]: new Set(generatedTags || []) }));
    setFlashedEventIds((prev) => ({ ...prev, [eventId]: Date.now() }));
    setTaggingEventId(null);
    setTimeout(() => {
      setNewTagsByEventId((prev) => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
    }, 2500);
  }

  function handleAutoTagStart(eventId) {
    setTaggingEventId(eventId);
    // Pop the dropdown open so the host can actually see the rows updating.
    setShowEventDropdown(true);
  }

  const handleImportCsv = async () => {
    if (!importFile) {
      showToast("Please select a CSV file", "error");
      return;
    }

    setImporting(true);
    try {
      const fileText = await importFile.text();

      // Extract event ID from URL if provided
      let eventId = null;
      if (importEventUrl.trim()) {
        const url = importEventUrl.trim();

        // Check if it's a UUID (direct event ID)
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(url)) {
          eventId = url;
        } else {
          // Try to extract slug from URL (e.g., /e/slug or /events/slug)
          const slugMatch = url.match(/\/(?:e|events)\/([^\/?]+)/);
          if (slugMatch) {
            const slug = slugMatch[1];
            // Fetch event by slug to get ID
            try {
              const eventRes = await authenticatedFetch(`/host/events/${slug}`);
              if (eventRes.ok) {
                const event = await eventRes.json();
                eventId = event.id;
              } else {
                throw new Error("Event not found. Please check the URL.");
              }
            } catch (err) {
              throw new Error(
                "Could not find event. Please check the URL or use the event ID directly.",
              );
            }
          } else {
            throw new Error(
              "Invalid event URL. Please use format: https://pullup.se/e/event-slug or paste the event ID directly.",
            );
          }
        }
      }

      const res = await authenticatedFetch("/host/crm/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv: fileText,
          eventId: eventId,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Import failed");
      }

      const result = await res.json();
      const rsvpMessage =
        result.summary.rsvpsCreated > 0
          ? `, ${result.summary.rsvpsCreated} RSVP${
              result.summary.rsvpsCreated !== 1 ? "s" : ""
            } created`
          : "";
      showToast(
        `Import complete: ${result.summary.created} created, ${result.summary.updated} updated${rsvpMessage}`,
        "success",
      );

      // Reload people
      setPage(0); // Reset to first page after import
      setImportFile(null);
      setImportEventUrl("");
      setShowImportModal(false);
    } catch (error) {
      console.error("Import error:", error);
      showToast(error.message || "Failed to import CSV", "error");
    } finally {
      setImporting(false);
    }
  };

  const handleSaveView = async () => {
    const viewName = prompt("Enter a name for this view:");
    if (!viewName) return;

    try {
      const res = await authenticatedFetch("/host/crm/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: viewName,
          filters,
          sortBy: "created_at",
          sortOrder: "desc",
        }),
      });

      if (res.ok) {
        const newView = await res.json();
        setSavedViews([...savedViews, newView]);
        setActiveView(newView);
        showToast("View saved successfully", "success");
      }
    } catch (error) {
      showToast("Failed to save view", "error");
    }
  };

  if (loading && people.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "60px 24px",
          opacity: 0.6,
        }}
      >
        <div
          style={{
            marginBottom: "16px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <SilverIcon
            as={Loader2}
            size={48}
            style={{ animation: "crm-spin 1s linear infinite" }}
          />
        </div>
        <div style={{ fontSize: "18px", fontWeight: 600 }}>
          Loading contacts...
        </div>
      </div>
    );
  }

  const hasNextPage = (page + 1) * PAGE_SIZE < total;
  const hasPrevPage = page > 0;

  return (
    <div>
      <style>{`
        @keyframes crm-spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 767px) {
          .export-csv-button, .import-csv-button {
            display: none !important;
          }
        }
      `}</style>

      {/* Header with Search, Actions, and Saved Views */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {/* Segment container */}
        <div
          style={{
            marginTop: "8px",
            padding: "18px 20px 16px",
            background:
              "linear-gradient(180deg, rgba(20, 16, 30, 0.78), rgba(20, 16, 30, 0.62))",
            borderRadius: "18px",
            border: "1px solid rgba(34, 197, 94, 0.28)",
            boxShadow:
              "0 0 0 1px rgba(34,197,94,0.10), 0 14px 40px rgba(0,0,0,0.55)",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          {/* Segment heading + recipient count + auto-tag */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#22c55e",
                  display: "inline-block",
                  boxShadow: "0 0 6px rgba(34,197,94,0.5)",
                }} />
                email audience
              </div>
              <div
                style={{
                  fontSize: "12px",
                  opacity: 0.45,
                  paddingLeft: "16px",
                }}
              >
                tune the filters below to define who receives your next send
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <AutoTagButton
                events={events}
                endpoint={(id) => `/events/${id}/auto-tag`}
                onEventStart={handleAutoTagStart}
                onEventTagged={handleEventTagged}
                label="auto-tag events"
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "rgba(34, 197, 94, 0.10)",
                  border: "1px solid rgba(34, 197, 94, 0.28)",
                  borderRadius: "999px",
                  padding: "5px 14px",
                  transition: "opacity 0.15s ease",
                }}
              >
                {(() => {
                  // Prefer the live optimistic count when it's loaded. The
                  // legacy server `total` is shown as a fallback (and only
                  // until the filter index lands), so we shouldn't worry
                  // about the unsendable gap in that branch.
                  const sendable = optimisticTotal?.sendable;
                  const matched = optimisticTotal?.total;
                  const displayCount = sendable != null ? sendable : total;
                  const skipped =
                    sendable != null && matched != null
                      ? Math.max(0, matched - sendable)
                      : 0;
                  return (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span
                        style={{
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                          fontSize: "17px",
                          fontWeight: 600,
                          color: "#4ade80",
                          transition: "color 0.15s ease",
                        }}
                      >
                        {displayCount.toLocaleString()}
                      </span>
                      <span style={{ fontSize: "11.5px", opacity: 0.55, letterSpacing: "0.02em" }}>
                        {displayCount === 1 ? "recipient" : "recipients"}
                      </span>
                      {skipped > 0 && (
                        <span
                          title="Contacts in this segment that we can't email (no address, unsubscribed, or hard-bounced)"
                          style={{
                            fontSize: "10.5px",
                            opacity: 0.45,
                            letterSpacing: "0.02em",
                            marginLeft: 4,
                          }}
                        >
                          · {skipped.toLocaleString()} skipped
                        </span>
                      )}
                    </div>
                  );
                })()}
                {listLoading && (
                  <Loader2
                    size={11}
                    style={{
                      color: "rgba(74,222,128,0.7)",
                      animation: "crm-spin 0.9s linear infinite",
                    }}
                  />
                )}
              </div>
            </div>
          </div>
          {AutoTagFlashStyle}

          {/* Divider */}
          <div style={{ height: "1px", background: "rgba(255,255,255,0.06)" }} />

          {(() => {
            const eventActive = (filters.attendedEventIds || []).length > 0;
            const dinnerActive = filters.hasDinner === true;
            const tagsActive = (filters.attendedEventTags || []).length > 0;
            const activeCount =
              Number(eventActive) + Number(dinnerActive) + Number(tagsActive);
            const clearAll = () => {
              setFilters((prev) => ({
                ...prev,
                attendedEventIds: undefined,
                hasDinner: undefined,
                attendedEventTags: undefined,
              }));
              setPage(0);
            };
            return (
              <>
                {activeCount > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      marginTop: -4,
                    }}
                  >
                    <span
                      style={{
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                        fontSize: 10.5,
                        color: "#fff",
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      {activeCount} active
                    </span>
                    <button
                      type="button"
                      onClick={clearAll}
                      style={{
                        background: "none",
                        border: "none",
                        color: "rgba(255,255,255,0.5)",
                        fontSize: 10.5,
                        letterSpacing: "0.06em",
                        textTransform: "lowercase",
                        cursor: "pointer",
                        padding: 0,
                        textDecoration: "underline",
                        textUnderlineOffset: 3,
                      }}
                    >
                      clear all
                    </button>
                  </div>
                )}

                <FilterGroup label="filter by event" active={eventActive} accent="#60a5fa">
                  <div style={{ position: "relative" }}>
                    <button
                      type="button"
                      onClick={() => setShowEventDropdown((open) => !open)}
                      style={{
                        width: "100%",
                        padding: "9px 14px",
                        borderRadius: 10,
                        border: eventActive
                          ? "1px solid rgba(96,165,250,0.4)"
                          : "1px solid rgba(255,255,255,0.08)",
                        background: eventActive
                          ? "rgba(96,165,250,0.06)"
                          : "rgba(255,255,255,0.03)",
                        color: "#fff",
                        fontSize: "12.5px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        transition: "all 0.16s ease",
                      }}
                    >
                      <span style={{ opacity: eventActive ? 0.95 : 0.7 }}>
                        {eventActive
                          ? `${filters.attendedEventIds.length} event${
                              filters.attendedEventIds.length > 1 ? "s" : ""
                            } selected`
                          : "all events"}
                      </span>
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10,
                          opacity: 0.5,
                          transform: showEventDropdown ? "rotate(180deg)" : "none",
                          transition: "transform 0.18s ease",
                        }}
                      >
                        ▾
                      </span>
                    </button>
                    {showEventDropdown && (
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 6px)",
                          left: 0,
                          right: 0,
                          zIndex: 10,
                          background: "rgba(12, 10, 18, 0.98)",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.1)",
                          padding: 8,
                          maxHeight: 240,
                          overflowY: "auto",
                          boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
                        }}
                      >
                        {events.map((event) => {
                          const selectedIds = filters.attendedEventIds || [];
                          const checked = selectedIds.includes(event.id);
                          const isTagging = taggingEventId === event.id;
                          const flashKey = flashedEventIds[event.id];
                          const newTagSet = newTagsByEventId[event.id] || new Set();
                          const eventTags = event.adminTags || [];
                          return (
                            <label
                              key={event.id}
                              className={flashKey ? "autotag-flash" : undefined}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                                padding: "8px 6px",
                                fontSize: 13,
                                cursor: "pointer",
                                borderRadius: 6,
                                border: isTagging
                                  ? "1px solid rgba(251,191,36,0.5)"
                                  : "1px solid transparent",
                                transition: "border-color 0.25s",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const current = filters.attendedEventIds || [];
                                    const next = e.target.checked
                                      ? [...current, event.id]
                                      : current.filter((id) => id !== event.id);
                                    setFilters((prev) => ({
                                      ...prev,
                                      attendedEventIds: next.length ? next : undefined,
                                    }));
                                    setPage(0);
                                  }}
                                  style={{ margin: 0 }}
                                />
                                <span style={{ opacity: 0.9, flex: 1, minWidth: 0 }}>{event.title}</span>
                              </div>
                              {(eventTags.length > 0 || isTagging) && (
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", paddingLeft: 24 }}>
                                  {isTagging && eventTags.length === 0 && (
                                    <span style={{ fontSize: 10, color: "rgba(251,191,36,0.85)", fontStyle: "italic" }}>
                                      generating tags…
                                    </span>
                                  )}
                                  {eventTags.map((tag) => {
                                    const isNew = newTagSet.has(tag);
                                    return (
                                      <span
                                        key={tag}
                                        className={isNew ? "autotag-tag-new" : undefined}
                                        style={{
                                          padding: "1px 7px",
                                          borderRadius: 999,
                                          fontSize: 10,
                                          fontWeight: 600,
                                          background: isNew ? "rgba(251,191,36,0.22)" : "rgba(251,191,36,0.10)",
                                          color: isNew ? "#fde68a" : "rgba(251,191,36,0.85)",
                                          border: isNew
                                            ? "1px solid rgba(251,191,36,0.55)"
                                            : "1px solid rgba(251,191,36,0.18)",
                                          boxShadow: isNew ? "0 0 6px rgba(251,191,36,0.35)" : "none",
                                        }}
                                      >
                                        {tag}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </label>
                          );
                        })}
                        {eventActive && (
                          <button
                            type="button"
                            onClick={() => {
                              setFilters((prev) => ({ ...prev, attendedEventIds: undefined }));
                              setPage(0);
                            }}
                            style={{
                              marginTop: 6,
                              width: "100%",
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: "none",
                              background: "rgba(255,255,255,0.06)",
                              color: "rgba(255,255,255,0.7)",
                              fontSize: 11.5,
                              letterSpacing: "0.04em",
                              textTransform: "lowercase",
                              cursor: "pointer",
                            }}
                          >
                            clear selection
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </FilterGroup>

                <FilterGroup label="only dinner guests" active={dinnerActive} accent="#4ade80">
                  <SegmentedControl
                    value={dinnerActive ? "yes" : "no"}
                    options={[
                      { key: "no", label: "no" },
                      { key: "yes", label: "yes" },
                    ]}
                    accent="#4ade80"
                    onChange={(v) => {
                      setFilters((prev) => ({
                        ...prev,
                        hasDinner: v === "yes" ? true : undefined,
                      }));
                      setPage(0);
                    }}
                  />
                </FilterGroup>

                {tagVocabulary.length > 0 && (
                  <FilterGroup label="event vibe" active={tagsActive} accent="#fbbf24">
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.4)",
                        marginBottom: 8,
                        lineHeight: 1.5,
                      }}
                    >
                      guests of any event tagged with one of these.
                    </div>
                    <ChipCloud
                      items={tagVocabulary.map((t) => ({
                        key: t.tag,
                        label: t.tag,
                        count: t.count,
                      }))}
                      selected={filters.attendedEventTags || []}
                      onToggle={(tag) => {
                        const current = filters.attendedEventTags || [];
                        const key = String(tag);
                        const next = current.includes(key)
                          ? current.filter((t) => t !== key)
                          : [...current, key];
                        setFilters((prev) => ({
                          ...prev,
                          attendedEventTags: next.length ? next : undefined,
                        }));
                        setPage(0);
                      }}
                      accent="#fbbf24"
                      emptyLabel="No event tags yet — run auto-tag first."
                    />
                  </FilterGroup>
                )}
              </>
            );
          })()}
        </div>

        {/* Saved Views Tabs */}
        {savedViews.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                opacity: 0.7,
                marginRight: "8px",
              }}
            >
              Saved audiences:
            </span>
            {savedViews.map((view) => (
              <button
                key={view.id}
                onClick={() => setActiveView(view)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border:
                    activeView?.id === view.id
                      ? `1px solid ${colors.silverRgba}`
                      : "1px solid rgba(255,255,255,0.1)",
                  background:
                    activeView?.id === view.id
                      ? colors.silverRgbaHover
                      : "rgba(20, 16, 30, 0.4)",
                  color: "#fff",
                  fontSize: "12px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {view.name}
              </button>
            ))}
            <button
              onClick={handleSaveView}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: `1px solid ${colors.silverRgba}`,
                background: colors.silverRgbaHover,
                color: colors.silverText,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              + Save View
            </button>
          </div>
        )}
      </div>

      {/* CSV Import Modal */}
      {showImportModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={() => !importing && setShowImportModal(false)}
        >
          <div
            style={{
              background: "rgba(12, 10, 18, 0.95)",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "500px",
              width: "100%",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "20px",
                fontWeight: 600,
                marginBottom: "16px",
              }}
            >
              Import CSV
            </h2>
            <p
              style={{
                fontSize: "14px",
                opacity: 0.7,
                marginBottom: "20px",
              }}
            >
              Select a CSV file to import contacts. The file should have
              columns: Email, Name, and optionally Stripe customer data.
            </p>

            <input
              type="file"
              accept=".csv"
              onChange={(e) => setImportFile(e.target.files[0])}
              disabled={importing}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(20, 16, 30, 0.6)",
                color: "#fff",
                marginBottom: "16px",
                cursor: "pointer",
              }}
            />

            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  opacity: 0.7,
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Link to Event (Optional)
              </label>
              <input
                type="text"
                value={importEventUrl}
                onChange={(e) => setImportEventUrl(e.target.value)}
                placeholder="Event URL (e.g., https://pullup.se/e/event-slug) or Event ID"
                disabled={importing}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(20, 16, 30, 0.6)",
                  color: "#fff",
                  fontSize: "14px",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = colors.silverRgbaStrong;
                  e.target.style.background = "rgba(20, 16, 30, 0.8)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(255,255,255,0.1)";
                  e.target.style.background = "rgba(20, 16, 30, 0.6)";
                }}
              />
              <p
                style={{
                  fontSize: "11px",
                  opacity: 0.6,
                  marginTop: "6px",
                  marginBottom: 0,
                }}
              >
                Paste the event URL or event ID to automatically create RSVPs
                for all imported contacts
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                  setImportEventUrl("");
                }}
                disabled={importing}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(20, 16, 30, 0.6)",
                  color: "#fff",
                  fontSize: "14px",
                  cursor: importing ? "not-allowed" : "pointer",
                  opacity: importing ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleImportCsv}
                disabled={!importFile || importing}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "none",
                  background:
                    !importFile || importing
                      ? colors.silverRgba
                      : colors.gradientPrimary,
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: !importFile || importing ? "not-allowed" : "pointer",
                  opacity: importing ? 0.7 : 1,
                }}
              >
                {importing ? "Importing..." : "Import"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Top Row: Search and Actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "24px",
        }}
      >
        <input
          type="text"
          placeholder="Search name, email, IG, phone, company…"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(0); // Reset to first page on search
          }}
          style={{
            padding: "8px 16px",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(20, 16, 30, 0.6)",
            color: "#fff",
            fontSize: "14px",
            outline: "none",
            flex: "1 1 auto",
            minWidth: "200px",
            maxWidth: "400px",
            transition: "all 0.2s ease",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = colors.silverRgbaStrong;
            e.target.style.background = "rgba(20, 16, 30, 0.8)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "rgba(255,255,255,0.1)";
            e.target.style.background = "rgba(20, 16, 30, 0.6)";
          }}
        />

        <button
          style={{
            padding: "8px",
            borderRadius: "999px",
            border: `1px solid ${colors.silverRgba}`,
            background: colors.silverRgbaHover,
            color: colors.silverText,
            cursor: "default",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SilverIcon as={Search} size={16} />
        </button>

        {/* <button
            onClick={() => setShowImportModal(true)}
            className="import-csv-button"
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              background: "rgba(34, 197, 94, 0.1)",
              color: "#4ade80",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <SilverIcon as={Download} size={16} />
            Import CSV
          </button> */}

        <button
          onClick={async () => {
            try {
              // Build the same filter query used for the list, but without
              // pagination, so the export matches the current filtered view.
              const params = new URLSearchParams();
              if (searchQuery) params.append("search", searchQuery);
              if (
                filters.attendedEventIds &&
                Array.isArray(filters.attendedEventIds) &&
                filters.attendedEventIds.length > 0
              ) {
                params.append(
                  "attendedEventIds",
                  filters.attendedEventIds.join(","),
                );
              }
              if (
                filters.attendedEventTags &&
                Array.isArray(filters.attendedEventTags) &&
                filters.attendedEventTags.length > 0
              ) {
                params.append(
                  "attendedEventTags",
                  filters.attendedEventTags.join(","),
                );
              }
              if (filters.hasDinner !== undefined) {
                params.append("hasDinner", filters.hasDinner.toString());
              }

              const queryString =
                params.toString().length > 0 ? `?${params.toString()}` : "";

              const res = await authenticatedFetch(
                `/host/crm/people/export${queryString}`,
              );
              if (!res.ok) throw new Error("Export failed");
              const blob = await res.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `crm-contacts-${
                new Date().toISOString().split("T")[0]
              }.csv`;
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              document.body.removeChild(a);
              showToast(
                "Exported current filtered view to CSV successfully",
                "success",
              );
            } catch (err) {
              console.error(err);
              showToast("Failed to export CSV", "error");
            }
          }}
          className="export-csv-button"
          style={{
            padding: "8px 16px",
            borderRadius: "8px",
            border: `1px solid ${colors.silverRgba}`,
            background: colors.silverRgbaHover,
            color: colors.silverText,
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <SilverIcon as={Upload} size={16} />
          Export filtered CSV
        </button>
      </div>

      {/* People List */}
      {people.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 24px",
            opacity: 0.6,
          }}
        >
          <div
            style={{
              marginBottom: "16px",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <SilverIcon as={Users} size={48} />
          </div>
          <div
            style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}
          >
            {searchQuery || Object.keys(filters).length > 0
              ? "No contacts found"
              : "No contacts yet"}
          </div>
          <div style={{ fontSize: "14px", opacity: 0.7 }}>
            {searchQuery || Object.keys(filters).length > 0
              ? "Try adjusting your search or filters"
              : "Import a CSV file or wait for people to RSVP to your events"}
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              opacity: listLoading ? 0.55 : 1,
              transition: "opacity 0.18s ease",
              pointerEvents: listLoading ? "none" : "auto",
            }}
          >
            {people.map((person) => {
              const metrics = computePersonMetrics(person);
              const isExpanded = expandedPersonId === person.id;
              const details = personDetails[person.id] || {};

              return (
                <div
                  key={person.id}
                  style={{
                    padding: "18px 20px",
                    background: "rgba(20, 16, 30, 0.6)",
                    borderRadius: "16px",
                    border: "1px solid rgba(255,255,255,0.05)",
                    transition: "all 0.3s ease",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.borderColor = colors.silverRgba;
                    e.currentTarget.style.boxShadow =
                      "0 10px 30px rgba(0,0,0,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.borderColor =
                      "rgba(255,255,255,0.05)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  onClick={() => {
                    setExpandedPersonId((prev) =>
                      prev === person.id ? null : person.id,
                    );
                    if (!personDetails[person.id]) {
                      void loadPersonDetails(person.id);
                    }
                  }}
                >
                  {/* Collapsed header */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "16px",
                      flexWrap: "wrap",
                    }}
                  >
                    {/* Identity + last seen */}
                    <div style={{ flex: 1, minWidth: "180px" }}>
                      <div
                        style={{
                          fontSize: "16px",
                          fontWeight: 600,
                          marginBottom: "4px",
                          color: "#fff",
                        }}
                      >
                        {person.name || "Unnamed contact"}
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          opacity: 0.7,
                          marginBottom: "4px",
                          wordBreak: "break-word",
                        }}
                      >
                        {person.email}
                      </div>
                      <ContactStrip person={person} compact />
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "11px",
                          opacity: 0.65,
                        }}
                      >
                        <SilverIcon as={Clock} size={12} />
                        <span>
                          Last seen ·{" "}
                          {metrics.lastAttendedAt
                            ? formatDate(metrics.lastAttendedAt)
                            : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Golden Pull Up score */}
                    {metrics.pullUpScore !== null && (
                      <div
                        style={{
                          flex: "0 0 auto",
                          display: "flex",
                          justifyContent: "flex-end",
                        }}
                      >
                        <div
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: "999px",
                            border: "1px solid rgba(255, 215, 0, 0.35)",
                            background:
                              "radial-gradient(circle at 30% 0%, rgba(255,255,255,0.12), rgba(12,10,18,0.95))",
                            boxShadow:
                              "0 0 0 1px rgba(0,0,0,0.6), 0 10px 25px rgba(0,0,0,0.75)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "4px 6px",
                            transform: "translateY(0)",
                          }}
                        >
                          <div
                            style={{
                              background:
                                "linear-gradient(90deg, #FFD700 0%, #FFB200 40%, #FFF7AA 100%)",
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                              backgroundClip: "text",
                              fontWeight: 800,
                              letterSpacing: "0.01em",
                              textShadow: "0 2px 8px rgba(255, 215, 0, 0.28)",
                              fontSize: "18px",
                              lineHeight: 1,
                            }}
                          >
                            {metrics.pullUpScore}
                          </div>
                          <div
                            style={{
                              fontSize: "10px",
                              textTransform: "uppercase",
                              letterSpacing: "0.14em",
                              opacity: 0.8,
                              marginTop: "2px",
                              color: "rgba(255,255,255,0.85)",
                            }}
                          >
                            Pull Up
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div
                      style={{
                        marginTop: "14px",
                        paddingTop: "14px",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px",
                      }}
                    >
                      {/* Contact info (collected via event form_fields, or
                          filled in here by the host). Always shown so empty
                          contacts can be enriched manually. */}
                      <div>
                        <div
                          style={{
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.12em",
                            opacity: 0.55,
                            marginBottom: "8px",
                          }}
                        >
                          Contact
                        </div>
                        <EditableContact
                          person={person}
                          onSave={async (patch) => {
                            const res = await authenticatedFetch(
                              `/host/crm/people/${person.id}`,
                              {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(patch),
                              },
                            );
                            if (!res.ok) {
                              showToast("Failed to save", "error");
                              throw new Error("save failed");
                            }
                            const updated = await res.json();
                            setPeople((prev) =>
                              prev.map((p) =>
                                p.id === person.id ? { ...p, ...updated } : p,
                              ),
                            );
                          }}
                        />
                      </div>

                      {/* Notes timeline — dated observations, optionally tied
                          to the event they came up at. Event options are the
                          person's own attended events, so the dropdown is
                          "which walk", not the host's whole calendar. */}
                      <PersonNotes
                        notes={details.notes}
                        loading={details.loading}
                        eventOptions={(() => {
                          const seen = new Set();
                          const opts = [];
                          (person.eventHistory || []).forEach((h) => {
                            if (!h.eventId || seen.has(h.eventId)) return;
                            seen.add(h.eventId);
                            opts.push({
                              id: h.eventId,
                              title: h.eventTitle || "(untitled event)",
                              date: h.eventDate || null,
                            });
                          });
                          return opts;
                        })()}
                        onAdd={(payload) => addPersonNote(person.id, payload)}
                        onEdit={(noteId, payload) =>
                          editPersonNote(person.id, noteId, payload)
                        }
                        onDelete={(noteId) => removePersonNote(person.id, noteId)}
                      />

                      {/* All-time stats */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(160px, 1fr))",
                          gap: "10px",
                          fontSize: "13px",
                        }}
                      >
                        <div>
                          <div style={{ opacity: 0.7, marginBottom: "2px" }}>
                            Events
                          </div>
                          <div>
                            {metrics.eventsAttended} attended /{" "}
                            {metrics.eventsBooked} booked
                          </div>
                        </div>
                        <div>
                          <div style={{ opacity: 0.7, marginBottom: "2px" }}>
                            Guests
                          </div>
                          <div>
                            {metrics.guestsAttended} showed /{" "}
                            {metrics.guestsBooked} expected
                          </div>
                        </div>
                        <div>
                          <div style={{ opacity: 0.7, marginBottom: "2px" }}>
                            Dinners
                          </div>
                          <div>
                            {metrics.dinnersAttendedEvents} attended /{" "}
                            {metrics.dinnersBookedEvents} booked
                          </div>
                        </div>
                        <div>
                          <div style={{ opacity: 0.7, marginBottom: "2px" }}>
                            Dinner guests
                          </div>
                          <div>
                            {metrics.dinnerGuestsAttended} showed /{" "}
                            {metrics.dinnerGuestsBooked} booked
                          </div>
                        </div>
                        <div>
                          <div style={{ opacity: 0.7, marginBottom: "2px" }}>
                            Spend
                          </div>
                          <div>
                            {person.totalSpend > 0
                              ? formatCurrency(person.totalSpend)
                              : "—"}
                            {metrics.avgTicket && (
                              <span style={{ opacity: 0.7 }}>
                                {" "}
                                · Avg {formatCurrency(metrics.avgTicket)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div style={{ opacity: 0.7, marginBottom: "2px" }}>
                            Activity
                          </div>
                          <div>
                            {metrics.eventsLast12Months} events last 12 months
                          </div>
                        </div>
                      </div>

                      {/* Campaign history (from detailed touchpoints) */}
                      <div
                        style={{
                          fontSize: "12px",
                          opacity: 0.8,
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "8px",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              textTransform: "uppercase",
                              letterSpacing: "0.12em",
                              opacity: 0.7,
                            }}
                          >
                            Campaign history
                          </span>
                          {details.loading ? (
                            <span>Loading…</span>
                          ) : details.error ? (
                            <span style={{ color: "#f97373" }}>
                              {details.error}
                            </span>
                          ) : (
                            <>
                              <span>
                                {details.campaignsSent || 0} campaigns sent
                              </span>
                              <span style={{ opacity: 0.7 }}>
                                · Last{" "}
                                {details.lastCampaignAt
                                  ? formatDate(details.lastCampaignAt)
                                  : "—"}
                              </span>
                              <span style={{ opacity: 0.7 }}>
                                · Opens {details.openCount || 0} · Clicks{" "}
                                {details.clickCount || 0} · Bounces{" "}
                                {details.bounceCount || 0}
                              </span>
                            </>
                          )}
                        </div>

                        {!details.loading &&
                          !details.error &&
                          details.recentEmails &&
                          details.recentEmails.length > 0 && (
                            <div
                              style={{
                                marginTop: "4px",
                                paddingLeft: "2px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                              }}
                            >
                              {details.recentEmails.map((email) => (
                                <div
                                  key={email.id}
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "2px",
                                    fontSize: "11px",
                                    opacity: 0.85,
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      gap: "8px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        maxWidth: "70%",
                                      }}
                                    >
                                      <span style={{ fontWeight: 500 }}>
                                        {email.campaignName}
                                      </span>
                                      {email.subject && (
                                        <span style={{ opacity: 0.8 }}>
                                          {" "}
                                          · {email.subject}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ opacity: 0.7 }}>
                                      {email.sentAt
                                        ? formatDate(email.sentAt)
                                        : "—"}
                                    </div>
                                  </div>
                                  <div style={{ opacity: 0.7 }}>
                                    {(() => {
                                      const statusStr = (email.status || "")
                                        .toLowerCase();
                                      let statusLabel = "Sent";
                                      if (email.clickedAt) statusLabel = "Clicked";
                                      else if (email.openedAt)
                                        statusLabel = "Opened";
                                      else if (email.deliveredAt)
                                        statusLabel = "Delivered";
                                      else if (
                                        statusStr.includes("bounce") ||
                                        statusStr.includes("failed") ||
                                        statusStr.includes("error")
                                      ) {
                                        statusLabel = "Bounced / failed";
                                      }

                                      const opens = email.openedAt ? 1 : 0;
                                      const clicks = email.clickedAt ? 1 : 0;
                                      const bounces =
                                        statusStr.includes("bounce") ||
                                        statusStr.includes("failed") ||
                                        statusStr.includes("error")
                                          ? 1
                                          : 0;

                                      return `${statusLabel} · Opens ${opens} · Clicks ${clicks} · Bounces ${bounces}`;
                                    })()}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                      </div>

                      {/* Event history preview */}
                      <div>
                        {(() => {
                          const history = person.eventHistory || [];
                          if (history.length === 0) {
                            return (
                              <>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.1em",
                                    opacity: 0.7,
                                    marginBottom: "8px",
                                  }}
                                >
                                  Event history
                                </div>
                                <div
                                  style={{
                                    fontSize: "13px",
                                    opacity: 0.5,
                                    fontStyle: "italic",
                                  }}
                                >
                                  No events yet
                                </div>
                              </>
                            );
                          }

                          const now = new Date();
                          const upcoming = [];
                          const past = [];

                          history.forEach((h) => {
                            const eventDate = h.eventDate
                              ? new Date(h.eventDate)
                              : null;
                            const status = h.attendanceStatus || h.status;
                            const isAttendingFuture =
                              eventDate &&
                              eventDate >= now &&
                              (status === "attended" ||
                                status === "CONFIRMED" ||
                                status === "attending" ||
                                status === "confirmed");

                            if (isAttendingFuture) {
                              upcoming.push(h);
                            } else {
                              past.push(h);
                            }
                          });

                          // Sort upcoming by soonest first
                          upcoming.sort((a, b) => {
                            const da = a.eventDate ? new Date(a.eventDate) : 0;
                            const db = b.eventDate ? new Date(b.eventDate) : 0;
                            return da - db;
                          });

                          const showAllEvents =
                            !!showAllEventsByPerson[person.id];
                          const visiblePast = showAllEvents
                            ? past
                            : past.slice(0, 3);
                          const hasMorePast = past.length > 3;

                          const renderEventRow = (item) => {
                            const status = item.attendanceStatus || item.status;
                            const isAttended =
                              status === "attended" ||
                              status === "CONFIRMED" ||
                              status === "attending";
                            const isConfirmed =
                              !isAttended &&
                              (status === "confirmed" ||
                                status === "CONFIRMED");

                            return (
                              <div
                                key={item.rsvpId}
                                style={{
                                  padding: "12px",
                                  background: "rgba(12, 10, 18, 0.4)",
                                  borderRadius: "8px",
                                  fontSize: "13px",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      opacity: 0.8,
                                    }}
                                  >
                                    {isAttended ? (
                                      <SilverIcon as={Check} size={16} />
                                    ) : isConfirmed ? (
                                      <SilverIcon as={FileEdit} size={16} />
                                    ) : (
                                      <SilverIcon as={Clock} size={16} />
                                    )}
                                  </span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div
                                      style={{
                                        fontWeight: 600,
                                        marginBottom: "4px",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {item.eventTitle}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        opacity: 0.6,
                                        marginBottom: "4px",
                                      }}
                                    >
                                      {formatEventDate(item.eventDate)}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        opacity: 0.75,
                                      }}
                                    >
                                      Party{" "}
                                      {(item.cocktailsBooked || 0) +
                                        (item.dinnerBooked || 0)}{" "}
                                      booked ·{" "}
                                      {(item.cocktailsAttended || 0) +
                                        (item.dinnerAttended || 0)}{" "}
                                      attended
                                    </div>
                                    {item.dinnerBooked > 0 && (
                                      <div
                                        style={{
                                          fontSize: "11px",
                                          opacity: 0.75,
                                          marginTop: "2px",
                                        }}
                                      >
                                        Dinner {item.dinnerAttended || 0} /{" "}
                                        {item.dinnerBooked}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          };

                          return (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "10px",
                              }}
                            >
                              {upcoming.length > 0 && (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "8px",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: 600,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.1em",
                                      opacity: 0.7,
                                      marginBottom: "4px",
                                    }}
                                  >
                                    Upcoming events
                                  </div>
                                  {upcoming.map((item) => renderEventRow(item))}
                                </div>
                              )}

                              {past.length > 0 && (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "8px",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: 600,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.1em",
                                      opacity: 0.7,
                                      marginBottom: "4px",
                                    }}
                                  >
                                    Event history
                                  </div>
                                  {visiblePast.map((item) =>
                                    renderEventRow(item),
                                  )}
                                  {hasMorePast && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowAllEventsByPerson((prev) => ({
                                          ...prev,
                                          [person.id]: !showAllEvents,
                                        }));
                                      }}
                                      style={{
                                        alignSelf: "flex-start",
                                        marginTop: "2px",
                                        fontSize: "12px",
                                        color: colors.silverText,
                                        background: "transparent",
                                        border: "none",
                                        padding: 0,
                                        cursor: "pointer",
                                        opacity: 0.75,
                                      }}
                                    >
                                      {showAllEvents
                                        ? "Show fewer events"
                                        : "Show more events"}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Footer: First seen */}
                      <div
                        style={{
                          paddingTop: "8px",
                          borderTop: "1px solid rgba(255,255,255,0.05)",
                          fontSize: "12px",
                          opacity: 0.5,
                        }}
                      >
                        First seen: {formatDate(person.createdAt)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "12px",
                marginTop: "24px",
              }}
            >
              <button
                onClick={() =>
                  hasPrevPage && setPage((p) => Math.max(0, p - 1))
                }
                disabled={!hasPrevPage || loading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: `1px solid ${colors.silverRgba}`,
                  background: hasPrevPage
                    ? colors.silverRgbaHover
                    : "rgba(255, 255, 255, 0.05)",
                  color: hasPrevPage
                    ? colors.silverText
                    : "rgba(255, 255, 255, 0.4)",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: !hasPrevPage || loading ? "not-allowed" : "pointer",
                  opacity: !hasPrevPage || loading ? 0.6 : 1,
                }}
              >
                Previous
              </button>
              <span
                style={{
                  fontSize: "13px",
                  opacity: 0.7,
                }}
              >
                Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
              </span>
              <button
                onClick={() => hasNextPage && setPage((p) => p + 1)}
                disabled={!hasNextPage || loading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: `1px solid ${colors.silverRgba}`,
                  background: hasNextPage
                    ? colors.silverRgbaHover
                    : "rgba(255, 255, 255, 0.05)",
                  color: hasNextPage
                    ? colors.silverText
                    : "rgba(255, 255, 255, 0.4)",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: !hasNextPage || loading ? "not-allowed" : "pointer",
                  opacity: !hasNextPage || loading ? 0.6 : 1,
                }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatBadge({ label, value, icon, color = "#c0c0c0" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px",
        borderRadius: "8px",
        background: `${color}15`,
        border: `1px solid ${color}30`,
        fontSize: "12px",
      }}
    >
      <span>{icon}</span>
      <span style={{ fontWeight: 600, opacity: 0.9 }}>{value}</span>
      <span style={{ opacity: 0.7, fontSize: "11px" }}>{label}</span>
    </div>
  );
}

// Derive all-time stats + Pull Up score for a person
function computePersonMetrics(person) {
  const history = person.eventHistory || [];

  const eventsBooked = history.length;
  const eventsAttended = history.filter((h) => {
    const status = h.attendanceStatus || h.status;
    return (
      status === "attended" || status === "CONFIRMED" || status === "attending"
    );
  }).length;

  let guestsBooked = 0;
  let guestsAttended = 0;
  let dinnersBookedEvents = 0;
  let dinnersAttendedEvents = 0;
  let dinnerGuestsBooked = 0;
  let dinnerGuestsAttended = 0;
  let lastAttendedAt = null;
  let eventsLast12Months = 0;

  const now = new Date();
  const twelveMonthsAgo = new Date(
    now.getFullYear() - 1,
    now.getMonth(),
    now.getDate(),
  );

  history.forEach((h) => {
    const date = h.eventDate ? new Date(h.eventDate) : null;

    const booked =
      (h.cocktailsBooked || 0) + (h.dinnerBooked || 0) + (h.plusOnes || 0);
    const attended =
      (h.cocktailsAttended || 0) +
      (h.dinnerAttended || 0) +
      (h.plusOnesAttended || 0);

    guestsBooked += booked;
    guestsAttended += attended;

    if (h.dinnerBooked > 0) {
      dinnersBookedEvents += 1;
      dinnerGuestsBooked += h.dinnerBooked || 0;
    }
    if (h.dinnerAttended > 0) {
      dinnersAttendedEvents += 1;
      dinnerGuestsAttended += h.dinnerAttended || 0;
    }

    const status = h.attendanceStatus || h.status;
    if (
      (status === "attended" ||
        status === "CONFIRMED" ||
        status === "attending") &&
      date
    ) {
      if (!lastAttendedAt || date > new Date(lastAttendedAt)) {
        lastAttendedAt = date.toISOString();
      }
      if (date >= twelveMonthsAgo) {
        eventsLast12Months += 1;
      }
    }
  });

  const payments = person.paymentCount || 0;
  const totalSpend = person.totalSpend || 0;
  const avgTicket = payments > 0 ? totalSpend / payments : null;

  const attendanceRate =
    eventsBooked > 0 ? eventsAttended / eventsBooked : null;
  const guestRate = guestsBooked > 0 ? guestsAttended / guestsBooked : null;
  const dinnerRate =
    dinnerGuestsBooked > 0 ? dinnerGuestsAttended / dinnerGuestsBooked : null;

  let score = 0;
  if (attendanceRate != null) score += attendanceRate * 40;
  if (guestRate != null) score += guestRate * 30;
  if (dinnerRate != null) score += dinnerRate * 20;

  // Light bonus from spend (0–10 range)
  if (totalSpend > 0) {
    const spendK = totalSpend / 100_000; // assume cents; 100k = 1,000 SEK
    const spendBonus = Math.min(10, spendK * 2);
    score += spendBonus;
  }

  const pullUpScore =
    score > 0 ? Math.max(1, Math.min(100, Math.round(score))) : null;

  return {
    eventsBooked,
    eventsAttended,
    guestsBooked,
    guestsAttended,
    dinnersBookedEvents,
    dinnersAttendedEvents,
    dinnerGuestsBooked,
    dinnerGuestsAttended,
    lastAttendedAt,
    eventsLast12Months,
    avgTicket,
    pullUpScore,
  };
}
