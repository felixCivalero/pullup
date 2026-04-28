// EmailCanvas — the right-side preview pane. Always visible. Renders the
// email exactly as a recipient would see it, branching on the active template.
// Pure presentational: takes all state via props, no editing.

import { useMemo } from "react";
import { applyTokens, buildPreviewContext } from "../../lib/emailTokens";

export default function EmailCanvas({
  selectedTemplate,
  // Event template
  selectedEvent,
  subjectLine,
  headlineText,
  introQuote,
  introBody,
  introGreeting,
  introNote,
  signoffText,
  // Follow-up template
  followupEvent,
  followupSubject,
  followupPreviewText,
  followupBlocks,
  followupSignoff,
  currentUserFirstName,
}) {
  const isFollowup = selectedTemplate === "followup";

  const previewCtx = useMemo(
    () => buildPreviewContext({
      currentUserFirstName,
      currentUserLastName: "",
      event: isFollowup ? followupEvent : selectedEvent,
    }),
    [currentUserFirstName, isFollowup, followupEvent, selectedEvent],
  );
  const t = (s) => applyTokens(s, previewCtx);

  return (
    <div style={canvasOuterStyle}>
      <InboxHeader
        subject={t(isFollowup ? followupSubject : subjectLine)}
        previewText={t(isFollowup ? followupPreviewText : "")}
      />
      <div style={emailFrameStyle}>
        {isFollowup ? (
          <FollowupBody
            blocks={followupBlocks}
            signoff={followupSignoff}
            currentUserFirstName={currentUserFirstName}
            t={t}
          />
        ) : (
          <EventBody
            selectedEvent={selectedEvent}
            headlineText={headlineText}
            introQuote={introQuote}
            introBody={introBody}
            introGreeting={introGreeting}
            introNote={introNote}
            signoffText={signoffText}
          />
        )}
        <EmailFooter />
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
        You can <span style={{ color: "#0670DB", textDecoration: "underline" }}>unsubscribe from this list</span>.
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

function EventBody({
  selectedEvent,
  headlineText,
  introQuote,
  introBody,
  introGreeting,
  introNote,
  signoffText,
}) {
  if (!selectedEvent) {
    return (
      <div style={{ padding: 40, textAlign: "center", opacity: 0.4, fontSize: 14 }}>
        Pick an event in the Email tab to fill the template.
      </div>
    );
  }
  const heroUrl = selectedEvent.coverImageUrl || selectedEvent.imageUrl;
  return (
    <div>
      {heroUrl && (
        <div style={{ width: "100%", aspectRatio: "4/5", overflow: "hidden", borderRadius: "8px 8px 0 0", marginBottom: 16 }}>
          <img
            src={heroUrl}
            alt={selectedEvent.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      )}
      <div style={{ padding: "0 4px" }}>
        <h1 style={{ margin: 0, padding: "12px 0", fontSize: 28, lineHeight: 1.3, fontWeight: 600, textAlign: "center", color: "#fff" }}>
          {headlineText || selectedEvent.title}
        </h1>
        {introQuote && (
          <div style={{ padding: "8px 12px", fontSize: 15, textAlign: "center", fontStyle: "italic", opacity: 0.9 }}>
            &quot;{introQuote}&quot;
          </div>
        )}
        {introBody && (
          <p style={{ margin: 0, padding: "8px 12px", fontSize: 15, textAlign: "center", opacity: 0.85 }}>
            {introBody}
          </p>
        )}
        <hr style={{ border: 0, borderTop: "1px solid rgba(255,255,255,0.1)", margin: "16px 0" }} />
        {introGreeting && (
          <p style={{ margin: 0, padding: "8px 12px", fontSize: 15, textAlign: "center", opacity: 0.85 }}>
            {introGreeting}
          </p>
        )}
        {introNote && (
          <div style={{ margin: 0, padding: "8px 12px", fontSize: 13, textAlign: "center", opacity: 0.7 }}>
            {introNote}
          </div>
        )}
        <div style={{ textAlign: "center", margin: "20px 0" }}>
          <button
            type="button"
            disabled
            style={{
              padding: "10px 24px",
              borderRadius: 999,
              border: "1px solid rgba(192,192,192,0.4)",
              background: "linear-gradient(135deg,rgba(255,255,255,0.92),rgba(220,220,220,0.85))",
              color: "#05040a",
              fontSize: 14,
              fontWeight: 600,
              cursor: "default",
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            }}
          >
            TO EVENT
          </button>
        </div>
        {signoffText && (
          <p style={{ margin: 0, padding: "16px 12px 8px", fontSize: 15, textAlign: "center", opacity: 0.85 }}>
            {signoffText}
          </p>
        )}
      </div>
    </div>
  );
}

function FollowupBody({ blocks, signoff, currentUserFirstName, t }) {
  return (
    <div>
      <p style={{ margin: "0 0 12px", color: "#fff" }}>
        Hi {currentUserFirstName || "there"},
      </p>
      {(blocks || []).length === 0 && (
        <div style={{ padding: 24, textAlign: "center", opacity: 0.4, fontSize: 13, border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 8 }}>
          Add blocks in the Email tab to fill the body.
        </div>
      )}
      {(blocks || []).map((b, i) => <CanvasBlock key={i} block={b} t={t} />)}
      {signoff && (
        <p style={{ margin: "24px 0 0", whiteSpace: "pre-wrap", color: "#fff" }}>{t(signoff)}</p>
      )}
    </div>
  );
}

function CanvasBlock({ block, t }) {
  if (block.type === "text" && block.style === "heading") {
    return <h2 style={{ fontSize: 22, fontWeight: 700, margin: "16px 0 8px", color: "#fff" }}>{t(block.text)}</h2>;
  }
  if (block.type === "text") {
    return <p style={{ margin: "0 0 12px", whiteSpace: "pre-wrap", lineHeight: 1.5, color: "#fff" }}>{t(block.text)}</p>;
  }
  if (block.type === "image" && block.url) {
    return <img src={block.url} alt={t(block.alt || "")} style={{ display: "block", width: "100%", maxWidth: "100%", borderRadius: 8, margin: "16px 0" }} />;
  }
  if (block.type === "button" && block.url && block.text) {
    return (
      <div style={{ textAlign: "center", margin: "20px 0 0" }}>
        <a
          href={block.url}
          onClick={(e) => e.preventDefault()}
          style={{ display: "inline-block", padding: "12px 24px", background: "#d4af37", color: "#0c0a12", textDecoration: "none", borderRadius: 8, fontWeight: 600 }}
        >
          {t(block.text)}
        </a>
        {block.caption && (
          <p style={{ textAlign: "center", fontSize: 12, opacity: 0.7, margin: "6px 0 18px" }}>{t(block.caption)}</p>
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
