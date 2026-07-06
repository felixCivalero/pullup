// frontend/src/components/EventCommunicationPanel.jsx
//
// The event-scoped Communication panel — rendered inside the event editor's
// left rail (the chat icon). One place where the host controls EVERYTHING a
// guest hears about this event, as three plain steps:
//
//   1. Sign-up info  — sent the moment someone signs up
//   2. Reminder      — sent before the event (default ~12h)
//   3. Post-event    — sent after ("thanks — upload your photos")
//
// Each step is ONE message you write — a classic composer. The live details
// (date, location, room link…) drop in as inline CHIPS via the "Add" buttons:
// what you see in the box IS what goes out, with each chip showing this event's
// real detail. Chips always resolve to the real value, so a "reveal later"
// event can still hand over the time/place in the message.
// Reads/saves GET|PUT /host/events/:id/comms.
//
// EVERY <button> here MUST be type="button" — the panel renders inside the
// editor's <form onSubmit>, so an untyped button defaults to submit and would
// re-save the event + navigate away.

import { useState, useEffect, useCallback, useRef } from "react";
import { MessageSquare, Clock, CheckCircle2, Loader2, Plus, Send } from "lucide-react";
import { colors } from "../theme/colors.js";
import { authenticatedFetch } from "../lib/api.js";
import { useToast } from "./Toast";
import { TOKENS, STEP_TOKENS, bodyToHtml, serializeDom, chipText } from "../lib/commsTokens.js";

// Inline chip styling — passed to bodyToHtml (stored body → editor) and reused
// when inserting a fresh chip, so seeded and inserted chips always match.
const CHIP_CSS = `display:inline-block;padding:1px 9px;margin:0 1px;border-radius:999px;background:${colors.accentSoftStrong};color:${colors.accent};font-weight:700;font-size:0.86em;white-space:nowrap;`;

// A single message composer with inline detail-chips. ContentEditable owns its
// DOM (so the caret never jumps); we only re-seed the HTML when the body
// changes from OUTSIDE (load/save), never on the host's own keystrokes.
function TokenComposer({ value, sample, onChange, placeholder }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (serializeDom(el) !== (value || "")) el.innerHTML = bodyToHtml(value || "", sample, CHIP_CSS);
  }, [value, sample]);

  function emit() {
    if (ref.current) onChange(serializeDom(ref.current));
  }

  function insert(tokenStr) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    let range;
    if (sel && sel.rangeCount && el.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    } else {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }
    range.deleteContents();
    const chip = document.createElement("span");
    chip.setAttribute("contenteditable", "false");
    chip.dataset.token = tokenStr;
    chip.style.cssText = CHIP_CSS;
    chip.textContent = chipText(tokenStr, sample);
    const space = document.createTextNode(" ");
    const frag = document.createDocumentFragment();
    frag.appendChild(chip);
    frag.appendChild(space);
    range.insertNode(frag);
    // caret after the trailing space
    range.setStartAfter(space);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    emit();
  }

  // Expose insert() to the parent via a ref-like callback on the DOM node.
  useEffect(() => { if (ref.current) ref.current._insertToken = insert; });

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={emit}
      data-placeholder={placeholder || ""}
      className="pu-token-composer"
      style={{
        width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 12,
        border: `1px solid ${colors.borderStrong}`, background: "#fff", color: colors.text,
        fontSize: 14.5, lineHeight: 1.6, outline: "none", minHeight: 96, whiteSpace: "pre-wrap",
        wordBreak: "break-word", fontFamily: "inherit",
      }}
    />
  );
}

const numInput = {
  width: 70, boxSizing: "border-box", padding: "8px 10px", borderRadius: 9,
  border: `1px solid ${colors.borderStrong}`, background: "#fff", color: colors.text,
  fontSize: 14, fontWeight: 700, outline: "none", textAlign: "center",
};
const lbl = {
  fontSize: 11, fontWeight: 700, color: colors.textSubtle, marginBottom: 7,
  textTransform: "uppercase", letterSpacing: "0.05em",
};
const cardWrap = {
  borderRadius: 16, border: `1px solid ${colors.border}`, background: colors.surface,
  padding: "16px 16px 18px", marginBottom: 16,
};

