import BlockEditorList from "./BlockEditorList";
import FollowUpPreview from "./FollowUpPreview";

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
  currentUserFirstName,
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "20px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
        <Field label="Associate with event (for analytics)">
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            style={selectStyle}
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
        <div style={{ padding: "12px 14px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "10px", fontSize: "12px", opacity: 0.8 }}>
          <div>Greeting: <strong>Hi [recipient first name],</strong></div>
          <div style={{ opacity: 0.7, marginTop: "4px" }}>Automatically personalized per recipient.</div>
        </div>
        <BlockEditorList blocks={blocks} onChange={setBlocks} />
        <Field label="Signoff">
          <textarea value={signoff} onChange={(e) => setSignoff(e.target.value)} rows={3} style={{ ...inputStyle, fontFamily: "inherit" }} placeholder={"With love,\nThe Spring Salon"} />
        </Field>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ position: "sticky", top: "16px" }}>
          <div style={{ fontSize: "11px", opacity: 0.6, marginBottom: "8px" }}>Live preview</div>
          <FollowUpPreview
            subject={subject}
            previewText={previewText}
            blocks={blocks}
            signoff={signoff}
            currentUserFirstName={currentUserFirstName}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "11px", opacity: 0.7, marginBottom: "6px" }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(12,10,18,0.8)",
  color: "#fff",
  fontSize: "14px",
};
const selectStyle = inputStyle;
