// EventCardBlockEditor — inline filter UX. No modal: a search input plus
// a date-range chip live at the top of the block. Typing into search
// opens a scrollable dropdown of matching events; picking a date range
// auto-adds every event whose start falls inside it. Selected events
// stack below with thumbnail + title + reorder/remove controls.
//
// One block can hold up to 12 events (server-validated). Backwards
// compatible with the legacy single-event block shape — first edit
// migrates into the new `events: []` shape.

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, MapPin, Music2, Trash2, Search, Check, Pencil, X, User, LayoutPanelTop, Columns2, LayoutList } from "lucide-react";
import { authenticatedFetch } from "../../../lib/api.js";
import { DateRangePicker } from "../../DateRangePicker.jsx";
import { colors } from "../../../theme/colors.js";

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Quick ranges that cover the most useful "what's on" windows. Past +
// upcoming both supported so admin can build retrospective recap emails
// or upcoming-events promos.
const EVENT_QUICK_RANGES = [
  {
    label: "Upcoming week",
    getRange: () => {
      const start = startOfDay(new Date());
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return [start, end];
    },
  },
  {
    label: "Upcoming 2 weeks",
    getRange: () => {
      const start = startOfDay(new Date());
      const end = new Date(start);
      end.setDate(end.getDate() + 14);
      return [start, end];
    },
  },
  {
    label: "Upcoming month",
    getRange: () => {
      const start = startOfDay(new Date());
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      return [start, end];
    },
  },
  {
    label: "Past week",
    getRange: () => {
      const end = startOfDay(new Date());
      const start = new Date(end);
      start.setDate(start.getDate() - 7);
      return [start, end];
    },
  },
  {
    label: "Past month",
    getRange: () => {
      const end = startOfDay(new Date());
      const start = new Date(end);
      start.setMonth(start.getMonth() - 1);
      return [start, end];
    },
  },
];

function normalizeEvents(block) {
  if (Array.isArray(block.events)) return block.events;
  if (block.title) {
    return [
      {
        eventId: block.eventId,
        title: block.title,
        imageUrl: block.imageUrl,
        startsAt: block.startsAt,
        location: block.location,
        url: block.url,
        spotifyUrl: block.spotifyUrl,
      },
    ];
  }
  return [];
}

function toEventEntry(ev) {
  return {
    eventId: ev.id,
    title: ev.title,
    imageUrl: ev.imageUrl,
    startsAt: ev.startsAt,
    location: ev.location,
    url: ev.url,
    spotifyUrl: ev.spotifyUrl,
    hostedBy: ev.hostedBy || null,
  };
}

const MAX_EVENTS = 12;

