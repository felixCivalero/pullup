// EmailCanvas — the right-side preview pane. Always visible. Renders the
// email exactly as a recipient would see it, branching on the active template.
// Pure presentational: takes all state via props, no editing.

import { useEffect, useMemo, useRef, useState } from "react";
import { Cloud, Globe } from "lucide-react";
import { applyTokens, buildPreviewContext, parseInlineSegments } from "../../lib/emailTokens";

// Match the backend renderer's SOCIAL_ICONS paths byte-for-byte so the
// canvas previews exactly what recipients receive. Filled brand marks
// inherit currentColor (theme-adaptive light/dark).
const wrapStyle = { verticalAlign: "middle", display: "inline-block" };

function FilledIcon({ size, d }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={wrapStyle}>
      <path d={d} />
    </svg>
  );
}

const INSTAGRAM_PATH = "M12 2.16c3.2 0 3.58.012 4.85.07 1.17.054 1.81.249 2.23.413.56.218.96.477 1.38.896.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.81-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.81-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.81.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.91.33 4.14.63a5.88 5.88 0 0 0-2.13 1.38A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.28.26 2.15.56 2.91a5.88 5.88 0 0 0 1.38 2.13 5.88 5.88 0 0 0 2.13 1.38c.77.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.28-.06 2.15-.26 2.91-.56a5.88 5.88 0 0 0 2.13-1.38 5.88 5.88 0 0 0 1.38-2.13c.3-.77.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.28-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.38-2.13A5.88 5.88 0 0 0 19.86.63c-.77-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z";
const SPOTIFY_PATH = "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12A12 12 0 0 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z";
const TIKTOK_PATH = "M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.55a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.18Z";
const YOUTUBE_PATH = "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z";

function InstagramFilled({ size = 22 }) { return <FilledIcon size={size} d={INSTAGRAM_PATH} />; }
function SpotifyIcon({ size = 22 })     { return <FilledIcon size={size} d={SPOTIFY_PATH} />; }
function TiktokIcon({ size = 22 })      { return <FilledIcon size={size} d={TIKTOK_PATH} />; }
function YoutubeFilled({ size = 22 })   { return <FilledIcon size={size} d={YOUTUBE_PATH} />; }

const SOCIAL_ICON_COMPONENTS = {
  instagram: InstagramFilled,
  spotify: SpotifyIcon,
  tiktok: TiktokIcon,
  soundcloud: Cloud,
  youtube: YoutubeFilled,
  website: Globe,
};

// Theme palettes for the canvas preview. Mirrors the actual email shell:
// light is the default that recipients see in most inboxes; dark is what
// recipients on prefers-color-scheme: dark see (Apple Mail, iOS Mail, etc.).
const THEMES = {
  light: { body: "#ffffff", text: "#0c0a12", muted: "rgba(12,10,18,0.55)", border: "rgba(0,0,0,0.08)", link: "#0670DB" },
  dark: { body: "#0c0a12", text: "#ffffff", muted: "rgba(255,255,255,0.55)", border: "rgba(255,255,255,0.1)", link: "#74b6ff" },
};

function canvasReadableTextColor(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0c0a12" : "#ffffff";
}

// Render a string with tokens + [label](url) links into React nodes.
function InlineRich({ text, ctx, theme }) {
  const segments = parseInlineSegments(text || "", ctx);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "link" ? (
          <a
            key={i}
            href={seg.url}
            onClick={(e) => e.preventDefault()}
            style={{ color: theme.link, textDecoration: "underline" }}
          >
            {seg.label}
          </a>
        ) : (
          <span key={i} style={{ whiteSpace: "pre-wrap" }}>{seg.text}</span>
        ),
      )}
    </>
  );
}

