// FollowUpComposer — controls-only. The recipient's-eye preview lives in
// <EmailCanvas /> on the right; this is the form on the left. Greeting is
// just the first text block in the blocks list — host can move/delete/edit
// it like any other block.

import BlockEditorList from "./BlockEditorList";
import TokenizedInput from "./TokenizedInput";
import Section from "./Section";
import { availableTokens } from "../../lib/emailTokens";

export default function FollowUpComposer({
  events,
  selectedEventId,
  setSelectedEventId,
  subject,
  setSubject,
  previewText,
  setPreviewText,
  fromName,
  setFromName,
  blocks,
  setBlocks,
  hoveredKey,
  setHoveredKey,
  eventGateLabel = "Which event is this follow-up for?",
  eventGateHint = "A follow-up email is always about something that happened. Pick the event so we can personalize {{event_title}} / {{event_date}} and link recipients back to it in analytics.",
}) {
  const hasEvent = Boolean(selectedEventId);
  const tokens = availableTokens({ hasEvent });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Section label="Event" variant="setup">
        <Field label={eventGateLabel}>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            style={inputStyle}
          >
            <option value="">— choose an event —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
        </Field>
        {!hasEvent && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
            {eventGateHint}
          </div>
        )}
      </Section>

      {hasEvent && (
        <>
          <Section label="Setup" variant="setup">
            {setFromName && (
              <Field label="Sender name (in inbox)">
                <input
                  type="text"
                  value={fromName || ""}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Your brand"
                  maxLength={80}
                  style={inputStyle}
                />
              </Field>
            )}
            <Field label="Subject">
              <TokenizedInput value={subject} onChange={setSubject} tokens={tokens} placeholder="Subject line…" />
            </Field>
            <Field label="Preview text (preheader)">
              <TokenizedInput value={previewText} onChange={setPreviewText} tokens={tokens} placeholder="Inbox preview snippet…" />
            </Field>
          </Section>

          <Section label="Content" variant="content">
            <BlockEditorList
              blocks={blocks}
              onChange={setBlocks}
              tokens={tokens}
              hoveredKey={hoveredKey}
              setHoveredKey={setHoveredKey}
            />
          </Section>
        </>
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
