// CoachActions — the one-tap action strip.
//
// Renders 1–3 contextually-suggested buttons powered by the same suggestion
// engine that produces the MCP banner's "Next:" line. Each button is the
// AI's recommendation rendered as a tap target rather than chat text.
//
// Pure presentation + dispatch: fetches /host/coach/actions for the current
// surface, renders the items, routes/opens-modal on tap. Buttons are
// non-destructive in v1 (navigate-only); the destructive-coach UX comes
// later once send/publish/delete intents are wired in.

import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles, ChevronRight, X } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";

// When the intent's destination is the page the host is already on, clicking
// would re-route to the same screen and look broken. Treat those as
// informational chips instead — the headline + why still helps; the chevron
// goes away so the affordance reads as "advice, not action".
function isSelfPage(intent, currentPath) {
  if (intent?.type !== "navigate" || !intent.url) return false;
  const target = intent.url.split("?")[0];
  return target === currentPath;
}

// Per-(surface, id) dismiss state, scoped to the browser session. Hosts who
// dismiss the widget on one page won't see it again until they open a new
// tab. Cross-tab persistence would be too aggressive — the AI might do
// something fresh and we'd want the widget back.
function getDismissKey(surface, id) {
  return `coach-dismissed:${surface || "_"}:${id || "_"}`;
}
function readDismissed(surface, id) {
  try {
    return sessionStorage.getItem(getDismissKey(surface, id)) === "1";
  } catch {
    return false;
  }
}
function writeDismissed(surface, id) {
  try {
    sessionStorage.setItem(getDismissKey(surface, id), "1");
  } catch {
    // sessionStorage may be unavailable (private mode, etc.) — silently noop.
  }
}

/**
 * @param {object} props
 * @param {'event'|'campaign'|'crm'} props.surface
 * @param {string} [props.id]          Resource id/slug (required for event + campaign)
 * @param {number} [props.limit]       Max buttons to render. Default 3.
 * @param {boolean} [props.compact]    Use a tighter single-line layout (for HostBar / inline use).
 */
export function CoachActions({ surface, id, limit = 3, compact = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState(null); // null = loading, [] = no actions
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(() => readDismissed(surface, id));

  function handleDismiss() {
    writeDismissed(surface, id);
    setDismissed(true);
  }

  useEffect(() => {
    if (!surface) return;
    if ((surface === "event" || surface === "campaign") && !id) return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ surface, limit: String(limit) });
        if (id) params.set("id", id);
        const res = await authenticatedFetch(`/host/coach/actions?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setItems(data.items || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [surface, id, limit]);

  function dispatch(intent) {
    if (!intent) return;
    if (intent.type === "navigate" && intent.url) {
      navigate(intent.url);
    }
    // 'modal' and 'mcp' intents are stubs for now — the backend won't emit
    // them in v1, but the dispatcher is shaped to accept them when added.
  }

  if (error || !items || items.length === 0 || dismissed) return null;

  const containerStyle = compact ? compactContainer : container;
  const rowStyle = compact ? compactRow : row;

  return (
    <div style={containerStyle}>
      {!compact ? (
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={13} style={{ opacity: 0.7 }} />
            <span>What's next</span>
          </div>
          <button type="button" onClick={handleDismiss} style={dismissBtn} title="Hide for this session">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleDismiss}
          style={{ ...dismissBtn, alignSelf: "center" }}
          title="Hide for this session"
        >
          <X size={13} />
        </button>
      )}
      <div style={rowStyle}>
        {items.map((it) => {
          const isInfo = isSelfPage(it.intent, location.pathname);
          const Tag = isInfo ? "div" : "button";
          const tagProps = isInfo
            ? {}
            : { type: "button", onClick: () => dispatch(it.intent) };
          return (
            <Tag
              key={it.key}
              {...tagProps}
              style={
                isInfo
                  ? (compact ? compactInfo : info)
                  : (compact ? compactButton : button)
              }
              title={it.why || it.headline}
            >
              <span style={compact ? compactHeadline : headline}>{it.headline}</span>
              {!compact && it.why && <span style={why}>{it.why}</span>}
              {!isInfo && (
                <ChevronRight size={14} style={{ opacity: 0.55, alignSelf: "center" }} />
              )}
            </Tag>
          );
        })}
      </div>
    </div>
  );
}

// ─── styles ─────────────────────────────────────────────────────────

const container = {
  width: "100%",
  maxWidth: 720,
  margin: "0 auto 20px",
  padding: "14px 16px 16px",
  borderRadius: 14,
  background: "rgba(20,16,30,0.55)",
  border: "1px solid rgba(255,255,255,0.06)",
  backdropFilter: "blur(10px)",
};

const header = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.7,
  color: "rgba(255,255,255,0.55)",
  marginBottom: 10,
};

const dismissBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  padding: 0,
  borderRadius: 999,
  border: "1px solid transparent",
  background: "transparent",
  color: "rgba(255,255,255,0.45)",
  cursor: "pointer",
};

const row = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const button = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gridTemplateRows: "auto auto",
  rowGap: 2,
  columnGap: 12,
  alignItems: "start",
  textAlign: "left",
  padding: "12px 14px",
  borderRadius: 11,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
  color: "#fff",
  cursor: "pointer",
  transition: "background 0.15s ease, border-color 0.15s ease, transform 0.1s ease",
};

const headline = {
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: 0.1,
  gridColumn: "1",
  gridRow: "1",
};

const why = {
  fontSize: 12,
  color: "rgba(255,255,255,0.55)",
  lineHeight: 1.45,
  gridColumn: "1",
  gridRow: "2",
};

const compactContainer = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const compactRow = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const compactButton = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)",
  color: "#fff",
  fontSize: 12.5,
  cursor: "pointer",
};

const compactHeadline = {
  fontSize: 12.5,
  fontWeight: 500,
};

// Informational chip — same shape as a button but no hover/cursor + no chevron.
const info = {
  ...button,
  cursor: "default",
  background: "rgba(255,255,255,0.02)",
  borderColor: "rgba(255,255,255,0.05)",
};

const compactInfo = {
  ...compactButton,
  cursor: "default",
  background: "rgba(255,255,255,0.03)",
  borderColor: "rgba(255,255,255,0.08)",
};
