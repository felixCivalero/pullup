// FollowUpComposer — controls-only. The recipient's-eye preview lives in
// <EmailCanvas /> on the right; this is the form on the left.

import BlockEditorList from "./BlockEditorList";

export default function FollowUpComposer({
  events,
  selectedEventId,
  setSelectedEventId,
  subject,
  setSubject,
  previewText,
  setPreviewText,
  blocks,
  setBlocks,
  signoff,
  setSignoff,
}) {
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
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle} placeholder="Subject line…" />
      </Field>
      <Field label="Preview text (preheader)">
        <input type="text" value={previewText} onChange={(e) => setPreviewText(e.target.value)} style={inputStyle} placeholder="Inbox preview snippet…" />
      </Field>
      <div style={{ padding: "10px 12px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "10px", fontSize: "12px", opacity: 0.85 }}>
        Greeting: <strong>Hi [recipient first name],</strong> — auto-personalized.
      </div>
      <BlockEditorList blocks={blocks} onChange={setBlocks} />
      <Field label="Signoff">
        <textarea value={signoff} onChange={(e) => setSignoff(e.target.value)} rows={3} style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }} placeholder={"With love,\nThe Spring Salon"} />
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
