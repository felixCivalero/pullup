import { useState } from "react";
import { colors } from "../../theme/colors";
import FollowUpComposer from "./FollowUpComposer";

export default function EmailPanel({
  events,
  selectedTemplate,
  setSelectedTemplate,
  selectedEventId,
  setSelectedEventId,
  selectedEvent,
  subjectLine,
  setSubjectLine,
  headlineText,
  setHeadlineText,
  introQuote,
  setIntroQuote,
  introBody,
  setIntroBody,
  introGreeting,
  setIntroGreeting,
  introNote,
  setIntroNote,
  signoffText,
  setSignoffText,
  // Follow-up template props
  selectedEventIdForFollowup,
  setSelectedEventIdForFollowup,
  followupSubject,
  setFollowupSubject,
  followupPreviewText,
  setFollowupPreviewText,
  followupBlocks,
  setFollowupBlocks,
  followupSignoff,
  setFollowupSignoff,
  currentUserFirstName,
}) {
  const [editingField, setEditingField] = useState(null);

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <label
          style={{
            display: "block",
            fontSize: "12px",
            opacity: 0.7,
            marginBottom: "6px",
          }}
        >
          Template
        </label>
        <select
          value={selectedTemplate}
          onChange={(e) => {
            setSelectedTemplate(e.target.value);
            // Reset event selection when template changes
            if (e.target.value !== "event") {
              setSelectedEventId("");
            }
          }}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(12,10,18,0.8)",
            color: "#fff",
            fontSize: "14px",
          }}
        >
          <option value="event">Event email template</option>
          <option value="followup">Follow-up email</option>
        </select>
      </div>

      {selectedTemplate === "followup" && (
        <FollowUpComposer
          events={events}
          selectedEventId={selectedEventIdForFollowup}
          setSelectedEventId={setSelectedEventIdForFollowup}
          subject={followupSubject}
          setSubject={setFollowupSubject}
          previewText={followupPreviewText}
          setPreviewText={setFollowupPreviewText}
          blocks={followupBlocks}
          setBlocks={setFollowupBlocks}
          signoff={followupSignoff}
          setSignoff={setFollowupSignoff}
          currentUserFirstName={currentUserFirstName}
        />
      )}

      {selectedTemplate === "event" && (
        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "12px",
              opacity: 0.7,
              marginBottom: "6px",
            }}
          >
            Event content
          </label>
          <select
            value={selectedEventId}
            onChange={(e) => {
              setSelectedEventId(e.target.value);
              // Reset editable fields when event changes
              setHeadlineText("");
              setSubjectLine("");
              setIntroQuote("");
              setIntroBody("");
              setIntroGreeting("");
              setIntroNote("");
              setSignoffText("");
            }}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(12,10,18,0.8)",
              color: "#fff",
              fontSize: "14px",
            }}
          >
            <option value="">Choose event to use as email content</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedTemplate === "event" && selectedEvent && (
        <div
          style={{
            background: "rgba(20, 16, 30, 0.7)",
            borderRadius: "16px",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            boxShadow:
              "0 0 0 1px rgba(34,197,94,0.12), 0 14px 40px rgba(0,0,0,0.55)",
            margin: "0px -25px 0px -24px",
            padding: "22px",
          }}
        >
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                opacity: 0.7,
                marginBottom: "6px",
              }}
            >
              Subject line
            </label>
            <input
              type="text"
              placeholder="E.g. Love Rönnlund till [Event Name]"
              value={
                subjectLine && subjectLine.trim().length > 0
                  ? subjectLine
                  : selectedEvent
                    ? `You're invited to ${selectedEvent.title}.`
                    : ""
              }
              onChange={(e) => setSubjectLine(e.target.value)}
              style={{
                width: "92%",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(12,10,18,0.8)",
                color: "#fff",
                fontSize: "14px",
              }}
            />
          </div>

          {/* Email preview - matches Resend template structure */}

          <div
            style={{
              marginTop: "4px",
              marginBottom: "20px",
              borderRadius: "16px",
              background: "rgba(12,10,18,0.9)",
              border: "1px solid rgba(255,255,255,0.06)",
              overflow: "hidden",
              boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
            }}
          >
            {/* Hero image */}
            {(selectedEvent.coverImageUrl || selectedEvent.imageUrl) && (
              <div
                style={{
                  width: "100%",
                  aspectRatio: "4/5",
                  overflow: "hidden",
                }}
              >
                <img
                  src={selectedEvent.coverImageUrl || selectedEvent.imageUrl}
                  alt={selectedEvent.title}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>
            )}

            <div style={{ padding: "20px 20px 24px" }}>
              {/* Headline - inline editable */}
              {editingField === "headline" ? (
                <input
                  type="text"
                  value={headlineText || selectedEvent.title}
                  onChange={(e) => setHeadlineText(e.target.value)}
                  onBlur={() => setEditingField(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.target.blur();
                    }
                  }}
                  autoFocus
                  style={{
                    width: "100%",
                    margin: 0,
                    padding: "12px",
                    fontSize: "28px",
                    lineHeight: "1.3",
                    fontWeight: 600,
                    textAlign: "center",
                    marginBottom: "12px",
                    background: "transparent",
                    border: "1px dashed rgba(255,255,255,0.3)",
                    borderRadius: "4px",
                    color: "#fff",
                    outline: "none",
                  }}
                />
              ) : (
                <h1
                  onClick={() => setEditingField("headline")}
                  style={{
                    margin: 0,
                    padding: "12px",
                    fontSize: "28px",
                    lineHeight: "1.3",
                    paddingTop: "12px",
                    fontWeight: 600,
                    textAlign: "center",
                    marginBottom: "12px",
                    cursor: "pointer",
                    borderRadius: "8px",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      colors.silverRgbaHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {headlineText || selectedEvent.title}
                </h1>
              )}

              {/* Intro quote - inline editable */}
              {editingField === "quote" ? (
                <input
                  type="text"
                  value={introQuote}
                  onChange={(e) => setIntroQuote(e.target.value)}
                  onBlur={() => setEditingField(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.target.blur();
                    }
                  }}
                  placeholder='E.g. "Ett gratiserbjudande faller från ovan"'
                  autoFocus
                  style={{
                    width: "100%",
                    margin: 0,
                    padding: "8px 12px",
                    fontSize: "15px",
                    paddingTop: "8px",
                    paddingBottom: "8px",
                    textAlign: "center",
                    fontStyle: "italic",
                    background: "transparent",
                    border: "1px dashed rgba(255,255,255,0.3)",
                    borderRadius: "4px",
                    color: "#fff",
                    opacity: 0.9,
                    outline: "none",
                  }}
                />
              ) : (
                <div
                  onClick={() => setEditingField("quote")}
                  style={{
                    margin: 0,
                    padding: "8px 12px",
                    fontSize: "15px",
                    paddingTop: "8px",
                    paddingBottom: "8px",
                    textAlign: "center",
                    fontStyle: "italic",
                    opacity: introQuote ? 0.9 : 0.4,
                    cursor: "pointer",
                    borderRadius: "8px",
                    minHeight: "32px",
                    transition: "all 0.2s ease",
                    border: introQuote
                      ? "none"
                      : "1px dashed rgba(255,255,255,0.2)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      colors.silverRgbaHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {introQuote ? (
                    <>&quot;{introQuote}&quot;</>
                  ) : (
                    <span style={{ fontSize: "12px" }}>
                      Click to add quote / hook
                    </span>
                  )}
                </div>
              )}

              {/* Intro body - inline editable */}
              {editingField === "body" ? (
                <textarea
                  value={introBody}
                  onChange={(e) => setIntroBody(e.target.value)}
                  onBlur={() => setEditingField(null)}
                  autoFocus
                  rows={3}
                  style={{
                    width: "100%",
                    margin: 0,
                    padding: "8px 12px",
                    fontSize: "15px",
                    paddingTop: "8px",
                    paddingBottom: "8px",
                    textAlign: "center",
                    background: "transparent",
                    border: "1px dashed rgba(255,255,255,0.3)",
                    borderRadius: "4px",
                    color: "#fff",
                    opacity: 0.85,
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              ) : (
                <p
                  onClick={() => setEditingField("body")}
                  style={{
                    margin: 0,
                    padding: "8px 12px",
                    fontSize: "15px",
                    paddingTop: "8px",
                    paddingBottom: "8px",
                    textAlign: "center",
                    opacity: 0.85,
                    cursor: "pointer",
                    borderRadius: "8px",
                    minHeight: "24px",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      colors.silverRgbaHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {introBody}
                </p>
              )}

              {/* Divider */}
              <hr
                style={{
                  width: "100%",
                  border: "none",
                  borderTop: "1px solid rgba(255,255,255,0.1)",
                  paddingBottom: "12px",
                  marginTop: "12px",
                  marginBottom: "12px",
                }}
              />

              {/* Intro greeting - inline editable */}
              {editingField === "greeting" ? (
                <input
                  type="text"
                  value={introGreeting}
                  onChange={(e) => setIntroGreeting(e.target.value)}
                  onBlur={() => setEditingField(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.target.blur();
                    }
                  }}
                  placeholder="Click to add greeting"
                  autoFocus
                  style={{
                    width: "100%",
                    margin: 0,
                    padding: "8px 12px",
                    fontSize: "15px",
                    paddingTop: "8px",
                    paddingBottom: "8px",
                    textAlign: "center",
                    background: "transparent",
                    border: "1px dashed rgba(255,255,255,0.3)",
                    borderRadius: "4px",
                    color: "#fff",
                    opacity: 0.85,
                    outline: "none",
                  }}
                />
              ) : (
                <p
                  onClick={() => setEditingField("greeting")}
                  style={{
                    margin: 0,
                    padding: "8px 12px",
                    fontSize: "15px",
                    paddingTop: "8px",
                    paddingBottom: "8px",
                    textAlign: "center",
                    opacity: 0.85,
                    cursor: "pointer",
                    borderRadius: "8px",
                    minHeight: "24px",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      colors.silverRgbaHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {introGreeting ? (
                    introGreeting
                  ) : (
                    <span style={{ fontSize: "12px", opacity: 0.6 }}>
                      Click to add greeting
                    </span>
                  )}
                </p>
              )}

              {/* Intro note - inline editable */}
              {editingField === "note" ? (
                <input
                  type="text"
                  value={introNote}
                  onChange={(e) => setIntroNote(e.target.value)}
                  onBlur={() => setEditingField(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.target.blur();
                    }
                  }}
                  placeholder='E.g. "Mask och foto av @partillejohnny"'
                  autoFocus
                  style={{
                    width: "100%",
                    margin: 0,
                    padding: "8px 12px",
                    fontSize: "13px",
                    paddingTop: "8px",
                    paddingBottom: "8px",
                    textAlign: "center",
                    background: "transparent",
                    border: "1px dashed rgba(255,255,255,0.3)",
                    borderRadius: "4px",
                    color: "#fff",
                    opacity: 0.7,
                    outline: "none",
                  }}
                />
              ) : (
                <div
                  onClick={() => setEditingField("note")}
                  style={{
                    margin: 0,
                    padding: "8px 12px",
                    fontSize: "13px",
                    paddingTop: "8px",
                    paddingBottom: "8px",
                    textAlign: "center",
                    opacity: introNote ? 0.7 : 0.4,
                    cursor: "pointer",
                    borderRadius: "8px",
                    minHeight: "24px",
                    transition: "all 0.2s ease",
                    border: introNote
                      ? "none"
                      : "1px dashed rgba(255,255,255,0.2)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      colors.silverRgbaHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {introNote || (
                    <span style={{ fontSize: "11px" }}>
                      Click to add credits / note
                    </span>
                  )}
                </div>
              )}

              {/* CTA Button (visual preview only, actual link handled in template) */}
              <div style={{ textAlign: "center", marginTop: "20px" }}>
                <button
                  type="button"
                  style={{
                    padding: "10px 24px",
                    borderRadius: "999px",
                    border: `1px solid ${colors.silverRgbaBorder}`,
                    background: colors.gradientPrimary,
                    color: "#05040a",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "default",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                  }}
                >
                  TO EVENT
                </button>
              </div>

              {/* Signoff - inline editable */}
              {editingField === "signoff" ? (
                <input
                  type="text"
                  value={signoffText}
                  onChange={(e) => setSignoffText(e.target.value)}
                  onBlur={() => setEditingField(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.target.blur();
                    }
                  }}
                  placeholder="Click to add signoff"
                  autoFocus
                  style={{
                    width: "100%",
                    margin: 0,
                    padding: "16px 12px 8px",
                    fontSize: "15px",
                    paddingTop: "16px",
                    paddingBottom: "8px",
                    textAlign: "center",
                    background: "transparent",
                    border: "1px dashed rgba(255,255,255,0.3)",
                    borderRadius: "4px",
                    color: "#fff",
                    opacity: 0.85,
                    outline: "none",
                  }}
                />
              ) : (
                <p
                  onClick={() => setEditingField("signoff")}
                  style={{
                    margin: 0,
                    padding: "16px 12px 8px",
                    fontSize: "15px",
                    paddingTop: "16px",
                    paddingBottom: "8px",
                    textAlign: "center",
                    opacity: 0.85,
                    cursor: "pointer",
                    borderRadius: "8px",
                    minHeight: "24px",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      colors.silverRgbaHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {signoffText ? (
                    signoffText
                  ) : (
                    <span style={{ fontSize: "12px", opacity: 0.6 }}>
                      Click to add signoff
                    </span>
                  )}
                </p>
              )}

              {/* Footer (read-only) */}
              <div
                style={{
                  marginTop: "24px",
                  paddingTop: "20px",
                  borderTop: "2px solid rgba(255,255,255,0.1)",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    padding: 0,
                    fontSize: "12px",
                    paddingTop: "8px",
                    paddingBottom: "8px",
                    textAlign: "center",
                    opacity: 0.6,
                  }}
                >
                  You are receiving this email because you opted in via
                  our site.
                  <br />
                  <br />
                  Want to change how you receive these emails?
                  <br />
                  You can{" "}
                  <span
                    style={{
                      color: "#0670DB",
                      textDecoration: "underline",
                    }}
                  >
                    unsubscribe from this list
                  </span>
                  .
                </p>
                <p
                  style={{
                    margin: 0,
                    padding: 0,
                    fontSize: "12px",
                    paddingTop: "8px",
                    paddingBottom: "8px",
                    textAlign: "center",
                    opacity: 0.6,
                  }}
                >
                  Pullup.se
                  <br />
                  Lorensbergsgatan 3b
                  <br />
                  117 33, Stockholm
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