function Switch({ on, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      style={{ width: 44, height: 26, flexShrink: 0, borderRadius: 999, border: "none", cursor: "pointer", background: on ? colors.accent : colors.borderStrong, position: "relative", transition: "background 0.15s" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
    </button>
  );
}

function StepHead({ n, title, subtitle, on, onToggle, toggleable }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
      <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: colors.accentSoftStrong, color: colors.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: colors.text }}>{title}</div>
        <div style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 2, lineHeight: 1.45 }}>{subtitle}</div>
      </div>
      {toggleable && <Switch on={on} onClick={onToggle} />}
    </div>
  );
}

export function EventCommunicationPanel({ eventId, isEditMode, kind = "event" }) {
  // Dateless kinds (community, product) have no moment to remind about or
  // follow up after — their arc is ONE message: the welcome. The date-anchored
  // steps disappear entirely (the schedulers skip these kinds server-side too).
  const dateless = kind !== "event";
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [sample, setSample] = useState({});
  const composerRefs = { signup: useRef(null), reminder: useRef(null), postEvent: useRef(null) };

  const load = useCallback(async () => {
    if (!eventId) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await authenticatedFetch(`/host/events/${eventId}/comms`);
      const d = r.ok ? await r.json() : null;
      if (d?.config) setCfg(d.config);
      if (d?.sample) setSample(d.sample);
    } catch { /* keep null → notice */ }
    finally { setLoading(false); }
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  function setBody(step, value) {
    setCfg((c) => (c ? { ...c, [step]: { ...c[step], body: value } } : c));
    setDirty(true);
  }
  function setField(step, key, value) {
    setCfg((c) => (c ? { ...c, [step]: { ...c[step], [key]: value } } : c));
    setDirty(true);
  }
  function addChip(step, tokenKey) {
    const node = composerRefs[step].current?.querySelector(".pu-token-composer");
    if (node && node._insertToken) node._insertToken(TOKENS[tokenKey].token);
  }

  async function save() {
    if (!eventId || !cfg || saving) return;
    setSaving(true);
    try {
      const r = await authenticatedFetch(`/host/events/${eventId}/comms`, { method: "PUT", body: JSON.stringify({ config: cfg }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        if (d.config) setCfg(d.config);
        setDirty(false);
        showToast("Communication saved", "success");
      } else {
        showToast("Couldn't save — try again", "error");
      }
    } catch {
      showToast("Couldn't save — try again", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 28, textAlign: "center", color: colors.textSubtle }}><Loader2 size={18} style={{ animation: "spin 0.9s linear infinite" }} /></div>;
  }
  if (!eventId || !cfg) {
    return (
      <div style={{ padding: "18px 16px", borderRadius: 14, background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, fontSize: 13.5, color: colors.textMuted, lineHeight: 1.55 }}>
        {isEditMode
          ? "Couldn't load the communication settings for this event. Refresh and try again."
          : "Once your event exists, you'll control everything guests hear about it right here — the welcome, the reminder, and the post-event note."}
      </div>
    );
  }

  // The "Add" toolbar for a step — drops a detail chip at the cursor.
  const AddBar = ({ step }) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: colors.textSubtle, alignSelf: "center", marginRight: 1 }}>Add:</span>
      {STEP_TOKENS[step].map((k) => (
        <button key={k} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addChip(step, k)}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 999, border: `1px solid ${colors.accentBorder}`, background: colors.accentSoft, color: colors.accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          <Plus size={12} strokeWidth={2.6} /> {TOKENS[k].label}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .pu-token-composer:empty:before{content:attr(data-placeholder);color:${colors.textSubtle};}
        .pu-token-composer:focus{border-color:${colors.accent}!important;}
      `}</style>

      {/* Intro */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 11, marginBottom: 18 }}>
        <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 11, background: colors.accentSoftStrong, color: colors.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <MessageSquare size={19} strokeWidth={2.2} />
        </div>
        <div>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: colors.text, letterSpacing: "-0.01em" }}>Communication</div>
          <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 1.5 }}>
            {dateless
              ? "The welcome people get the moment they join. Write it your way — tap \"Add\" to drop in the live details. What you see is what they get."
              : "Everything your guests hear about this event. Write each message — tap \"Add\" to drop in the live details. What you see is what they get."}
          </div>
        </div>
      </div>

      {/* ── Step 1: Sign-up info ─────────────────────────────────────────── */}
      <div style={cardWrap}>
        <StepHead n={1} title={dateless ? "Welcome message" : "Sign-up info"} subtitle={dateless ? "Sent the moment someone joins." : "Sent the moment someone signs up."} toggleable={false} />
        <div style={lbl}>Message</div>
        <div ref={composerRefs.signup}>
          <TokenComposer value={cfg.signup.body} sample={sample} onChange={(v) => setBody("signup", v)} placeholder="Write the welcome your guests get when they sign up…" />
        </div>
        <AddBar step="signup" />
      </div>

      {/* ── Steps 2+3: the date-anchored sends — dated events only ───────── */}
      {!dateless && (<>
      <div style={{ ...cardWrap, opacity: cfg.reminder.enabled ? 1 : 0.62 }}>
        <StepHead n={2} title="Reminder" subtitle="A nudge before the event so no one forgets." toggleable on={cfg.reminder.enabled} onToggle={() => setField("reminder", "enabled", !cfg.reminder.enabled)} />
        {cfg.reminder.enabled && (
          <>
            <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 6 }}><Clock size={12} /> When to send</div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
              <input type="number" min={1} max={72} value={cfg.reminder.hoursBefore}
                onChange={(e) => setField("reminder", "hoursBefore", Math.max(1, Math.min(72, Number(e.target.value) || 1)))} style={numInput} />
              <span style={{ fontSize: 13.5, color: colors.text, fontWeight: 600 }}>hours before the event</span>
            </div>
            <div style={lbl}>Message</div>
            <div ref={composerRefs.reminder}>
              <TokenComposer value={cfg.reminder.body} sample={sample} onChange={(v) => setBody("reminder", v)} placeholder="Write the reminder…" />
            </div>
            <AddBar step="reminder" />
          </>
        )}
      </div>

      {/* ── Step 3: Post-event ───────────────────────────────────────────── */}
      <div style={{ ...cardWrap, opacity: cfg.postEvent.enabled ? 1 : 0.62 }}>
        <StepHead n={3} title="Post-event" subtitle="A thank-you after it's over — and a nudge to drop their photos in the room." toggleable on={cfg.postEvent.enabled} onToggle={() => setField("postEvent", "enabled", !cfg.postEvent.enabled)} />
        {cfg.postEvent.enabled && (
          <>
            <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 6 }}><Clock size={12} /> When to send</div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
              <input type="number" min={0} max={168} value={cfg.postEvent.hoursAfter}
                onChange={(e) => setField("postEvent", "hoursAfter", Math.max(0, Math.min(168, Number(e.target.value) || 0)))} style={numInput} />
              <span style={{ fontSize: 13.5, color: colors.text, fontWeight: 600 }}>hours after it ends</span>
            </div>
            <div style={lbl}>Message</div>
            <div ref={composerRefs.postEvent}>
              <TokenComposer value={cfg.postEvent.body} sample={sample} onChange={(v) => setBody("postEvent", v)} placeholder="Write the post-event thank-you…" />
            </div>
            <AddBar step="postEvent" />
          </>
        )}
      </div>
      </>)}

      <div style={{ fontSize: 11.5, color: colors.textSubtle, lineHeight: 1.5, margin: "2px 2px 14px" }}>
        Goes out on WhatsApp or email, whichever reaches each guest. (WhatsApp recipients get an approved template version.)
      </div>

      {/* Save bar */}
      <div style={{ position: "sticky", bottom: 0, paddingTop: 4, paddingBottom: 8, background: `linear-gradient(to top, ${colors.bg || "#fff"} 70%, transparent)` }}>
        <button type="button" onClick={save} disabled={!dirty || saving}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px", borderRadius: 12, border: "none", background: dirty ? colors.accent : colors.surfaceMuted, color: dirty ? "#fff" : colors.textSubtle, fontWeight: 800, fontSize: 14, cursor: dirty && !saving ? "pointer" : "default", boxShadow: dirty ? colors.accentShadow : "none" }}>
          {saving ? <Loader2 size={16} style={{ animation: "spin 0.9s linear infinite" }} /> : dirty ? <Send size={16} /> : <CheckCircle2 size={16} />}
          {saving ? "Saving…" : dirty ? "Save communication" : "Saved"}
        </button>
      </div>
    </div>
  );
}

export default EventCommunicationPanel;
