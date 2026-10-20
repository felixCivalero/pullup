// The two "backs" a card flips to.
//   EditFace      — a realistic post / email composer (future content).
//   AnalyticsFace — how a post that already ran did, typed in by hand
//                   (stored on the card as meta.stats).
// Both are presentational: they take a card + onSet and render in the card's width.
import { useState } from "react";
import {
  Heart, MessageCircle, Bookmark, Eye, MailOpen, MousePointerClick,
  Trash2, CalendarDays, BarChart3, Hash, X, Send,
} from "lucide-react";
import { CHANNELS, TYPES } from "./plannerConstants.js";
import { colors } from "../../theme/colors.js";

const STAT_FIELDS = {
  email: [
    { key: "delivered", label: "Delivered", Icon: Send },
    { key: "opens", label: "Opens", Icon: MailOpen },
    { key: "clicks", label: "Clicks", Icon: MousePointerClick },
    { key: "bounced", label: "Bounced", Icon: X },
  ],
  social: [
    { key: "reach", label: "Reach", Icon: Eye },
    { key: "likes", label: "Likes", Icon: Heart },
    { key: "comments", label: "Comments", Icon: MessageCircle },
    { key: "saves", label: "Saves", Icon: Bookmark },
  ],
};

// ── Analytics back ──────────────────────────────────────────────────
export function AnalyticsFace({ card, accent, ranOn, onSet, onEdit }) {
  const fields = STAT_FIELDS[card.channel === "email" ? "email" : "social"];
  const meta = card.meta || {};
  const stats = meta.stats || {};
  const setStat = (key, raw) => {
    const n = raw === "" ? undefined : Math.max(0, Math.round(Number(raw)));
    if (raw !== "" && !Number.isFinite(n)) return;
    const next = { ...stats, [key]: n };
    if (n === undefined) delete next[key];
    onSet(card.id, { meta: { ...meta, stats: next } });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", color: colors.text }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 11px", borderBottom: `1px solid ${colors.border}`, background: `linear-gradient(90deg, ${accent}14, transparent)` }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.02em" }}>
          <BarChart3 size={13} color={accent} /> Performance
        </span>
        {ranOn && <span style={{ fontSize: 9.5, color: colors.textSubtle }}>{ranOn}</span>}
      </div>

      <div style={{ padding: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
        {fields.map((f) => (
          <label key={f.key} style={{ borderRadius: 8, background: colors.surface, border: `1px solid ${colors.border}`, padding: "8px 9px", display: "block" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: colors.textSubtle }}>
              <f.Icon size={11} /> {f.label}
            </div>
            <input
              inputMode="numeric"
              placeholder="–"
              value={stats[f.key] ?? ""}
              onChange={(e) => setStat(f.key, e.target.value.replace(/[^0-9]/g, ""))}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ marginTop: 3, width: "100%", border: 0, outline: "none", background: "transparent", padding: 0, fontSize: 18, fontWeight: 700, lineHeight: 1, color: colors.text, fontFamily: "inherit" }}
            />
          </label>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderTop: `1px solid ${colors.border}` }}>
        <span style={{ fontSize: 9, color: colors.textFaded }}>Type in the numbers</span>
        <button onClick={onEdit} style={linkBtn}>Edit post</button>
      </div>
    </div>
  );
}