export default function EmailCanvas({
  selectedTemplate,
  // Event template (now block-based, mirrors followup)
  selectedEvent,
  eventSubject,
  eventPreviewText,
  eventBlocks,
  // Follow-up template
  followupEvent,
  followupSubject,
  followupPreviewText,
  followupBlocks,
  currentUserFirstName,
  hoveredKey,
}) {
  const isFollowup = selectedTemplate === "followup";
  const isEvent = selectedTemplate === "event";

  const activeEvent = isFollowup ? followupEvent : selectedEvent;
  const activeSubject = isFollowup ? followupSubject : eventSubject;
  const activePreview = isFollowup ? followupPreviewText : eventPreviewText;
  const activeBlocks = isFollowup ? followupBlocks : eventBlocks;

  // Default to light — matches what most recipients see in their inbox.
  // Toggle lets the host preview the dark variant too.
  const [theme, setTheme] = useState("light");
  const palette = THEMES[theme];

  // Auto-scroll the preview so whatever the host is hovering in the rail
  // floats up near the top of the canvas viewport. Mirrors the
  // CreateEventPage / EventPreview behavior.
  const scrollRef = useRef(null);
  useEffect(() => {
    if (!hoveredKey || !scrollRef.current) return;
    const container = scrollRef.current;
    const el = container.querySelector(`[data-hover-key="${hoveredKey}"]`);
    if (!el) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const offsetInContainer = elRect.top - containerRect.top + container.scrollTop;
    const target = offsetInContainer - containerRect.height * 0.3;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [hoveredKey]);

  const previewCtx = useMemo(
    () => buildPreviewContext({
      currentUserFirstName,
      event: activeEvent,
    }),
    [currentUserFirstName, activeEvent],
  );
  const t = (s) => applyTokens(s, previewCtx);
  const inline = (s) => <InlineRich text={s} ctx={previewCtx} theme={palette} />;

  if (!isFollowup && !isEvent) {
    return (
      <div style={canvasOuterStyle}>
        <div style={{ ...emailFrameStyle, borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div style={{ opacity: 0.4, fontSize: 14, padding: 40 }}>
            Pick a template in the Email tab to start composing.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={canvasOuterStyle}>
      <InboxHeader
        subject={t(activeSubject)}
        previewText={t(activePreview)}
        theme={theme}
        onThemeToggle={() => setTheme(theme === "light" ? "dark" : "light")}
      />
      <div ref={scrollRef} style={{ ...emailFrameStyle, background: palette.body, color: palette.text }}>
        <div style={emailBodyStyle}>
        {/* Render blocks whenever there are any. The host CRM normally
            requires an event for the followup template, but admin
            broadcasts have no event coupling — so as long as the
            composer has at least one block, we render the preview. */}
        {(activeBlocks && activeBlocks.length > 0) || activeEvent ? (
          <FollowupBody
            blocks={activeBlocks}
            t={t}
            inline={inline}
            hoveredKey={hoveredKey}
            theme={palette}
          />
        ) : (
          <div style={{ padding: 40, textAlign: "center", opacity: 0.4, fontSize: 14 }}>
            Add a section in the Design tab to start composing.
          </div>
        )}
        <EmailFooter theme={palette} />
        </div>
      </div>
    </div>
  );
}

function InboxHeader({ subject, previewText, theme, onThemeToggle }) {
  return (
    <div
      style={{
        padding: "14px 18px",
        borderRadius: "12px 12px 0 0",
        background: "rgba(20,16,30,0.7)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderBottom: "none",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "11px", opacity: 0.5, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Subject
        </div>
        <div style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>
          {subject || <span style={{ opacity: 0.4 }}>(no subject)</span>}
        </div>
        {previewText && (
          <div style={{ fontSize: "12px", opacity: 0.55, marginTop: 4 }}>{previewText}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onThemeToggle}
        title={`Preview as ${theme === "light" ? "dark" : "light"} mode`}
        style={{
          flexShrink: 0,
          padding: "6px 10px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.75)",
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        {theme === "light" ? "Light" : "Dark"} ↻
      </button>
    </div>
  );
}

function EmailFooter({ theme }) {
  return (
    <div
      style={{
        marginTop: 32,
        paddingTop: 20,
        borderTop: `1px solid ${theme.border}`,
        fontSize: 12,
        textAlign: "center",
        color: theme.muted,
        lineHeight: 1.6,
      }}
    >
      <p style={{ margin: 0 }}>
        You are receiving this email because you opted in via our site.
        <br />
        Want to change how you receive these emails?
        <br />
        You can <a href="#" onClick={(e) => e.preventDefault()} style={{ color: theme.link, textDecoration: "underline" }}>unsubscribe from this list</a>.
      </p>
      <p style={{ margin: "12px 0 0" }}>
        Pullup.se
        <br />
        Lorensbergsgatan 3b
        <br />
        117 33, Stockholm
      </p>
    </div>
  );
}


// Spotify pill SVG inlined so we don't import the lucide brand icons.
function SpotifyMini({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12A12 12 0 0 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

function fmtMeta(ev) {
  let dateLine = "";
  if (ev.startsAt) {
    const d = new Date(ev.startsAt);
    if (!isNaN(d.getTime())) {
      dateLine = d.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }
  }
  return [dateLine, ev.location].filter(Boolean).join(" · ");
}

// Theme-aware event-card style helpers. In dark mode we lift the card
// off the body with a subtle elevated surface, dim border, and invert
// the View button so it pops against the dark background.
function getCardSurface(theme) {
  const isDark = theme.body && theme.body.toLowerCase().startsWith("#0c");
  return {
    bg: isDark ? "#161422" : "#ffffff",
    border: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    title: theme.text,
    meta: theme.muted,
    host: isDark ? "rgba(255,255,255,0.5)" : "rgba(12,10,18,0.55)",
    imgBg: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    ctaBg: isDark ? "#ffffff" : "#0c0a12",
    ctaFg: isDark ? "#0c0a12" : "#ffffff",
  };
}

// Compact card for the 2-per-row layout. Smaller hero, shorter copy,
// stacked CTA + Spotify under condensed meta.
function CompactEventCard({ ev, theme }) {
  const meta = fmtMeta(ev);
  const s = getCardSurface(theme);
  return (
    <div
      style={{
        border: `1px solid ${s.border}`,
        borderRadius: 10,
        background: s.bg,
        overflow: "hidden",
      }}
    >
      {ev.imageUrl && (
        <div style={{ width: "100%", aspectRatio: "16/9", background: s.imgBg, overflow: "hidden" }}>
          <img
            src={ev.imageUrl}
            alt={ev.title || ""}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      )}
      <div style={{ padding: "10px 12px 12px" }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: s.title,
            lineHeight: 1.3,
            marginBottom: 3,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {ev.title || "Untitled"}
        </div>
        {meta && (
          <div style={{ fontSize: 11, color: s.meta, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {meta}
          </div>
        )}
        {ev.hostedBy && (
          <div style={{ fontSize: 11, color: s.host, marginBottom: 6 }}>
            Hosted by {ev.hostedBy}
          </div>
        )}
        {(ev.url || (ev.spotifyUrl && /^https?:\/\//i.test(ev.spotifyUrl))) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {ev.url && (
              <span
                style={{
                  display: "inline-block",
                  padding: "7px 12px",
                  background: s.ctaBg,
                  color: s.ctaFg,
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 11,
                }}
              >
                View →
              </span>
            )}
            {ev.spotifyUrl && /^https?:\/\//i.test(ev.spotifyUrl) && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 10px",
                  background: "#1DB954",
                  color: "#ffffff",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 11,
                  lineHeight: 1,
                }}
              >
                <SpotifyMini size={11} /> Spotify
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// List card — horizontal row with a small thumbnail. Densest layout.
function ListEventCard({ ev, theme }) {
  const meta = fmtMeta(ev);
  const s = getCardSurface(theme);
  return (
    <div
      style={{
        display: "flex",
        border: `1px solid ${s.border}`,
        borderRadius: 10,
        background: s.bg,
        overflow: "hidden",
        alignItems: "stretch",
      }}
    >
      <div
        style={{
          width: 90,
          minWidth: 90,
          height: 90,
          background: s.imgBg,
          flexShrink: 0,
          overflow: "hidden",
          alignSelf: "stretch",
        }}
      >
        {ev.imageUrl && (
          <img
            src={ev.imageUrl}
            alt={ev.title || ""}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: "10px 14px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 2,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: s.title,
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {ev.title || "Untitled"}
        </div>
        {meta && (
          <div style={{ fontSize: 11.5, color: s.meta, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {meta}
          </div>
        )}
        {ev.hostedBy && (
          <div style={{ fontSize: 11, color: s.host, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Hosted by {ev.hostedBy}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", padding: "0 12px", gap: 6, flexShrink: 0 }}>
        {ev.url && (
          <span
            style={{
              display: "inline-block",
              padding: "7px 14px",
              background: s.ctaBg,
              color: s.ctaFg,
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 11,
            }}
          >
            View →
          </span>
        )}
        {ev.spotifyUrl && /^https?:\/\//i.test(ev.spotifyUrl) && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "7px 11px",
              background: "#1DB954",
              color: "#ffffff",
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 11,
              lineHeight: 1,
            }}
          >
            <SpotifyMini size={11} /> Spotify
          </span>
        )}
      </div>
    </div>
  );
}

function FollowupBody({ blocks, t, inline, hoveredKey, theme }) {
  return (
    <div>
      {(blocks || []).length === 0 && (
        <div style={{ padding: 24, textAlign: "center", opacity: 0.4, fontSize: 13, border: `1px dashed ${theme.border}`, borderRadius: 8 }}>
          Add blocks in the Email tab to fill the body.
        </div>
      )}
      {(blocks || []).map((b, i) => (
        <Highlightable key={i} hoverKey={`block-${i}`} hovered={hoveredKey === `block-${i}`}>
          <CanvasBlock block={b} t={t} inline={inline} theme={theme} />
        </Highlightable>
      ))}
    </div>
  );
}

// Wraps a section in the canvas with a lime-green outline when its sibling
// row in the editor rail is being hovered. The data-hover-key attribute is
// what the auto-scroll effect targets via querySelector. Mirrors the
// CreateEventPage / EventPreview pattern.
function Highlightable({ hoverKey, hovered, children }) {
  return (
    <div
      data-hover-key={hoverKey}
      style={{
        borderRadius: 4,
        outline: hovered
          ? "1px solid rgba(163, 230, 53, 0.5)"
          : "1px solid transparent",
        outlineOffset: 4,
        transition: "outline-color 0.15s ease",
      }}
    >
      {children}
    </div>
  );
}

function CanvasBlock({ block, t, inline, theme }) {
  if (block.type === "text" && block.style === "heading") {
    const textAlign = block.align === "center" || block.align === "right" ? block.align : "left";
    return <h2 style={{ fontSize: 22, fontWeight: 700, margin: "16px 0 8px", color: theme.text, textAlign }}>{inline(block.text)}</h2>;
  }
  if (block.type === "text") {
    const textAlign = block.align === "center" || block.align === "right" ? block.align : "left";
    return <p style={{ margin: "0 0 12px", lineHeight: 1.5, color: theme.text, textAlign }}>{inline(block.text)}</p>;
  }
  if (block.type === "image" && block.url) {
    const widthPct = Math.max(25, Math.min(100, Number(block.width) || 100));
    const align = block.align === "left" || block.align === "right" ? block.align : "center";
    const marginLeft = align === "left" ? "0" : "auto";
    const marginRight = align === "right" ? "0" : "auto";
    const aspect = ASPECT_CSS[block.aspectRatio];
    if (aspect) {
      return (
        <div
          style={{
            display: "block",
            width: `${widthPct}%`,
            maxWidth: "100%",
            aspectRatio: aspect,
            overflow: "hidden",
            borderRadius: 8,
            margin: `16px ${marginRight} 16px ${marginLeft}`,
          }}
        >
          <img
            src={block.url}
            alt={t(block.alt || "")}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      );
    }
    return (
      <img
        src={block.url}
        alt={t(block.alt || "")}
        style={{
          display: "block",
          width: `${widthPct}%`,
          maxWidth: "100%",
          height: "auto",
          borderRadius: 8,
          margin: `16px ${marginRight} 16px ${marginLeft}`,
        }}
      />
    );
  }
  if (block.type === "socials" && Array.isArray(block.links) && block.links.length > 0) {
    const align = block.align === "center" || block.align === "right" ? block.align : (block.align === "left" ? "left" : "center");
    const valid = block.links.filter((l) => l && l.url && SOCIAL_ICON_COMPONENTS[l.key]);
    if (valid.length === 0) return null;
    return (
      <div style={{ textAlign: align, margin: "20px 0", color: theme.text }}>
        {valid.map((l) => {
          const Icon = SOCIAL_ICON_COMPONENTS[l.key];
          return (
            <a
              key={l.key}
              href={l.url}
              onClick={(e) => e.preventDefault()}
              title={l.label}
              aria-label={l.label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                margin: "0 4px",
                color: "inherit",
                textDecoration: "none",
              }}
            >
              <Icon size={22} strokeWidth={1.7} />
            </a>
          );
        })}
      </div>
    );
  }
  // Event-card blocks (PullUp + Discover share the same shape). A block
  // can hold multiple events — render them stacked. Legacy single-event
  // blocks (title at top level) are coerced into a one-element list so
  // we can keep one render path.
  if (block.type === "pullup_event" || block.type === "discover_event") {
    const layout = block.layout || "big";
    const items = Array.isArray(block.events)
      ? block.events
      : block.title || block.url
        ? [
            {
              title: block.title,
              imageUrl: block.imageUrl,
              startsAt: block.startsAt,
              location: block.location,
              url: block.url,
              spotifyUrl: block.spotifyUrl,
            },
          ]
        : [];
    if (items.length === 0) return null;

    if (layout === "list") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "20px 0" }}>
          {items.map((ev, i) => (
            <ListEventCard key={i} ev={ev} theme={theme} />
          ))}
        </div>
      );
    }
    if (layout === "grid2") {
      const rows = [];
      for (let i = 0; i < items.length; i += 2) {
        rows.push([items[i], items[i + 1]]);
      }
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "20px 0" }}>
          {rows.map((pair, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <CompactEventCard ev={pair[0]} theme={theme} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {pair[1] ? <CompactEventCard ev={pair[1]} theme={theme} /> : null}
              </div>
            </div>
          ))}
        </div>
      );
    }
    const surface = getCardSurface(theme);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "20px 0" }}>
        {items.map((ev, i) => {
          const meta = fmtMeta(ev);
          return (
            <div
              key={i}
              style={{
                border: `1px solid ${surface.border}`,
                borderRadius: 10,
                background: surface.bg,
                overflow: "hidden",
              }}
            >
              {ev.imageUrl && (
                <div style={{ width: "100%", aspectRatio: "16/9", background: surface.imgBg, overflow: "hidden" }}>
                  <img
                    src={ev.imageUrl}
                    alt={ev.title || ""}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </div>
              )}
              <div style={{ padding: "14px 18px 18px" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: surface.title, lineHeight: 1.3, marginBottom: 4 }}>
                  {ev.title || "Untitled"}
                </div>
                {meta && (
                  <div style={{ fontSize: 13, color: surface.meta, marginBottom: 4 }}>{meta}</div>
                )}
                {ev.hostedBy && (
                  <div
                    style={{
                      fontSize: 12,
                      color: surface.host,
                      marginBottom: 8,
                    }}
                  >
                    Hosted by {ev.hostedBy}
                  </div>
                )}
                {(ev.url || (ev.spotifyUrl && /^https?:\/\//i.test(ev.spotifyUrl))) && (
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {ev.url && (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "10px 20px",
                          background: surface.ctaBg,
                          color: surface.ctaFg,
                          borderRadius: 8,
                          fontWeight: 600,
                          fontSize: 13,
                        }}
                      >
                        View event →
                      </span>
                    )}
                    {ev.spotifyUrl && /^https?:\/\//i.test(ev.spotifyUrl) && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "9px 14px 9px 12px",
                          background: "#1DB954",
                          color: "#ffffff",
                          borderRadius: 8,
                          fontWeight: 600,
                          fontSize: 13,
                          lineHeight: 1,
                        }}
                      >
                        <SpotifyMini size={13} /> Spotify
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  if (block.type === "button" && block.url && block.text) {
    const sizeNum = typeof block.size === "number"
      ? block.size
      : block.size === "small" ? 75 : block.size === "large" ? 130 : 100;
    const pct = Math.max(50, Math.min(150, sizeNum));
    const scale = pct / 100;
    const padY = Math.max(6, Math.round(12 * scale));
    const padX = Math.max(12, Math.round(24 * scale));
    const fontSize = Math.max(11, Math.round(14 * scale));
    const align = block.align === "left" || block.align === "right" ? block.align : "center";
    const bg = /^#[0-9a-f]{6}$/i.test(block.bgColor || "") ? block.bgColor : "#d4af37";
    const fg = canvasReadableTextColor(bg);
    return (
      <div style={{ textAlign: align, margin: "20px 0 0" }}>
        <a
          href={block.url}
          onClick={(e) => e.preventDefault()}
          style={{ display: "inline-block", padding: `${padY}px ${padX}px`, background: bg, color: fg, textDecoration: "none", borderRadius: 8, fontWeight: 600, fontSize }}
        >
          {t(block.text)}
        </a>
        {block.caption && (
          <p style={{ textAlign: align, fontSize: 12, opacity: 0.7, margin: "6px 0 18px" }}>{t(block.caption)}</p>
        )}
      </div>
    );
  }
  return null;
}

const canvasOuterStyle = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  width: "100%",
  overflow: "hidden",
};

const emailFrameStyle = {
  flex: 1,
  overflowY: "auto",
  padding: "24px",
  borderRadius: "0 0 12px 12px",
  background: "rgba(12,10,18,0.9)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderTop: "none",
  color: "#fff",
};

// Email body in real clients caps at 600px; mirror that in the preview so
// hosts see the actual scale (a 100% image renders 600px, not full pane).
const emailBodyStyle = {
  maxWidth: 600,
  margin: "0 auto",
};

const ASPECT_CSS = { banner: "16 / 9", square: "1 / 1", portrait: "4 / 5" };
