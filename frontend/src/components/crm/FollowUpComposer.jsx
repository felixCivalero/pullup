// FollowUpComposer — controls-only. The recipient's-eye preview lives in
// <EmailCanvas /> on the right; this is the form on the left.

import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";
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
  greeting,
  setGreeting,
  greetingAlign,
  setGreetingAlign,
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
            <Field label="Subject">
              <TokenizedInput value={subject} onChange={setSubject} tokens={tokens} placeholder="Subject line…" />
            </Field>
            <Field label="Preview text (preheader)">
              <TokenizedInput value={previewText} onChange={setPreviewText} tokens={tokens} placeholder="Inbox preview snippet…" />
            </Field>
          </Section>

          <Section label="Content" variant="content">
            <HoverCard
              hovered={hoveredKey === "greeting"}
              onMouseEnter={() => setHoveredKey?.("greeting")}
              onMouseLeave={() => setHoveredKey?.(null)}
              label="Greeting"
            >
              <TokenizedInput
                multiline
                rows={2}
                value={greeting}
                onChange={setGreeting}
                tokens={tokens}
                enableLinks
                placeholder="Hi [First name],"
              />
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                {[
                  { v: "left", icon: AlignLeft, label: "Left" },
                  { v: "center", icon: AlignCenter, label: "Center" },
                  { v: "right", icon: AlignRight, label: "Right" },
                ].map((opt) => {
                  const Icon = opt.icon;
                  const active = (greetingAlign || "left") === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setGreetingAlign?.(opt.v)}
                      title={opt.label}
                      style={greetingAlignBtnStyle(active)}
                    >
                      <Icon size={14} />
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, opacity: 0.45, marginTop: 6 }}>
                Auto-personalized per recipient.
              </div>
            </HoverCard>
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

// Mirrors the CreateEventPage section card: gray bg, lime hover border,
// small uppercase type label at top.
function HoverCard({ hovered, onMouseEnter, onMouseLeave, label, children }) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        padding: "14px 16px",
        background: "rgba(255,255,255,0.04)",
        border: hovered
          ? "1px solid rgba(163, 230, 53, 0.5)"
          : "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12,
        transition: "border-color 0.15s ease",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.25)", marginBottom: 8, userSelect: "none" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const greetingAlignBtnStyle = (active) => ({
  flex: 1,
  padding: "6px 0",
  borderRadius: 6,
  border: `1px solid ${active ? "rgba(212,175,55,0.5)" : "rgba(255,255,255,0.1)"}`,
  background: active ? "rgba(212,175,55,0.15)" : "rgba(12,10,18,0.6)",
  color: active ? "#d4af37" : "rgba(255,255,255,0.7)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

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
