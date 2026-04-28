import { createPortal } from "react-dom";

const gradientPrimary = "linear-gradient(135deg,#8b5cf6,#ec4899)";

export default function ConfirmSendDialog({
  isOpen,
  sendStage,
  effectiveRecipientCount,
  sendingStats,
  sendingErrorMessage,
  selectedEvent,
  subjectLine,
  onClose,
  onConfirmSend,
}) {
  if (!isOpen) return null;
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: "20px",
      }}
      onClick={() => {
        if (
          sendStage === "confirm" ||
          sendStage === "success" ||
          sendStage === "error"
        ) {
          onClose();
        }
      }}
    >
      <div
        style={{
          background: "rgba(12, 10, 18, 0.97)",
          borderRadius: "16px",
          padding: "24px 24px 20px",
          width: "100%",
          maxWidth: "460px",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "8px",
          }}
        >
          {sendStage === "confirm"
            ? "Send campaign to segment?"
            : sendStage === "sending"
            ? "Sending campaign…"
            : sendStage === "success"
            ? "Campaign sent"
            : "Campaign failed"}
        </h3>

        {sendStage === "confirm" && (
          <div
            style={{
              fontSize: "14px",
              opacity: 0.85,
              marginBottom: "16px",
            }}
          >
            <p style={{ marginBottom: "8px" }}>
              This email will be sent to{" "}
              <span style={{ fontWeight: 600 }}>
                {effectiveRecipientCount.toLocaleString()}
              </span>{" "}
              contacts in the current segment.
            </p>
            {selectedEvent && (
              <p style={{ margin: 0 }}>
                <span style={{ fontWeight: 600 }}>Event:</span>{" "}
                {selectedEvent.title}
                <br />
                <span style={{ fontWeight: 600 }}>Subject:</span>{" "}
                {subjectLine && subjectLine.trim().length > 0
                  ? subjectLine
                  : `You're invited to ${selectedEvent.title}.`}
              </p>
            )}
          </div>
        )}

        {sendStage === "sending" && (
          <div
            style={{
              fontSize: "14px",
              opacity: 0.85,
              marginBottom: "12px",
            }}
          >
            <p style={{ marginBottom: "8px" }}>
              Sending to{" "}
              <span style={{ fontWeight: 600 }}>
                {sendingStats.totalRecipients.toLocaleString()}
              </span>{" "}
              contacts…
            </p>
            <p style={{ margin: 0 }}>
              Sent{" "}
              <span style={{ fontWeight: 600 }}>
                {sendingStats.totalSent.toLocaleString()}
              </span>{" "}
              / {sendingStats.totalRecipients.toLocaleString()}
              {sendingStats.totalFailed
                ? ` · ${sendingStats.totalFailed.toLocaleString()} failed`
                : ""}
            </p>
          </div>
        )}

        {sendStage === "success" && (
          <div
            style={{
              fontSize: "14px",
              opacity: 0.9,
              marginBottom: "12px",
            }}
          >
            <p style={{ marginBottom: "6px" }}>
              Successfully sent to{" "}
              <span style={{ fontWeight: 600 }}>
                {sendingStats.totalSent.toLocaleString()}
              </span>{" "}
              contacts.
            </p>
            {sendingStats.totalFailed > 0 && (
              <p style={{ margin: 0, opacity: 0.8 }}>
                {sendingStats.totalFailed.toLocaleString()} deliveries
                reported as failed.
              </p>
            )}
          </div>
        )}

        {sendStage === "error" && (
          <div
            style={{
              fontSize: "14px",
              color: "#f97373",
              marginBottom: "12px",
            }}
          >
            <p style={{ marginBottom: "6px" }}>
              We couldn't complete this send. No more emails will be sent.
            </p>
            {sendingErrorMessage && (
              <p style={{ margin: 0, opacity: 0.8 }}>
                {sendingErrorMessage}
              </p>
            )}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            marginTop: "8px",
          }}
        >
          {sendStage === "confirm" && (
            <>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(12,10,18,0.8)",
                  color: "#fff",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmSend}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: gradientPrimary,
                  color: "#05040a",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Send campaign
              </button>
            </>
          )}

          {sendStage === "sending" && (
            <button
              type="button"
              disabled
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(12,10,18,0.8)",
                color: "#fff",
                fontSize: "14px",
                opacity: 0.7,
                cursor: "not-allowed",
              }}
            >
              Sending…
            </button>
          )}

          {(sendStage === "success" || sendStage === "error") && (
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(12,10,18,0.8)",
                color: "#fff",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