export default function EventCardBlockEditor({ block, onChange }) {
  const source = block.type === "discover_event" ? "discover" : "pullup";
  const events = normalizeEvents(block);
  const selectedIds = useMemo(
    () => new Set(events.map((e) => e.eventId).filter(Boolean)),
    [events],
  );

  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  // Tag filter: OR semantics. Multiple selected tags broaden the result
  // set so admin can build "all dinner OR all art" emails fast.
  const [activeTags, setActiveTags] = useState([]);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authenticatedFetch(`/admin/email/event-options?source=${source}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setAllEvents(d?.events || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  // Close the search dropdown on outside click so it doesn't trap focus.
  useEffect(() => {
    if (!searchOpen) return;
    function onClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [searchOpen]);

  const layout = block.layout || "big";

  function setEvents(next) {
    onChange({
      type: block.type,
      layout,
      events: next.slice(0, MAX_EVENTS),
    });
  }

  function setLayout(next) {
    onChange({ type: block.type, layout: next, events });
  }

  function toggleEvent(ev) {
    if (selectedIds.has(ev.id)) {
      setEvents(events.filter((e) => e.eventId !== ev.id));
    } else {
      setEvents([...events, toEventEntry(ev)]);
    }
  }

  function applyDateRange(start, end) {
    if (!start || !end) return;
    const startTs = start.getTime();
    const endTs = end.getTime();
    const matches = allEvents.filter((ev) => {
      if (!ev.startsAt) return false;
      const t = new Date(ev.startsAt).getTime();
      return t >= startTs && t <= endTs;
    });
    const toAdd = matches
      .filter((ev) => !selectedIds.has(ev.id))
      .map(toEventEntry);
    if (toAdd.length === 0) return;
    setEvents([...events, ...toAdd]);
  }

  function removeAt(idx) {
    setEvents(events.filter((_, i) => i !== idx));
  }

  function moveAt(idx, delta) {
    const target = idx + delta;
    if (target < 0 || target >= events.length) return;
    const copy = [...events];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    setEvents(copy);
  }

  // Aggregate the most-used tags across the loaded events for the filter
  // chip cloud. Cap at 12 to keep the chip row tight.
  const tagCloud = useMemo(() => {
    const counts = {};
    for (const ev of allEvents) {
      for (const t of ev.tags || []) counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag, count]) => ({ tag, count }));
  }, [allEvents]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let pool = allEvents;
    if (activeTags.length > 0) {
      const tagSet = new Set(activeTags);
      pool = pool.filter((ev) => (ev.tags || []).some((t) => tagSet.has(t)));
    }
    if (!q) return pool.slice(0, 50);
    return pool
      .filter((ev) =>
        [ev.title, ev.location]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 50);
  }, [allEvents, searchQuery, activeTags]);

  function toggleTag(tag) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
    setSearchOpen(true);
  }

  const atCap = events.length >= MAX_EVENTS;

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Layout toggle — sits above the filter bar so admin sets the
          visual shape of the section first, then picks which events
          fill it. Three options:
            big    — one full-width card per event (default)
            grid2  — two compact cards per row
            list   — horizontal thumbnail row, very dense */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          borderRadius: 999,
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          alignSelf: "flex-start",
        }}
      >
        <LayoutOption
          icon={LayoutPanelTop}
          label="Big"
          active={layout === "big"}
          onClick={() => setLayout("big")}
        />
        <LayoutOption
          icon={Columns2}
          label="2 per row"
          active={layout === "grid2"}
          onClick={() => setLayout("grid2")}
        />
        <LayoutOption
          icon={LayoutList}
          label="Thumbnail list"
          active={layout === "list"}
          onClick={() => setLayout("list")}
        />
      </div>

      {/* Filter bar — search on the left, date range chip on the right */}
      <div
        style={{
          position: "relative",
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 10px",
            borderRadius: 10,
            background: "#fff",
            border: searchOpen
              ? `1px solid ${colors.secondaryBorder}`
              : `1px solid ${colors.border}`,
            transition: "border-color 0.15s",
          }}
        >
          <Search size={13} style={{ color: colors.textFaded, flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            placeholder={
              loading
                ? "Loading events…"
                : source === "discover"
                  ? "Search discover events…"
                  : "Search PullUp events…"
            }
            disabled={loading || atCap}
            style={{
              flex: 1,
              minWidth: 0,
              border: "none",
              background: "transparent",
              outline: "none",
              color: colors.text,
              fontSize: 12.5,
            }}
          />
        </div>
        <InlineDateRangeButton
          disabled={loading || atCap}
          onApply={applyDateRange}
        />
      </div>

      {/* Tag filter chips — only render when there are tags to show.
          Click toggles the tag in/out; multiple selected = OR. Visible
          alongside the search bar so admin can combine search + tags
          + date freely. */}
      {searchOpen && tagCloud.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 9.5,
              color: colors.textFaded,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginRight: 2,
            }}
          >
            Tags:
          </span>
          {tagCloud.map(({ tag, count }) => {
            const active = activeTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: active
                    ? `1px solid ${colors.accentBorder}`
                    : `1px solid ${colors.border}`,
                  background: active ? colors.accentSoft : "transparent",
                  color: active ? colors.accent : colors.textSubtle,
                  whiteSpace: "nowrap",
                }}
              >
                {tag} <span style={{ opacity: 0.5 }}>{count}</span>
              </button>
            );
          })}
          {activeTags.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTags([])}
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 500,
                cursor: "pointer",
                border: `1px solid ${colors.border}`,
                background: "transparent",
                color: colors.textSubtle,
              }}
            >
              clear
            </button>
          )}
        </div>
      )}

      {/* Search dropdown */}
      {searchOpen && !atCap && (
        <div
          style={{
            maxHeight: 280,
            overflowY: "auto",
            borderRadius: 10,
            border: `1px solid ${colors.border}`,
            background: "#fff",
            boxShadow: "0 8px 30px rgba(10,10,10,0.08)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            padding: 4,
          }}
        >
          {searchResults.length === 0 ? (
            <div
              style={{
                padding: "16px 8px",
                fontSize: 12,
                color: colors.textSubtle,
                textAlign: "center",
              }}
            >
              {searchQuery ? "No matches." : "No events available."}
            </div>
          ) : (
            searchResults.map((ev) => (
              <SearchResultRow
                key={ev.id}
                ev={ev}
                selected={selectedIds.has(ev.id)}
                onToggle={() => toggleEvent(ev)}
              />
            ))
          )}
        </div>
      )}

      {/* Selected event rows */}
      {events.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {events.map((ev, idx) => (
            <SelectedEventRow
              key={`${ev.eventId || idx}-${idx}`}
              ev={ev}
              isFirst={idx === 0}
              isLast={idx === events.length - 1}
              onMoveUp={() => moveAt(idx, -1)}
              onMoveDown={() => moveAt(idx, 1)}
              onRemove={() => removeAt(idx)}
              onPatch={(patch) => {
                const copy = [...events];
                copy[idx] = { ...copy[idx], ...patch };
                setEvents(copy);
              }}
            />
          ))}
        </div>
      )}

      {atCap && (
        <div
          style={{
            fontSize: 11,
            color: colors.warning,
            textAlign: "center",
            padding: "4px 0",
          }}
        >
          Section is at the {MAX_EVENTS}-event cap. Remove one to add more.
        </div>
      )}
    </div>
  );
}

// Date range chip — wraps DateRangePicker so it pops up on click and
// auto-applies the selected range to the parent block. We piggyback on
// the existing component's calendar UX so admin can also build custom
// ranges, not just the quick presets.
function InlineDateRangeButton({ disabled, onApply }) {
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);

  function handleChange(s, e) {
    setStart(s);
    setEnd(e);
    if (s && e) onApply(s, e);
    // Reset shortly after so the chip label resets and admin can apply
    // another range to add more events.
    setTimeout(() => {
      setStart(null);
      setEnd(null);
    }, 50);
  }

  return (
    <div style={{ flexShrink: 0, opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      <DateRangePicker
        startDate={start}
        endDate={end}
        onChange={handleChange}
        allowPast
        blockFuture={false}
        quickRanges={EVENT_QUICK_RANGES}
      />
    </div>
  );
}

function SearchResultRow({ ev, selected, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: "flex",
        width: "100%",
        flexShrink: 0,
        textAlign: "left",
        background: selected ? colors.secondarySoft : "transparent",
        border: selected
          ? `1px solid ${colors.secondaryBorder}`
          : "1px solid transparent",
        borderRadius: 8,
        padding: 0,
        cursor: "pointer",
        alignItems: "stretch",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = colors.surface;
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = "transparent";
      }}
    >
      <div
        style={{
          width: 44,
          minWidth: 44,
          height: 44,
          background: colors.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {ev.imageUrl ? (
          <img
            src={ev.imageUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Calendar size={14} color={colors.textFaded} />
        )}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: "6px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 1,
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: colors.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {ev.title}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: colors.textSubtle,
            display: "flex",
            gap: 8,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {ev.startsAt && <span>{formatDate(ev.startsAt)}</span>}
          {ev.location && (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {ev.location}
            </span>
          )}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          color: selected ? colors.secondary : colors.textFaded,
        }}
      >
        {selected ? <Check size={14} /> : <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>}
      </div>
    </button>
  );
}

function SelectedEventRow({ ev, isFirst, isLast, onMoveUp, onMoveDown, onRemove, onPatch }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch" }}>
      <div
        style={{
          width: 56,
          minWidth: 56,
          height: 56,
          background: colors.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {ev.imageUrl ? (
          <img
            src={ev.imageUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Calendar size={16} color={colors.textFaded} />
        )}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: colors.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {ev.title || "Untitled"}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: colors.textSubtle,
            display: "flex",
            gap: 8,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {ev.startsAt && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <Calendar size={9} /> {formatDate(ev.startsAt)}
            </span>
          )}
          {ev.location && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              <MapPin size={9} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {ev.location.length > 18 ? `${ev.location.slice(0, 18)}…` : ev.location}
              </span>
            </span>
          )}
          {ev.spotifyUrl && (
            <span style={{ color: "#1DB954", display: "inline-flex" }}>
              <Music2 size={9} />
            </span>
          )}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          padding: "6px 4px",
          justifyContent: "center",
          alignItems: "center",
          borderLeft: `1px solid ${colors.borderFaint}`,
        }}
      >
        <button type="button" onClick={onMoveUp} disabled={isFirst} style={miniBtn(isFirst)} aria-label="Move up">
          ▲
        </button>
        <button type="button" onClick={onMoveDown} disabled={isLast} style={miniBtn(isLast)} aria-label="Move down">
          ▼
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", padding: "0 6px", gap: 2 }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            ...editChevronBtn,
            color: expanded ? colors.secondary : colors.secondaryBorder,
          }}
          aria-label={expanded ? "Close editor" : "Edit details"}
          title={expanded ? "Close editor" : "Edit details"}
        >
          {expanded ? <X size={13} /> : <Pencil size={12} />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          style={removeBtn}
          aria-label="Remove event"
          title="Remove"
        >
          <Trash2 size={12} />
        </button>
      </div>
      </div>

      {expanded && (
        <div
          style={{
            borderTop: `1px solid ${colors.border}`,
            padding: "10px 12px 12px",
            background: colors.surface,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <InlineField
            icon={User}
            label="Hosted by"
            value={ev.hostedBy || ""}
            placeholder="Not set"
            onChange={(v) => onPatch({ hostedBy: v || null })}
          />
          <InlineField
            icon={Music2}
            iconColor="#1DB954"
            label="Spotify link"
            value={ev.spotifyUrl || ""}
            placeholder="https://open.spotify.com/..."
            onChange={(v) => onPatch({ spotifyUrl: v || null })}
          />
        </div>
      )}
    </div>
  );
}

function LayoutOption({ icon: Icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 10px",
        borderRadius: 999,
        border: "none",
        background: active ? colors.accentSoft : "transparent",
        color: active ? colors.accent : colors.textSubtle,
        fontSize: 11,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.12s ease",
      }}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

function InlineField({ icon: Icon, iconColor, label, value, placeholder, onChange }) {
  return (
    <label style={{ display: "block" }}>
      <div
        style={{
          fontSize: 9.5,
          color: colors.textSubtle,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 3,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {Icon && <Icon size={9} color={iconColor || colors.textSubtle} />}
        {label}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "6px 10px",
          borderRadius: 6,
          border: `1px solid ${colors.border}`,
          background: "#fff",
          color: colors.text,
          fontSize: 11.5,
          outline: "none",
        }}
      />
    </label>
  );
}

const miniBtn = (disabled) => ({
  background: "none",
  border: "none",
  color: disabled ? colors.borderStrong : colors.textSubtle,
  cursor: disabled ? "default" : "pointer",
  padding: 0,
  fontSize: 9,
  lineHeight: 1,
  width: 16,
  height: 14,
});

const removeBtn = {
  background: "none",
  border: "none",
  color: colors.danger,
  cursor: "pointer",
  padding: 4,
  display: "inline-flex",
  alignItems: "center",
};

const editChevronBtn = {
  background: "none",
  border: "none",
  color: colors.textSubtle,
  cursor: "pointer",
  padding: 4,
  display: "inline-flex",
  alignItems: "center",
};
