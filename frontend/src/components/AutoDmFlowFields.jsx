// frontend/src/components/AutoDmFlowFields.jsx
//
// The conversational comment→DM builder, shared by the event-editor panel
// (EventAutoDmPanel) and the standalone /auto-dm page so both stay identical.
//
// The product opinion baked into the framing: the DM is how you get in. You
// never just drop a link — you ask something first (a CTA or a question), the
// guest REPLIES to unlock, and that reply opens the DM window AND tells you
// something about them. The split (answer A vs B) is a quiet power-up, off by
// default. There is intentionally no "just send the link" path here.

import { Link2, Sparkles } from "lucide-react";
import { colors } from "../theme/colors.js";

const input = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${colors.borderStrong}`,
  background: "#fff",
  color: colors.text,
  fontSize: 14,
  outline: "none",
};
const ta = { ...input, resize: "none", lineHeight: 1.5, fontFamily: "inherit" };
const lbl = {
  fontSize: 11,
  fontWeight: 700,
  color: colors.textSubtle,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};
const hint = { fontSize: 11.5, color: colors.textMuted, marginTop: 6, lineHeight: 1.45 };

// Curated, on-brand starting points — static (no AI). The placeholder teaches
// the pattern; these get them there in one tap.
const EXAMPLE_OPENERS = [
  "Before I send it — what's pulling you out to this?",
  "Real quick, who put you onto us?",
  "Say LETS GO and it's yours 🔥",
  "What are you hoping to get out of the night?",
];

// ── State helpers (the draft the parent holds) ──────────────────────
export const emptyFlowDraft = () => ({
  opener: "",
  answerA: { text: "", includeLink: true },
  splitOn: false,
  splitKeyword: "",
  splitMatch: "contains",
  answerB: { text: "", includeLink: true },
});

/** Hydrate the editor draft from an API flow object (for editing an existing one). */
export function flowDraftFromFlow(flow) {
  if (!flow || !flow.opener) return emptyFlowDraft();
  return {
    opener: flow.opener || "",
    answerA: { text: flow.answerA?.text || "", includeLink: flow.answerA?.includeLink !== false },
    splitOn: !!flow.split,
    splitKeyword: flow.split?.keyword || "",
    splitMatch: flow.split?.match === "exact" ? "exact" : "contains",
    answerB: { text: flow.answerB?.text || "", includeLink: flow.answerB?.includeLink !== false },
  };
}

/** Convert the draft to the API `flow` payload, or null if there's no opener. */
export function toFlowPayload(d) {
  const opener = (d?.opener || "").trim();
  if (!opener) return null;
  const payload = {
    opener,
    answerA: { text: (d.answerA?.text || "").trim(), includeLink: d.answerA?.includeLink !== false },
  };
  if (d.splitOn && (d.splitKeyword || "").trim()) {
    payload.split = { keyword: d.splitKeyword.trim(), match: d.splitMatch === "exact" ? "exact" : "contains" };
    payload.answerB = { text: (d.answerB?.text || "").trim(), includeLink: d.answerB?.includeLink !== false };
  }
  return payload;
}

function LinkToggle({ on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Attach this event's signup link to the message"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11.5,
        fontWeight: 700,
        padding: "4px 10px",
        borderRadius: 999,
        cursor: "pointer",
        border: `1px solid ${on ? colors.instagramBorder : colors.borderStrong}`,
        background: on ? colors.instagramSoft : "#fff",
        color: on ? colors.instagram : colors.textSubtle,
      }}
    >
      <Link2 size={12} /> {on ? "Link attached" : "Add link"}
    </button>
  );
}

const focusOn = (e) => (e.target.style.borderColor = colors.instagramBorder);
const focusOff = (e) => (e.target.style.borderColor = colors.borderStrong);

/**
 * @param {object} value     the draft (emptyFlowDraft shape)
 * @param {function} onChange (nextDraft) => void
 */
export function AutoDmFlowFields({ value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* OPENER — the thing they have to reply to */}
      <div>
        <div style={lbl}>Your opener · what they reply to</div>
        <textarea
          value={value.opener}
          onChange={(e) => set({ opener: e.target.value })}
          rows={2}
          placeholder="Before I send the link — what's pulling you out to this?"
          style={ta}
          onFocus={focusOn}
          onBlur={focusOff}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {EXAMPLE_OPENERS.map((o) => (
            <button
              type="button"
              key={o}
              onClick={() => set({ opener: o })}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11.5,
                fontWeight: 600,
                padding: "5px 10px",
                borderRadius: 999,
                cursor: "pointer",
                border: `1px solid ${colors.border}`,
                background: "#fff",
                color: colors.textMuted,
              }}
            >
              <Sparkles size={11} color={colors.instagram} />
              {o.length > 30 ? o.slice(0, 28) + "…" : o}
            </button>
          ))}
        </div>
        <div style={hint}>
          They have to reply to get in — that opens the DM window (so you can keep talking) and tells you something about them. Their answer lands in their Room.
        </div>
      </div>

      {/* ANSWER A — the payoff */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ ...lbl, marginBottom: 0 }}>{value.splitOn ? "If their reply matches →" : "What they get back"}</div>
          <LinkToggle on={value.answerA.includeLink} onClick={() => set({ answerA: { ...value.answerA, includeLink: !value.answerA.includeLink } })} />
        </div>
        <textarea
          value={value.answerA.text}
          onChange={(e) => set({ answerA: { ...value.answerA, text: e.target.value } })}
          rows={2}
          placeholder={value.answerA.includeLink ? "You're in 🎟️ (the link is attached below)" : "Type the reply…"}
          style={ta}
          onFocus={focusOn}
          onBlur={focusOff}
        />
      </div>

      {/* SPLIT — quiet power-up */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          fontSize: 13,
          fontWeight: 600,
          color: colors.text,
          cursor: "pointer",
          padding: "2px 0",
        }}
      >
        <input
          type="checkbox"
          checked={value.splitOn}
          onChange={(e) => set({ splitOn: e.target.checked })}
          style={{ width: 16, height: 16, accentColor: colors.instagram, cursor: "pointer" }}
        />
        Should their answer change your reply?
      </label>

      {value.splitOn && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingLeft: 12, borderLeft: `2px solid ${colors.instagramBorder}` }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px" }}>
              <div style={lbl}>Use the first answer if their reply contains…</div>
              <input
                value={value.splitKeyword}
                onChange={(e) => set({ splitKeyword: e.target.value })}
                placeholder="solo, just me"
                style={input}
                onFocus={focusOn}
                onBlur={focusOff}
              />
              <div style={hint}>Comma-separate a few — any match wins.</div>
            </div>
            <div style={{ flex: "0 0 120px" }}>
              <div style={lbl}>Match</div>
              <select value={value.splitMatch} onChange={(e) => set({ splitMatch: e.target.value })} style={{ ...input, cursor: "pointer" }}>
                <option value="contains">contains</option>
                <option value="exact">exact</option>
              </select>
            </div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ ...lbl, marginBottom: 0 }}>Otherwise →</div>
              <LinkToggle on={value.answerB.includeLink} onClick={() => set({ answerB: { ...value.answerB, includeLink: !value.answerB.includeLink } })} />
            </div>
            <textarea
              value={value.answerB.text}
              onChange={(e) => set({ answerB: { ...value.answerB, text: e.target.value } })}
              rows={2}
              placeholder="Even better — grab the crew 👇"
              style={ta}
              onFocus={focusOn}
              onBlur={focusOff}
            />
          </div>
        </div>
      )}
    </div>
  );
}
