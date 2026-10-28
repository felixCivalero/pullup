import { useState } from "react";
import { createPortal } from "react-dom";
import { applyTokens, buildPreviewContext } from "../../lib/emailTokens";
import { colors } from "./mailColors.js";

// datetime-local wants "YYYY-MM-DDTHH:MM" in LOCAL time (no offset). Build it
// from the local field getters so the min attr and the value round-trip in the
// host's own timezone.
function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  currentUserFirstName,
  templateType,
  subjectLine,
  previewText,
  blocks,
  onClose,
  onConfirmSend,
  onSchedule,
  senderName,
}) {
  // "now" = fire immediately (existing path); "later" = schedule_at.
  const [mode, setMode] = useState("now");
  const [whenLocal, setWhenLocal] = useState("");
  const [scheduling, setScheduling] = useState(false);
  if (!isOpen) return null;
  const isFollowup = templateType === "followup";
  const nowLocal = toLocalInputValue(new Date());
  const scheduledDate = whenLocal ? new Date(whenLocal) : null;
  const scheduleValid =
    scheduledDate && !Number.isNaN(scheduledDate.getTime()) && scheduledDate.getTime() > Date.now();
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const blockSummary = summarizeBlocks(blocks);
  // Resolve tokens so the host sees a real subject ("You're invited to
  // Hallon Spritz") instead of the literal "{{event_title}}" in the
  // preview text row.
  const ctx = buildPreviewContext({ currentUserFirstName, event: selectedEvent });
  const resolvedSubject = applyTokens(subjectLine || "", ctx);
  const resolvedPreviewText = applyTokens(previewText || "", ctx);

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
            ? "Redo att skicka?"
            : sendStage === "sending"
            ? "Skickar…"
            : sendStage === "success"
            ? "Skickat"
            : "Utskicket misslyckades"}
        </h3>

        {sendStage === "confirm" && (
          <>
            {/* Big recipient number + template pill */}
            <div style={heroBlockStyle}>
              <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1 }}>
                {effectiveRecipientCount.toLocaleString()}
              </div>
              <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
                {effectiveRecipientCount === 1 ? "mottagare" : "mottagare"}
              </div>
              <div style={{ marginTop: 10 }}>
                <span style={pillStyle(isFollowup)}>
                  {isFollowup ? "Uppföljning" : "Inbjudan"}
                </span>
              </div>
            </div>

            {/* Summary card */}
            <div style={summaryCardStyle}>
              {senderName && <Row label="Från">{senderName}</Row>}
              {selectedEvent && (
                <Row label="Event">{selectedEvent.title}</Row>
              )}
              {resolvedSubject && <Row label="Ämne">{resolvedSubject}</Row>}
              {resolvedPreviewText && <Row label="Förhandstext">{resolvedPreviewText}</Row>}
              {blockSummary && <Row label="Innehåll">{blockSummary}</Row>}
            </div>

            {/* Send now vs. schedule (only where scheduling exists) */}
            {onSchedule && <div style={{ display: "flex", gap: 8, marginBottom: mode === "later" ? 10 : 14 }}>
              <button type="button" onClick={() => setMode("now")} style={modePillStyle(mode === "now")}>
                Skicka nu
              </button>
              <button type="button" onClick={() => setMode("later")} style={modePillStyle(mode === "later")}>
                Schemalägg
              </button>
            </div>}

            {mode === "later" && (
              <div style={{ marginBottom: 14 }}>
                <input
                  type="datetime-local"
                  value={whenLocal}
                  min={nowLocal}
                  onChange={(e) => setWhenLocal(e.target.value)}
                  style={dtInputStyle}
                />
                <div style={{ fontSize: 11, color: colors.textSubtle, marginTop: 6, lineHeight: 1.5 }}>
                  Skickas automatiskt vid den tiden ({localTz}), du behöver inte vara inloggad.
                  Mottagarna räknas om då, så nya anmälningar kommer med.
                </div>
              </div>
            )}

            {mode === "now" && (
              <div style={noteStyle}>
                När du skickar går mejlen ut direkt och kan inte tas tillbaka.
                Den som avregistrerat sig får aldrig mejlet.
              </div>
            )}
          </>
        )}

        {sendStage === "sending" && (
          <div style={progressBlockStyle}>
            <Spinner />
            <div style={{ marginTop: 16, fontSize: 14 }}>
              Skickar till{" "}
              <strong>{sendingStats.totalRecipients.toLocaleString()}</strong>{" "}
              {sendingStats.totalRecipients === 1 ? "mottagare" : "mottagare"}…
            </div>
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>
              {sendingStats.totalSent.toLocaleString("sv-SE")} skickade
              {sendingStats.totalFailed > 0 && (
                <> · {sendingStats.totalFailed.toLocaleString("sv-SE")} misslyckades</>
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
              Skickat till <strong>{sendingStats.totalSent.toLocaleString()}</strong>{" "}
              {sendingStats.totalSent === 1 ? "mottagare" : "mottagare"}.
            </div>
            {sendingStats.totalFailed > 0 && (
              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.7 }}>
                {sendingStats.totalFailed.toLocaleString("sv-SE")} mejl gick inte fram.
              </div>
            )}
          </div>
        )}

        {sendStage === "error" && (
          <div style={{ ...progressBlockStyle, color: colors.danger }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>
              Utskicket kunde inte slutföras. Inga fler mejl skickas.
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
                Avbryt
              </button>
              {mode === "now" ? (
                <button type="button" onClick={onConfirmSend} style={sendBtnStyle}>
                  Skicka till {effectiveRecipientCount.toLocaleString("sv-SE")}{" "}
                  {effectiveRecipientCount === 1 ? "mottagare" : "mottagare"} →
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!scheduleValid || scheduling}
                  onClick={async () => {
                    if (!scheduleValid || scheduling) return;
                    setScheduling(true);
                    try {
                      await onSchedule(scheduledDate.toISOString());
                    } finally {
                      setScheduling(false);
                    }
                  }}
                  style={!scheduleValid || scheduling ? disabledBtnStyle : sendBtnStyle}
                >
                  {scheduling ? "Schemalägger…" : "Schemalägg →"}
                </button>
              )}
            </>
          )}
          {sendStage === "sending" && (
            <button type="button" disabled style={disabledBtnStyle}>Skickar…</button>
          )}
          {(sendStage === "success" || sendStage === "error") && (
            <button type="button" onClick={onClose} style={cancelBtnStyle}>Stäng</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", padding: "8px 0", borderBottom: `1px solid ${colors.border}`, gap: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: colors.textFaded, textTransform: "uppercase", letterSpacing: "0.04em", flex: "0 0 90px" }}>
        {label}
      </div>
      <div style={{ flex: 1, fontSize: 13, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {children}
      </div>
    </div>
  );
}

function ProgressBar({ total, done }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div style={{ width: "100%", height: 4, background: colors.border, borderRadius: 999, marginTop: 14, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: colors.success, transition: "width 0.4s ease" }} />
    </div>
  );
}

function Spinner() {
  return (
    <>
      <style>{`@keyframes pu-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{
        width: 32, height: 32,
        border: `3px solid ${colors.border}`,
        borderTopColor: colors.accent,
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
      background: colors.successRgba,
      border: `1px solid rgba(22,163,74,0.35)`,
      color: colors.success,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 22, fontWeight: 700,
    }}>✓</div>
  );
}

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(10,10,10,0.55)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1100, padding: 20, backdropFilter: "blur(4px)",
};

const dialogStyle = {
  background: "#fff",
  borderRadius: 16,
  padding: "24px 24px 20px",
  width: "100%",
  maxWidth: 440,
  border: `1px solid ${colors.border}`,
  boxShadow: "0 8px 30px rgba(10,10,10,0.10)",
  color: colors.text,
};

const titleStyle = {
  fontSize: 18,
  fontWeight: 700,
  margin: "0 0 16px",
  color: colors.text,
};

const heroBlockStyle = {
  textAlign: "center",
  padding: "16px 0 18px",
};

const summaryCardStyle = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: "4px 14px",
  marginBottom: 14,
};

const noteStyle = {
  fontSize: 11,
  color: colors.textSubtle,
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
  borderRadius: 999,
  border: `1px solid ${colors.borderStrong}`,
  background: "transparent",
  color: colors.text,
  fontSize: 14,
  cursor: "pointer",
};

const sendBtnStyle = {
  padding: "10px 18px",
  borderRadius: 999,
  border: "none",
  background: colors.accent,
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: colors.accentShadow,
};

const disabledBtnStyle = {
  padding: "10px 16px",
  borderRadius: 999,
  border: `1px solid ${colors.border}`,
  background: colors.surface,
  color: colors.textFaded,
  fontSize: 14,
  cursor: "not-allowed",
};

const modePillStyle = (active) => ({
  flex: 1,
  padding: "8px 12px",
  borderRadius: 10,
  border: active ? `1px solid ${colors.accentBorder}` : `1px solid ${colors.border}`,
  background: active ? colors.accentSoft : "transparent",
  color: active ? colors.accent : colors.textMuted,
  fontSize: 13,
  fontWeight: active ? 600 : 500,
  cursor: "pointer",
});

const dtInputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  background: "#fff",
  color: colors.text,
  fontSize: 14,
  boxSizing: "border-box",
  colorScheme: "light",
};

const pillStyle = (isFollowup) => ({
  display: "inline-block",
  padding: "3px 10px",
  fontSize: 10,
  fontWeight: 600,
  borderRadius: 999,
  background: isFollowup ? colors.secondarySoft : colors.accentSoft,
  color: isFollowup ? colors.secondary : colors.accent,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
});
