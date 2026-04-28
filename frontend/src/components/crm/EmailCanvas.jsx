// EmailCanvas — the right-side preview pane. Always visible. Renders the
// email exactly as a recipient would see it, branching on the active template.
// Pure presentational: takes all state via props, no editing.

import { useMemo } from "react";
import { applyTokens, buildPreviewContext, parseInlineSegments } from "../../lib/emailTokens";

function canvasReadableTextColor(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0c0a12" : "#ffffff";
}

// Render a string with tokens + [label](url) links into React nodes.
function InlineRich({ text, ctx }) {
  const segments = parseInlineSegments(text || "", ctx);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "link" ? (
          <a
            key={i}
            href={seg.url}
            onClick={(e) => e.preventDefault()}
            style={{ color: "#d4af37", textDecoration: "underline" }}
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
  eventBlocks,
  // Follow-up template
  followupEvent,
  followupSubject,
  followupPreviewText,
  followupGreeting,
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
  const activeBlocks = isFollowup ? followupBlocks : eventBlocks;

  const previewCtx = useMemo(
    () => buildPreviewContext({
      currentUserFirstName,
      event: activeEvent,
    }),
    [currentUserFirstName, activeEvent],
  );
  const t = (s) => applyTokens(s, previewCtx);
  const inline = (s) => <InlineRich text={s} ctx={previewCtx} />;

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
      <InboxHeader subject={t(activeSubject)} previewText={t(activePreview)} />
      <div style={emailFrameStyle}>
        <div style={emailBodyStyle}>
        {activeEvent ? (
          <FollowupBody
            greeting={activeGreeting}
            blocks={activeBlocks}
            t={t}
            inline={inline}
            hoveredKey={hoveredKey}
          />
        ) : (
          <div style={{ padding: 40, textAlign: "center", opacity: 0.4, fontSize: 14 }}>
            Pick an event in the Email tab to start composing.
          </div>
        )}
        <EmailFooter />
        </div>
      </div>
    </div>
  );
}

function InboxHeader({ subject, previewText }) {
  return (
    <div
      style={{
        padding: "14px 18px",
        borderRadius: "12px 12px 0 0",
        background: "rgba(20,16,30,0.7)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderBottom: "none",
      }}
    >
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
  );
}

function EmailFooter() {
  return (
    <div
      style={{
        marginTop: 32,
        paddingTop: 20,
        borderTop: "2px solid rgba(255,255,255,0.08)",
        fontSize: 12,
        textAlign: "center",
        opacity: 0.5,
        lineHeight: 1.6,
      }}
    >
      <p style={{ margin: 0 }}>
        You are receiving this email because you opted in via our site.
        <br />
        Want to change how you receive these emails?
        <br />
        You can <a href="#" onClick={(e) => e.preventDefault()} style={{ color: "#0670DB", textDecoration: "underline" }}>unsubscribe from this list</a>.
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


function FollowupBody({ greeting, blocks, t, inline, hoveredKey }) {
  const greetingRendered = greeting !== undefined ? greeting : "Hi {{first_name}},";
  return (
    <div>
      {greetingRendered && (
        <Highlightable hovered={hoveredKey === "greeting"}>
          <p style={{ margin: "0 0 12px", color: "#fff" }}>
            {inline(greetingRendered)}
          </p>
        </Highlightable>
      )}
      {(blocks || []).length === 0 && (
        <div style={{ padding: 24, textAlign: "center", opacity: 0.4, fontSize: 13, border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 8 }}>
          Add blocks in the Email tab to fill the body.
        </div>
      )}
      {(blocks || []).map((b, i) => (
        <Highlightable key={i} hovered={hoveredKey === `block-${i}`}>
          <CanvasBlock block={b} t={t} inline={inline} />
        </Highlightable>
      ))}
    </div>
  );
}

// Wraps a section in the canvas with a lime-green outline when its sibling
// row in the editor rail is being hovered. Mirrors the CreateEventPage pattern.
function Highlightable({ hovered, children }) {
  return (
    <div
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

function CanvasBlock({ block, t, inline }) {
  if (block.type === "text" && block.style === "heading") {
    return <h2 style={{ fontSize: 22, fontWeight: 700, margin: "16px 0 8px", color: "#fff" }}>{inline(block.text)}</h2>;
  }
  if (block.type === "text") {
    return <p style={{ margin: "0 0 12px", lineHeight: 1.5, color: "#fff" }}>{inline(block.text)}</p>;
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
