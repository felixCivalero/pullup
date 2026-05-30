// EventPickerModal — pick from PullUp's own events OR the discover (scraped)
// event pool to embed as a card in the admin email composer. Mirrors the
// look-and-feel of ImagePickerModal so the "click and add" pattern feels
// consistent across block types.

import { useEffect, useState, useMemo } from "react";
import { Search, X, Calendar, MapPin, Music2 } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { colors } from "../../theme/colors.js";

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

// Compact horizontal row — small square thumbnail + title + meta. Fixed
// 56px square keeps the list scan-friendly and immune to layout edge cases.
function PickerCard({ ev, onPick }) {
  const [hover, setHover] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = ev.imageUrl && !imgFailed;

  return (
    <button
      type="button"
      onClick={() => onPick(ev)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        width: "100%",
        textAlign: "left",
        background: hover ? colors.secondarySoft : "#fff",
        border: hover
          ? `1px solid ${colors.secondaryBorder}`
          : `1px solid ${colors.border}`,
        borderRadius: 8,
        overflow: "hidden",
        cursor: "pointer",
        padding: 0,
        transition: "all 0.12s ease",
        alignItems: "stretch",
        gap: 0,
        // Critical: keep our natural height even when the parent flex
        // column has more items than fit. Without this, default
        // flex-shrink:1 squashes every row to fit, then the panel just
        // looks like a stack of thin lines.
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 56,
          minWidth: 56,
          height: 56,
          background: colors.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {showImage ? (
          <img
            src={ev.imageUrl}
            alt=""
            onError={() => setImgFailed(true)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <Calendar size={18} color={colors.textFaded} />
        )}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: colors.text,
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {ev.title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: colors.textSubtle,
            display: "flex",
            gap: 10,
            alignItems: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {ev.startsAt && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <Calendar size={10} /> {formatDate(ev.startsAt)}
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
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              <MapPin size={10} />{" "}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {ev.location}
              </span>
            </span>
          )}
          {ev.spotifyUrl && (
            <span
              style={{ color: "#1DB954", display: "inline-flex" }}
              title="Has Spotify link"
            >
              <Music2 size={10} />
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function EventPickerModal({ source, onClose, onPick }) {
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authenticatedFetch(`/admin/email/event-options?source=${source}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setEvents(d?.events || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) =>
      [e.title, e.location].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [events, query]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(10,10,10,0.55)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 760,
          maxHeight: "85vh",
          background: "#fff",
          border: `1px solid ${colors.border}`,
          borderRadius: 16,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          boxShadow: "0 8px 30px rgba(10,10,10,0.10)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color: source === "discover" ? colors.secondary : colors.accent,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 600,
                marginBottom: 2,
              }}
            >
              {source === "discover" ? "Discover events" : "PullUp events"}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: colors.text }}>
              Pick an event to embed
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: colors.textSubtle,
              cursor: "pointer",
              padding: 4,
            }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderRadius: 10,
            background: colors.surface,
            border: `1px solid ${colors.border}`,
          }}
        >
          <Search size={14} style={{ color: colors.textFaded }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or location"
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              outline: "none",
              color: colors.text,
              fontSize: 14,
            }}
          />
        </div>

        {/* Compact list — small square thumbnail + title + meta on each
            row. Much denser than the card grid so admin can scan a long
            list of events quickly. */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            paddingRight: 4,
          }}
        >
          {loading ? (
            <div
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                padding: "32px 0",
                color: colors.textSubtle,
                fontSize: 13,
              }}
            >
              Loading events…
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                padding: "32px 0",
                color: colors.textSubtle,
                fontSize: 13,
              }}
            >
              {query ? "No matches." : "No events available."}
            </div>
          ) : (
            filtered.map((ev) => (
              <PickerCard key={ev.id} ev={ev} onPick={onPick} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
