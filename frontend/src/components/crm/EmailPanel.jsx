// EmailPanel — controls-only. Renders form fields for whichever template
// is active. The actual email preview lives in <EmailCanvas /> on the right.

import FollowUpComposer from "./FollowUpComposer";
import Section from "./Section";

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
  followupGreeting,
  setFollowupGreeting,
  followupBlocks,
  setFollowupBlocks,
  hoveredKey,
  setHoveredKey,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Field label="Template">
        <select
          value={selectedTemplate}
          onChange={(e) => {
            setSelectedTemplate(e.target.value);
            if (e.target.value !== "event") setSelectedEventId("");
          }}
          style={inputStyle}
        >
          <option value="">— select template —</option>
          <option value="event">Event email template</option>
          <option value="followup">Follow-up email</option>
        </select>
      </Field>

      {!selectedTemplate && (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", fontSize: 12, opacity: 0.6, lineHeight: 1.5 }}>
          Pick a template above to start composing.
        </div>
      )}

      {selectedTemplate === "event" && (
        <>
          <Section label="Setup" variant="setup">
            <Field label="Event content">
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Choose event to use as email content</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </Field>
            {selectedEvent && (
              <Field label="Subject line">
                <input
                  type="text"
                  value={subjectLine}
                  onChange={(e) => setSubjectLine(e.target.value)}
                  placeholder={`You're invited to ${selectedEvent.title}.`}
                  style={inputStyle}
                />
              </Field>
            )}
          </Section>

          {selectedEvent && (
            <Section label="Content" variant="content">
              <Field label="Headline">
                <input
                  type="text"
                  value={headlineText}
                  onChange={(e) => setHeadlineText(e.target.value)}
                  placeholder={selectedEvent.title}
                  style={inputStyle}
                />
              </Field>
              <Field label="Quote / hook">
                <input
                  type="text"
                  value={introQuote}
                  onChange={(e) => setIntroQuote(e.target.value)}
                  placeholder='E.g. "Ett gratiserbjudande faller från ovan"'
                  style={inputStyle}
                />
              </Field>
              <Field label="Body">
                <textarea
                  value={introBody}
                  onChange={(e) => setIntroBody(e.target.value)}
                  rows={3}
                  placeholder="Body text…"
                  style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
                />
              </Field>
              <Field label="Greeting (after divider)">
                <input
                  type="text"
                  value={introGreeting}
                  onChange={(e) => setIntroGreeting(e.target.value)}
                  placeholder="Optional greeting"
                  style={inputStyle}
                />
              </Field>
              <Field label="Credits / note">
                <input
                  type="text"
                  value={introNote}
                  onChange={(e) => setIntroNote(e.target.value)}
                  placeholder='E.g. "Mask och foto av @partillejohnny"'
                  style={inputStyle}
                />
              </Field>
              <Field label="Signoff">
                <input
                  type="text"
                  value={signoffText}
                  onChange={(e) => setSignoffText(e.target.value)}
                  placeholder="Optional signoff"
                  style={inputStyle}
                />
              </Field>
            </Section>
          )}
        </>
      )}

      {selectedTemplate === "followup" && (
        <FollowUpComposer
          events={events}
          selectedEventId={selectedEventIdForFollowup}
          setSelectedEventId={setSelectedEventIdForFollowup}
          subject={followupSubject}
          setSubject={setFollowupSubject}
          previewText={followupPreviewText}
          setPreviewText={setFollowupPreviewText}
          greeting={followupGreeting}
          setGreeting={setFollowupGreeting}
          blocks={followupBlocks}
          setBlocks={setFollowupBlocks}
          hoveredKey={hoveredKey}
          setHoveredKey={setHoveredKey}
        />
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "11px", opacity: 0.7, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(12,10,18,0.8)",
  color: "#fff",
  fontSize: "14px",
  boxSizing: "border-box",
};
