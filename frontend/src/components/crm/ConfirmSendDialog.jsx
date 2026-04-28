import { createPortal } from "react-dom";

const TYPE_COUNT_LABELS = {
  text: { singular: "text block", plural: "text blocks" },
  image: { singular: "image", plural: "images" },
  button: { singular: "button", plural: "buttons" },
};

function summarizeBlocks(blocks = []) {
  const counts = {};
  for (const b of blocks) counts[b.type] = (counts[b.type] || 0) + 1;
  const parts = [];
  for (const [type, n] of Object.entries(counts)) {
    const label = TYPE_COUNT_LABELS[type];
    if (!label) continue;
    parts.push(`${n} ${n === 1 ? label.singular : label.plural}`);
  }
  return parts.join(", ");
}

export default function ConfirmSendDialog({
  isOpen,
  sendStage,
  effectiveRecipientCount,
  sendingStats,
  sendingErrorMessage,
  selectedEvent,
  templateType,
  subjectLine,
  previewText,
  blocks,
  onClose,
  onConfirmSend,
}) {
  if (!isOpen) return null;
  const isFollowup = templateType === "followup";
  const blockSummary = summarizeBlocks(blocks);

  return createPortal(
    <div
      style={overlayStyle}
      onClick={() => {
        if (sendStage === "confirm" || sendStage === "success" || sendStage === "error") onClose();
      }}
    >
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={titleStyle}>
          {sendStage === "confirm"
            ? "Ready to send?"
            : sendStage === "sending"
            ? "Sending campaign…"
            : sendStage === "success"
            ? "Campaign sent"
            : "Campaign failed"}
        </h3>

        {sendStage === "confirm" && (
          <>
            {/* Big recipient number + template pill */}
            <div style={heroBlockStyle}>
              <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1 }}>
                {effectiveRecipientCount.toLocaleString()}
              </div>
              <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
                {effectiveRecipientCount === 1 ? "recipient" : "recipients"}
              </div>
              <div style={{ marginTop: 10 }}>
                <span style={pillStyle(isFollowup)}>
                  {isFollowup ? "Follow-up email" : "Event email"}
                </span>
              </div>
            </div>

            {/* Summary card */}
            <div style={summaryCardStyle}>
              {selectedEvent && (
                <Row label="Event">{selectedEvent.title}</Row>
              )}
              {subjectLine && <Row label="Subject">{subjectLine}</Row>}
              {previewText && <Row label="Preview text">{previewText}</Row>}
              {blockSummary && <Row label="Body">{blockSummary}</Row>}
            </div>

            <div style={noteStyle}>
              Once you send, emails go out immediately and can't be recalled.
              Recipients who unsubscribed are automatically excluded.
            </div>
          </>
        )}

        {sendStage === "sending" && (
          <div style={progressBlockStyle}>
            <Spinner />
            <div style={{ marginTop: 16, fontSize: 14 }}>
              Sending to{" "}
              <strong>{sendingStats.totalRecipients.toLocaleString()}</strong>{" "}
              {sendingStats.totalRecipients === 1 ? "recipient" : "recipients"}…
            </div>
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>
              {sendingStats.totalSent.toLocaleString()} sent
              {sendingStats.totalFailed > 0 && (
                <> · {sendingStats.totalFailed.toLocaleString()} failed</>
              )}
            </div>
            <ProgressBar
              total={sendingStats.totalRecipients}
              done={sendingStats.totalSent + sendingStats.totalFailed}
            />
          </div>
        )}

        {sendStage === "success" && (
          <div style={progressBlockStyle}>
            <SuccessCheck />
            <div style={{ marginTop: 14, fontSize: 14 }}>
              Sent to <strong>{sendingStats.totalSent.toLocaleString()}</strong>{" "}
              {sendingStats.totalSent === 1 ? "recipient" : "recipients"}.
            </div>
            {sendingStats.totalFailed > 0 && (
              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.7 }}>
                {sendingStats.totalFailed.toLocaleString()} deliveries reported as failed.
              </div>
            )}
          </div>
        )}

        {sendStage === "error" && (
          <div style={{ ...progressBlockStyle, color: "#fca5a5" }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>
              We couldn't complete this send. No more emails will be sent.
            </div>
            {sendingErrorMessage && (
              <div style={{ fontSize: 12, opacity: 0.85 }}>{sendingErrorMessage}</div>
            )}
          </div>
        )}

        <div style={footerRowStyle}>
          {sendStage === "confirm" && (
            <>
              <button type="button" onClick={onClose} style={cancelBtnStyle}>
                Cancel
              </button>
              <button type="button" onClick={onConfirmSend} style={sendBtnStyle}>
                Send to {effectiveRecipientCount.toLocaleString()}{" "}
                {effectiveRecipientCount === 1 ? "recipient" : "recipients"} →
              </button>
            </>
          )}
          {sendStage === "sending" && (
            <button type="button" disabled style={disabledBtnStyle}>Sending…</button>
          )}
          {(sendStage === "success" || sendStage === "error") && (
            <button type="button" onClick={onClose} style={cancelBtnStyle}>Close</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", gap: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.04em", flex: "0 0 90px" }}>
        {label}
      </div>
      <div style={{ flex: 1, fontSize: 13, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {children}
      </div>
    </div>
  );
}

function ProgressBar({ total, done }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 999, marginTop: 14, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #4ade80, #22c55e)", transition: "width 0.4s ease" }} />
    </div>
  );
}

