// EmailPanel — controls-only. Both event and follow-up templates use the
// same block-based composer; the difference is the starting block defaults
// (event template auto-populates from the chosen event in CrmPage). The
// actual email preview lives in <EmailCanvas /> on the right.

import FollowUpComposer from "./FollowUpComposer";
import { colors } from "./mailColors.js";

export default function EmailPanel({
  events,
  selectedTemplate,
  setSelectedTemplate,
  // Event template
  selectedEventId,
  setSelectedEventId,
  eventSubject,
  setEventSubject,
  eventPreviewText,
  setEventPreviewText,
  eventBlocks,
  setEventBlocks,
  eventFromName,
  setEventFromName,
  // Follow-up template
  selectedEventIdForFollowup,
  setSelectedEventIdForFollowup,
  followupSubject,
  setFollowupSubject,
  followupPreviewText,
  setFollowupPreviewText,
  followupBlocks,
  setFollowupBlocks,
  followupFromName,
  setFollowupFromName,
  hoveredKey,
  setHoveredKey,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Field label="Mall">
        <select
          value={selectedTemplate}
          onChange={(e) => setSelectedTemplate(e.target.value)}
          style={inputStyle}
        >
          <option value="">— välj mall —</option>
          <option value="event">Inbjudan till event</option>
          <option value="followup">Uppföljning efter event</option>
        </select>
      </Field>

      {!selectedTemplate && (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: colors.surface, border: `1px solid ${colors.border}`, fontSize: 12, color: colors.textSubtle, lineHeight: 1.5 }}>
          Välj en mall ovan för att börja.
        </div>
      )}

      {selectedTemplate === "event" && (
        <FollowUpComposer
          events={events}
          selectedEventId={selectedEventId}
          setSelectedEventId={setSelectedEventId}
          subject={eventSubject}
          setSubject={setEventSubject}
          previewText={eventPreviewText}
          setPreviewText={setEventPreviewText}
          fromName={eventFromName}
          setFromName={setEventFromName}
          blocks={eventBlocks}
          setBlocks={setEventBlocks}
          hoveredKey={hoveredKey}
          setHoveredKey={setHoveredKey}
          eventGateLabel="Vilket event bjuder du in till?"
          eventGateHint="Välj eventet så fylls mejlet i med bild, titel, datum, plats och beskrivning. Sen kan du ändra och flytta om."
        />
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
          fromName={followupFromName}
          setFromName={setFollowupFromName}
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
      <label style={{ display: "block", fontSize: "11px", color: colors.textSubtle, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
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
  border: `1px solid ${colors.border}`,
  background: "#fff",
  color: colors.text,
  fontSize: "14px",
  boxSizing: "border-box",
};
