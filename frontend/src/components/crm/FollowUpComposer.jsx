// FollowUpComposer — controls-only. The recipient's-eye preview lives in
// <EmailCanvas /> on the right; this is the form on the left.

import BlockEditorList from "./BlockEditorList";
import TokenizedInput from "./TokenizedInput";
import { availableTokens } from "../../lib/emailTokens";

export default function FollowUpComposer({
  events,
  selectedEventId,
  setSelectedEventId,
  subject,
  setSubject,
  previewText,
  setPreviewText,
  greeting,
  setGreeting,
  blocks,
  setBlocks,
  signoff,
  setSignoff,
}) {
  const tokens = availableTokens({ hasEvent: Boolean(selectedEventId) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Field label="Associate with event (for analytics)">
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          style={inputStyle}
        >
          <option value="">— none —</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.title}</option>
          ))}
        </select>
      </Field>
      <Field label="Subject">
        <TokenizedInput value={subject} onChange={setSubject} tokens={tokens} placeholder="Subject line…" />
      </Field>
      <Field label="Preview text (preheader)">
        <TokenizedInput value={previewText} onChange={setPreviewText} tokens={tokens} placeholder="Inbox preview snippet…" />
      </Field>
      <Field label="Greeting (auto-personalized per recipient)">
        <TokenizedInput
          multiline
          rows={2}
          value={greeting}
          onChange={setGreeting}
          tokens={tokens}
          enableLinks
          placeholder="Hi [First name],"
        />
      </Field>
      <BlockEditorList blocks={blocks} onChange={setBlocks} tokens={tokens} />
      <Field label="Signoff">
        <TokenizedInput multiline rows={3} value={signoff} onChange={setSignoff} tokens={tokens} enableLinks placeholder={"With love,\nThe Spring Salon"} />
      </Field>
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