function Spinner() {
  return (
    <>
      <style>{`@keyframes pu-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{
        width: 32, height: 32,
        border: "3px solid rgba(255,255,255,0.1)",
        borderTopColor: "#4ade80",
        borderRadius: "50%",
        animation: "pu-spin 0.8s linear infinite",
        margin: "0 auto",
      }} />
    </>
  );
}

function SuccessCheck() {
  return (
    <div style={{
      width: 40, height: 40, borderRadius: "50%",
      background: "rgba(34,197,94,0.18)",
      border: "1px solid rgba(34,197,94,0.4)",
      color: "#4ade80",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 22, fontWeight: 700,
    }}>✓</div>
  );
}

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1100, padding: 20, backdropFilter: "blur(4px)",
};

const dialogStyle = {
  background: "rgba(12, 10, 18, 0.97)",
  borderRadius: 16,
  padding: "24px 24px 20px",
  width: "100%",
  maxWidth: 440,
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#fff",
};

const titleStyle = {
  fontSize: 18,
  fontWeight: 600,
  margin: "0 0 16px",
};

const heroBlockStyle = {
  textAlign: "center",
  padding: "16px 0 18px",
};

const summaryCardStyle = {
  background: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 10,
  padding: "4px 14px",
  marginBottom: 14,
};

const noteStyle = {
  fontSize: 11,
  color: "rgba(255,255,255,0.5)",
  lineHeight: 1.5,
  marginBottom: 16,
};

const progressBlockStyle = {
  textAlign: "center",
  padding: "20px 0",
};

const footerRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 8,
};

const cancelBtnStyle = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "transparent",
  color: "#fff",
  fontSize: 14,
  cursor: "pointer",
};

const sendBtnStyle = {
  padding: "10px 18px",
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(135deg, rgba(34,197,94,0.45), rgba(34,197,94,0.25))",
  color: "#4ade80",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 0 0 1px rgba(34,197,94,0.4), 0 4px 12px rgba(0,0,0,0.4)",
};

const disabledBtnStyle = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.5)",
  fontSize: 14,
  cursor: "not-allowed",
};

const pillStyle = (isFollowup) => ({
  display: "inline-block",
  padding: "3px 10px",
  fontSize: 10,
  fontWeight: 600,
  borderRadius: 999,
  background: isFollowup ? "rgba(212,175,55,0.18)" : "rgba(139,92,246,0.18)",
  color: isFollowup ? "#d4af37" : "#c4b5fd",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
});
