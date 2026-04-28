// TokenizedInput — wraps a controlled <input> or <textarea> and renders a
// pill row of token buttons beneath it. Clicking a pill inserts the
// `{{token}}` at the current cursor position.

import { useRef } from "react";
import { TOKENS } from "../../lib/emailTokens";

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

  function insertToken(key) {
    const el = ref.current;
    const tokenStr = `{{${key}}}`;
    if (!el) {
      onChange((value || "") + tokenStr);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + tokenStr + value.slice(end);
    onChange(next);
    // Restore cursor after the inserted token on next tick.
    requestAnimationFrame(() => {
      const pos = start + tokenStr.length;
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
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        {...elProps}
      />
      <div style={pillRowStyle}>
        {tokens.map((t) => (
          <button
            key={t.key}
            type="button"
            onMouseDown={(e) => e.preventDefault()} /* keep focus on input */
            onClick={() => insertToken(t.key)}
            style={pillStyle}
            title={`Insert {{${t.key}}}`}
          >
            + {t.label}
          </button>
        ))}
      </div>
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
