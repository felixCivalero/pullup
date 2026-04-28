// EmailCanvas — the right-side preview pane. Always visible. Renders the
// email exactly as a recipient would see it, branching on the active template.
// Pure presentational: takes all state via props, no editing.

import { useEffect, useMemo, useRef, useState } from "react";
import { applyTokens, buildPreviewContext, parseInlineSegments } from "../../lib/emailTokens";

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
  eventGreeting,
  eventGreetingAlign,
  eventBlocks,
  // Follow-up template
  followupEvent,
  followupSubject,
  followupPreviewText,
  followupGreeting,
  followupGreetingAlign,
  followupBlocks,
  currentUserFirstName,
  hoveredKey,
}) {
  const isFollowup = selectedTemplate === "followup";
  const isEvent = selectedTemplate === "event";

  const activeEvent = isFollowup ? followupEvent : selectedEvent;
  const activeSubject = isFollowup ? followupSubject : eventSubject;
  const activePreview = isFollowup ? followupPreviewText : eventPreviewText;
  const activeGreeting = isFollowup ? followupGreeting : eventGreeting;
  const activeGreetingAlign = isFollowup ? followupGreetingAlign : eventGreetingAlign;
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
        {activeEvent ? (
          <FollowupBody
            greeting={activeGreeting}
            greetingAlign={activeGreetingAlign}
            blocks={activeBlocks}
            t={t}
            inline={inline}
            hoveredKey={hoveredKey}
            theme={palette}
          />
        ) : (
          <div style={{ padding: 40, textAlign: "center", opacity: 0.4, fontSize: 14 }}>
            Pick an event in the Email tab to start composing.
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


function FollowupBody({ greeting, greetingAlign, blocks, t, inline, hoveredKey, theme }) {
  const greetingRendered = greeting !== undefined ? greeting : "Hi {{first_name}},";
  const gAlign = greetingAlign === "center" || greetingAlign === "right" ? greetingAlign : "left";
  return (
    <div>
      {greetingRendered && (
        <Highlightable hoverKey="greeting" hovered={hoveredKey === "greeting"}>
          <p style={{ margin: "0 0 12px", color: theme.text, textAlign: gAlign }}>
            {inline(greetingRendered)}
          </p>
        </Highlightable>
      )}
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
