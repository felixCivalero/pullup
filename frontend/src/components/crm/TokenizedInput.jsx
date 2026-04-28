// TokenizedInput — wraps a controlled <input> or <textarea> and renders a
// pill row of token buttons beneath. The visible value shows friendly
// labels like [First name] while the stored value carries {{first_name}}
// machinery; conversion happens at the input boundary.

import { useRef } from "react";
import { TOKENS, tokensToLabels, labelsToTokens } from "../../lib/emailTokens";

export default function TokenizedInput({
  value,
  onChange,
  multiline = false,
  rows = 3,
  placeholder = "",
  style = {},
  tokens = TOKENS,
}) {
  const ref = useRef(null);
  const display = tokensToLabels(value, tokens);

  function handleChange(nextDisplay) {
    onChange(labelsToTokens(nextDisplay, tokens));
  }

  function insertToken(label) {
    const el = ref.current;
    const insert = `[${label}]`;
    if (!el) {
      handleChange(display + insert);
      return;
    }
    const start = el.selectionStart ?? display.length;
    const end = el.selectionEnd ?? display.length;
    const next = display.slice(0, start) + insert + display.slice(end);
    handleChange(next);
    requestAnimationFrame(() => {
      const pos = start + insert.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  const Tag = multiline ? "textarea" : "input";
  const elProps = multiline
    ? { rows, style: { ...inputStyle, ...style, fontFamily: "inherit", resize: "vertical" } }
    : { type: "text", style: { ...inputStyle, ...style } };

  return (
    <div>
      <Tag
        ref={ref}
        value={display}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        {...elProps}
      />
      {tokens.length > 0 && (
        <div style={pillRowStyle}>
          {tokens.map((t) => (
            <button
              key={t.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()} /* keep focus on input */
              onClick={() => insertToken(t.label)}
              style={pillStyle}
              title={`Insert [${t.label}]`}
            >
              + {t.label}
            </button>
          ))}
        </div>
      )}
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

const pillRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  marginTop: "6px",
};

const pillStyle = {
  padding: "4px 10px",
  borderRadius: "999px",
  border: "1px solid rgba(212,175,55,0.25)",
  background: "rgba(212,175,55,0.08)",
  color: "#d4af37",
  fontSize: "11px",
  fontWeight: 500,
  cursor: "pointer",
  letterSpacing: "0.02em",
};