// ── Edit / compose back ─────────────────────────────────────────────
export function EditFace({ card, events, formats = [], timelines = [], accent, onSet, onRemove }) {
  const ch = card.channel ? CHANNELS[card.channel] : null;
  const isEmail = card.channel === "email";
  const allowedTypes = ch ? ch.types || [] : [];
  const showType = allowedTypes.length > 1;
  const meta = card.meta || {};
  const setMeta = (patch) => onSet(card.id, { meta: { ...meta, ...patch } });

  const onChannelChange = (value) => {
    const newCh = value || null;
    const allowed = newCh ? CHANNELS[newCh].types || [] : [];
    let nextType = card.contentType;
    if (allowed.length === 0) nextType = "image";
    else if (allowed.length === 1) nextType = allowed[0];
    else if (!allowed.includes(card.contentType)) nextType = allowed[0];
    onSet(card.id, { channel: newCh, contentType: nextType });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", color: colors.text }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 11px", borderBottom: `1px solid ${colors.border}`, background: `linear-gradient(90deg, ${accent}14, transparent)` }}>
        {ch ? <ch.Icon size={14} color={accent} /> : <Hash size={13} color={colors.textSubtle} />}
        <span style={{ fontSize: 11.5, fontWeight: 700 }}>{ch ? `Compose · ${ch.label}` : "Compose"}</span>
      </div>

      <div style={{ padding: 11, display: "flex", flexDirection: "column", gap: 10 }}>
        <FieldRow>
          <select value={card.channel || ""} onChange={(e) => onChannelChange(e.target.value)} style={selectStyle}>
            <option value="">Choose channel…</option>
            {Object.entries(CHANNELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          {showType && (
            <select value={card.contentType} onChange={(e) => onSet(card.id, { contentType: e.target.value })} style={selectStyle}>
              {allowedTypes.map((k) => (
                <option key={k} value={k}>{TYPES[k].label}</option>
              ))}
            </select>
          )}
        </FieldRow>

        {isEmail ? (
          <>
            <Field label="Subject">
              <input value={meta.subject || ""} onChange={(e) => setMeta({ subject: e.target.value })} placeholder="Subject line…" style={inputStyle} />
            </Field>
            <Field label="Body" grow>
              <textarea value={meta.body || ""} onChange={(e) => setMeta({ body: e.target.value })} placeholder="Write your email…" style={{ ...textareaStyle, minHeight: 120 }} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Caption" grow>
              <textarea value={meta.caption || ""} onChange={(e) => setMeta({ caption: e.target.value })} placeholder="Write your caption…" style={{ ...textareaStyle, minHeight: 96 }} />
            </Field>
            <Field label="Hashtags">
              <TagInput tags={meta.tags || []} accent={accent} onChange={(tags) => setMeta({ tags })} />
            </Field>
          </>
        )}

        <Field label="Event">
          <select value={card.eventId || ""} onChange={(e) => onSet(card.id, { eventId: e.target.value || null })} style={selectStyle}>
            <option value="">No event</option>
            {(events || []).map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
        </Field>

        <Field label="Format">
          <FormatPicker value={meta.format || ""} formats={formats} onChange={(format) => setMeta({ format })} />
        </Field>

        {timelines.length > 1 && (() => {
          const on = card.timelineIds?.length ? card.timelineIds : timelines[0] ? [timelines[0].id] : [];
          const coPost = on.length > 1;
          const toggle = (id) => {
            const next = on.includes(id) ? on.filter((x) => x !== id) : [...on, id];
            onSet(card.id, { timelineIds: next });
          };
          const word = card.channel === "email" ? "cc" : "co-post";
          return (
            <Field label={coPost ? `Timelines · ${word}` : "Timeline"}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {timelines.map((t) => {
                  const sel = on.includes(t.id);
                  return (
                    <button key={t.id} onClick={() => toggle(t.id)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 600, background: sel ? `${t.color}18` : colors.borderFaint, border: `1px solid ${sel ? t.color + "77" : colors.border}`, color: sel ? colors.text : colors.textSubtle }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.color }} />
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </Field>
          );
        })()}

        <Field label="Private note">
          <textarea value={card.note || ""} onChange={(e) => onSet(card.id, { note: e.target.value })} placeholder="Just for you / your team…" style={{ ...textareaStyle, minHeight: 48 }} />
        </Field>
      </div>

      <div style={{ padding: "8px 10px", borderTop: `1px solid ${colors.border}` }}>
        <button onClick={() => onRemove(card.id)} style={deleteBtnStyle}><Trash2 size={12} /> Delete</button>
      </div>
    </div>
  );
}

// ── small pieces ────────────────────────────────────────────────────

// The content's format (e.g. "Lyrics cinematic"): pick one already used on
// this timeline, or type a new one.
const NEW_FORMAT = "__new__";
function FormatPicker({ value, formats, onChange }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const options = value && !formats.includes(value) ? [...formats, value] : formats;
  const commit = () => {
    const f = draft.trim();
    if (f) onChange(f);
    setAdding(false);
    setDraft("");
  };
  if (adding) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { e.stopPropagation(); setAdding(false); } }}
          onBlur={commit}
          placeholder="e.g. Lyrics cinematic"
          style={inputStyle}
        />
      </div>
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => (e.target.value === NEW_FORMAT ? setAdding(true) : onChange(e.target.value))}
      style={selectStyle}
    >
      <option value="">No format</option>
      {options.map((f) => <option key={f} value={f}>{f}</option>)}
      <option value={NEW_FORMAT}>+ New format…</option>
    </select>
  );
}
function TagInput({ tags, accent, onChange }) {
  const [draft, setDraft] = useState("");
  const commit = (raw) => {
    const parts = raw.split(/[,\s]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...tags, ...parts])]);
    setDraft("");
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "6px 7px", borderRadius: 7, background: colors.surface, border: `1px solid ${colors.border}` }}>
      {tags.map((t) => (
        <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, color: accent, background: `${accent}18`, borderRadius: 5, padding: "2px 4px 2px 6px" }}>
          #{t}
          <button onClick={() => onChange(tags.filter((x) => x !== t))} style={{ background: "none", border: "none", color: accent, cursor: "pointer", padding: 0, display: "inline-flex" }}><X size={10} /></button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && draft.trim()) { e.preventDefault(); commit(draft); } else if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1)); }}
        onBlur={() => draft.trim() && commit(draft)}
        placeholder={tags.length ? "" : "#tag"}
        style={{ flex: 1, minWidth: 44, background: "transparent", border: "none", outline: "none", color: colors.text, fontSize: 11 }}
      />
    </div>
  );
}

function Field({ label, children, grow }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, ...(grow ? { flex: 1 } : {}) }}>
      <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: colors.textSubtle }}>{label}</span>
      {children}
    </label>
  );
}
const FieldRow = ({ children }) => <div style={{ display: "flex", gap: 7 }}>{children}</div>;

const baseInput = {
  width: "100%", boxSizing: "border-box", minWidth: 0, fontSize: 11.5,
  borderRadius: 7, background: colors.surface, border: `1px solid ${colors.border}`,
  color: colors.text, outline: "none",
};
const selectStyle = { ...baseInput, padding: "7px 8px", colorScheme: "light", cursor: "pointer", flex: 1 };
const inputStyle = { ...baseInput, padding: "7px 9px" };
const textareaStyle = { ...baseInput, padding: "7px 9px", resize: "none", fontFamily: "inherit", lineHeight: 1.45 };
const linkBtn = { background: "none", border: "none", color: colors.textMuted, fontSize: 10.5, fontWeight: 600, cursor: "pointer", padding: "2px 4px", textDecoration: "underline", textUnderlineOffset: 2 };
const deleteBtnStyle = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "7px", borderRadius: 7, background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.22)", color: "#dc2626", fontSize: 11.5, fontWeight: 600, cursor: "pointer" };
