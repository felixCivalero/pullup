// FollowUpComposer — controls-only. The recipient's-eye preview lives in
// <EmailCanvas /> on the right; this is the form on the left. Greeting is
// just the first text block in the blocks list — host can move/delete/edit
// it like any other block.

import BlockEditorList from "./BlockEditorList";
import TokenizedInput from "./TokenizedInput";
import Section from "./Section";
import { availableTokens } from "../../lib/emailTokens";
import { colors } from "./mailColors.js";

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
  eventGateLabel = "Vilket event följer du upp?",
  eventGateHint = "En uppföljning handlar om något som har hänt. Välj eventet så fylls {{event_title}} och {{event_date}} i.",
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
            <option value="">— välj event —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
        </Field>
        {!hasEvent && (
          <div style={{ fontSize: 12, color: colors.textSubtle, lineHeight: 1.5 }}>
            {eventGateHint}
          </div>
        )}
      </Section>

      {hasEvent && (
        <>
          <Section label="Inställningar" variant="setup">
            {setFromName && (
              <Field label="Avsändarnamn (syns i inkorgen)">
                <input
                  type="text"
                  value={fromName || ""}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Ditt varumärke"
                  maxLength={80}
                  style={inputStyle}
                />
              </Field>
            )}
            <Field label="Ämne">
              <TokenizedInput value={subject} onChange={setSubject} tokens={tokens} placeholder="Ämnesrad…" />
            </Field>
            <Field label="Förhandstext (syns efter ämnet i inkorgen)">
              <TokenizedInput value={previewText} onChange={setPreviewText} tokens={tokens} placeholder="Kort text som syns i inkorgen…" />
            </Field>
          </Section>

          <Section label="Innehåll" variant="content">
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
