// TokenizedInput — wraps a controlled <input> or <textarea>, renders a
// pill row beneath, and (optionally) a "+ Link" button that opens a small
// dialog and wraps the current selection in `[label](url)` syntax. The
// visible value shows friendly labels like [First name] while the stored
// value carries `{{first_name}}`; conversion happens at the input boundary.

import { useRef, useState } from "react";
import { TOKENS, tokensToLabels, labelsToTokens, isAllowedUrl } from "../../lib/emailTokens";

export default function TokenizedInput({
  value,
  onChange,
  multiline = false,
  rows = 3,
  placeholder = "",
  style = {},
  tokens = TOKENS,
  enableLinks = false,
}) {
  const ref = useRef(null);
  const [linkDialog, setLinkDialog] = useState(null); // { selStart, selEnd, label }
  const display = tokensToLabels(value, tokens);

  function handleChange(nextDisplay) {
    onChange(labelsToTokens(nextDisplay, tokens));
  }

  function insertText(text, replaceSelection = false) {
    const el = ref.current;
    if (!el) {
      handleChange(display + text);
      return;
    }
    const start = el.selectionStart ?? display.length;
    const end = el.selectionEnd ?? display.length;
    const next = display.slice(0, start) + text + display.slice(replaceSelection ? end : start);
    handleChange(next);
    requestAnimationFrame(() => {
      const pos = start + text.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function insertToken(label) {
    insertText(`[${label}]`);
  }

  function openLinkDialog() {
    const el = ref.current;
    const start = el?.selectionStart ?? display.length;
    const end = el?.selectionEnd ?? display.length;
    const selected = display.slice(start, end);
    setLinkDialog({ selStart: start, selEnd: end, label: selected || "" });
  }

  function commitLink({ label, url }) {
    const trimmedUrl = (url || "").trim();
    // Prepend mailto: for bare email addresses
    const finalUrl = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedUrl)
      ? `mailto:${trimmedUrl}`
      : trimmedUrl;
    if (!isAllowedUrl(finalUrl)) {
      // Reject silently and reopen for correction.
      return false;
    }
    const finalLabel = label.trim() || finalUrl;
    const insertion = `[${finalLabel}](${finalUrl})`;
    const { selStart, selEnd } = linkDialog;
    const next = display.slice(0, selStart) + insertion + display.slice(selEnd);
    handleChange(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const pos = selStart + insertion.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
    setLinkDialog(null);
    return true;
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
      {(tokens.length > 0 || enableLinks) && (
        <div style={pillRowStyle}>
          {tokens.map((t) => (
            <button
              key={t.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertToken(t.label)}
              style={pillStyle}
              title={`Insert [${t.label}]`}
            >
              + {t.label}
            </button>
          ))}
          {enableLinks && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={openLinkDialog}
              style={linkPillStyle}
              title="Add a link or email"
            >
              + Link
            </button>
          )}
        </div>
      )}
      {linkDialog && (
        <LinkDialog
          initialLabel={linkDialog.label}
          onCancel={() => setLinkDialog(null)}
          onSubmit={commitLink}
        />
      )}
    </div>
  );
}

function LinkDialog({ initialLabel, onCancel, onSubmit }) {
  const [label, setLabel] = useState(initialLabel || "");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!url.trim()) {
      setError("URL or email required");
      return;
    }
    const ok = onSubmit({ label, url });
    if (!ok) setError("Use https://, http://, or an email address");
  }

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <form
        style={dialogStyle}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Add link</div>
        <label style={dialogLabel}>
          Link text
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="(falls back to URL)"
            style={dialogInput}
            autoFocus={!initialLabel}
          />
        </label>
        <label style={dialogLabel}>
          URL or email
          <input
            type="text"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(""); }}
            placeholder="https://example.com or alex@cliff.se"
            style={dialogInput}
            autoFocus={Boolean(initialLabel)}
          />
        </label>
        {error && <div style={{ color: "#fca5a5", fontSize: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onCancel} style={cancelBtn}>Cancel</button>
          <button type="submit" style={submitBtn}>Add link</button>
        </div>
      </form>
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

const linkPillStyle = {
  ...pillStyle,
  border: "1px solid rgba(96,165,250,0.3)",
  background: "rgba(96,165,250,0.08)",
  color: "#60a5fa",
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1100,
  padding: 20,
};

const dialogStyle = {
  width: "100%",
  maxWidth: 380,
  padding: 18,
  borderRadius: 14,
  background: "rgba(20,16,30,0.97)",
  border: "1px solid rgba(255,255,255,0.12)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  color: "#fff",
};

const dialogLabel = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 11,
  opacity: 0.7,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const dialogInput = {
  ...inputStyle,
  textTransform: "none",
  letterSpacing: "normal",
  opacity: 1,
};

const cancelBtn = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "transparent",
  color: "#fff",
  fontSize: 13,
  cursor: "pointer",
};

const submitBtn = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: "linear-gradient(135deg, rgba(96,165,250,0.4), rgba(96,165,250,0.2))",
  color: "#bfdbfe",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
