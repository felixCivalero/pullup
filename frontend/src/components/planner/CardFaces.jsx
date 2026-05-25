// The two "backs" a card flips to.
//   EditFace      — a realistic post / email composer (future content).
//   AnalyticsFace — a simple performance read-out (content that already ran).
// Both are presentational: they take a card + onSet and render in the card's width.
// Analytics numbers are DEMO data for now (seeded per card so they're stable);
// vol 2 swaps the generator for real figures from connected integrations.
import { useState } from "react";
import {
  Heart, MessageCircle, Bookmark, Share2, Eye, MailOpen, MousePointerClick,
  Trash2, CalendarDays, Sparkles, BarChart3, Hash, X, Send,
} from "lucide-react";
import { CHANNELS, TYPES } from "./plannerConstants.js";

// ── Deterministic demo numbers, seeded by card id ───────────────────
function seeded(id) {
  let h = 2166136261;
  for (let i = 0; i < (id || "x").length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n)));

function demoMetrics(card) {
  const r = seeded(card.id);
  if (card.channel === "email") {
    const sent = 60 + Math.round(r() * 1100);
    const opens = Math.round(sent * (0.32 + r() * 0.34));
    const clicks = Math.round(opens * (0.08 + r() * 0.22));
    return {
      kind: "email",
      stats: [
        { label: "Delivered", value: compact(sent), Icon: Send },
        { label: "Opens", value: compact(opens), sub: `${Math.round((opens / sent) * 100)}%`, Icon: MailOpen },
        { label: "Clicks", value: compact(clicks), sub: `${Math.round((clicks / sent) * 100)}%`, Icon: MousePointerClick },
        { label: "Bounced", value: compact(Math.round(sent * r() * 0.04)), Icon: X },
      ],
    };
  }
  const reach = 280 + Math.round(r() * 7600);
  const likes = Math.round(reach * (0.05 + r() * 0.08));
  return {
    kind: "social",
    stats: [
      { label: "Reach", value: compact(reach), Icon: Eye },
      { label: "Likes", value: compact(likes), Icon: Heart },
      { label: "Comments", value: compact(Math.round(likes * (0.03 + r() * 0.12))), Icon: MessageCircle },
      { label: "Saves", value: compact(Math.round(likes * (0.08 + r() * 0.3))), Icon: Bookmark },
    ],
    shares: Math.round(likes * (0.04 + r() * 0.12)),
    spark: Array.from({ length: 12 }, () => 0.2 + r() * 0.8),
  };
}

// ── Analytics back ──────────────────────────────────────────────────
export function AnalyticsFace({ card, accent, ranOn, linkedEvent, onEdit }) {
  const m = demoMetrics(card);
  const r = seeded(card.id + "drove");
  const drove = linkedEvent ? 4 + Math.round(r() * 26) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 11px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: `linear-gradient(90deg, ${accent}22, transparent)` }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.02em" }}>
          <BarChart3 size={13} /> Performance
        </span>
        {ranOn && <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)" }}>{ranOn}</span>}
      </div>

      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          {m.stats.map((s) => (
            <div key={s.label} style={{ borderRadius: 8, background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.06)", padding: "8px 9px" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.42)" }}>
                <s.Icon size={11} /> {s.label}
              </div>
              <div style={{ marginTop: 3, display: "flex", alignItems: "baseline", gap: 5 }}>
                <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{s.value}</span>
                {s.sub && <span style={{ fontSize: 10, color: accent, fontWeight: 600 }}>{s.sub}</span>}
              </div>
            </div>
          ))}
        </div>

        {m.kind === "social" && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 34, padding: "0 2px" }}>
            {m.spark.map((v, i) => (
              <div key={i} style={{ flex: 1, height: `${Math.round(v * 100)}%`, borderRadius: 2, background: accent, opacity: 0.35 + v * 0.5 }} />
            ))}
          </div>
        )}

        {linkedEvent && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 9px", borderRadius: 8, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)" }}>
            <CalendarDays size={13} color="#93c5fd" />
            <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.8)", lineHeight: 1.25 }}>
              Drove <b style={{ color: "#bfdbfe" }}>+{drove} RSVPs</b> to {linkedEvent.title}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, color: "rgba(255,255,255,0.35)" }}>
          <Sparkles size={10} /> Demo data
        </span>
        <button onClick={onEdit} style={linkBtn}>Edit post</button>
      </div>
    </div>
  );
}

// ── Edit / compose back ─────────────────────────────────────────────
export function EditFace({ card, events, timelines = [], accent, onSet, onRemove }) {
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
    <div style={{ display: "flex", flexDirection: "column", color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 11px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: `linear-gradient(90deg, ${accent}26, transparent)` }}>
        {ch ? <ch.Icon size={14} color="#fff" /> : <Hash size={13} color="rgba(255,255,255,0.6)" />}
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
                    <button key={t.id} onClick={() => toggle(t.id)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 600, background: sel ? `${t.color}26` : "rgba(255,255,255,0.05)", border: `1px solid ${sel ? t.color + "88" : "rgba(255,255,255,0.12)"}`, color: sel ? "#fff" : "rgba(255,255,255,0.55)" }}>
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

      <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <button onClick={() => onRemove(card.id)} style={deleteBtnStyle}><Trash2 size={12} /> Delete</button>
      </div>
    </div>
  );
}

// ── small pieces ────────────────────────────────────────────────────
function TagInput({ tags, accent, onChange }) {
  const [draft, setDraft] = useState("");
  const commit = (raw) => {
    const parts = raw.split(/[,\s]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...tags, ...parts])]);
    setDraft("");
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "6px 7px", borderRadius: 7, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
      {tags.map((t) => (
        <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, color: accent, background: `${accent}22`, borderRadius: 5, padding: "2px 4px 2px 6px" }}>
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
        style={{ flex: 1, minWidth: 44, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 11 }}
      />
    </div>
  );
}

function Field({ label, children, grow }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, ...(grow ? { flex: 1 } : {}) }}>
      <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.42)" }}>{label}</span>
      {children}
    </label>
  );
}
const FieldRow = ({ children }) => <div style={{ display: "flex", gap: 7 }}>{children}</div>;

const baseInput = {
  width: "100%", boxSizing: "border-box", minWidth: 0, fontSize: 11.5,
  borderRadius: 7, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
  color: "#fff", outline: "none",
};
const selectStyle = { ...baseInput, padding: "7px 8px", colorScheme: "dark", cursor: "pointer", flex: 1 };
const inputStyle = { ...baseInput, padding: "7px 9px" };
const textareaStyle = { ...baseInput, padding: "7px 9px", resize: "none", fontFamily: "inherit", lineHeight: 1.45 };
const linkBtn = { background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 10.5, fontWeight: 600, cursor: "pointer", padding: "2px 4px", textDecoration: "underline", textUnderlineOffset: 2 };
const deleteBtnStyle = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "7px", borderRadius: 7, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.28)", color: "rgba(248,113,113,0.95)", fontSize: 11.5, fontWeight: 600, cursor: "pointer" };
