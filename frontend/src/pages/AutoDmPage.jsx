// frontend/src/pages/AutoDmPage.jsx
//
// The Auto-DM page — a first-class, Instagram-branded host destination (in the
// top nav with a NEW pill). It's the home for comment→DM triggers:
//
//   Someone comments your keyword on Instagram → PullUp instantly DMs them the
//   event's signup link (stamped so the signup is attributed to that comment).
//
// Each trigger is anchored to a specific event and is LIVE only while that
// event hasn't ended — so a trigger ages out on its own when the event passes,
// and the keyword frees up for the next event. A keyword can belong to only one
// LIVE trigger at a time; the backend enforces that and returns a 409 we show
// inline.
//
// Backend: GET/POST/PATCH/DELETE /host/comment-triggers (per-event model,
// migration 068). IG connection itself is set up in Profile → Connected
// accounts; if it's missing we send the host straight into the connect flow.

import { useState, useEffect, useCallback } from "react";
import { Instagram, Plus, X, MessageCircle, Calendar, AlertCircle } from "lucide-react";
import { colors } from "../theme/colors.js";
import { authenticatedFetch } from "../lib/api.js";
import { useToast } from "../components/Toast";

const wrap = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "28px 20px 80px",
};

const card = {
  padding: 18,
  background: colors.surface,
  borderRadius: 16,
  border: `1px solid ${colors.border}`,
  boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 14px",
  borderRadius: 10,
  border: `1px solid ${colors.borderStrong}`,
  background: "#fff",
  color: colors.text,
  fontSize: 14,
  outline: "none",
  transition: "border-color 0.2s",
};

const fieldLabel = {
  fontSize: 11,
  fontWeight: 700,
  color: colors.textSubtle,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const gradientText = {
  background: colors.gradientInstagram,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: "transparent",
};

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function StatusBadge({ status, expiresAt }) {
  const map = {
    active: { label: `Active · retires ${fmtDate(expiresAt)}`, bg: colors.successRgba, fg: colors.success, bd: "rgba(22,163,74,0.3)" },
    pending: { label: "Pending · goes live when published", bg: colors.instagramSoft, fg: colors.instagram, bd: colors.instagramBorder },
    paused: { label: "Paused", bg: colors.surfaceMuted, fg: colors.textMuted, bd: colors.border },
    expired: { label: "Expired · event ended", bg: colors.dangerRgba, fg: colors.danger, bd: "rgba(220,38,38,0.25)" },
  };
  const s = map[status] || map.paused;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.bd}`,
      }}
    >
      {s.label}
    </span>
  );
}

export function AutoDmPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [igConnected, setIgConnected] = useState(false);
  const [account, setAccount] = useState(null);
  const [triggers, setTriggers] = useState([]);
  const [events, setEvents] = useState([]);

  // New-trigger form
  const [eventId, setEventId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [match, setMatch] = useState("contains");
  const [replyText, setReplyText] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch("/host/comment-triggers");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setIgConnected(!!data.igConnected);
      setAccount(data.account || null);
      // This page manages comment→DM keyword triggers only; RSVP→DM triggers
      // (no keyword) are managed in the event editor's Instagram panel.
      setTriggers((data.triggers || []).filter((t) => (t.triggerType || "comment") === "comment"));
      setEvents(data.events || []);
      if (!eventId && data.events?.length) setEventId(data.events[0].id);
    } catch {
      showToast("Couldn't load your Auto-DM triggers", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, eventId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectInstagram() {
    try {
      const res = await authenticatedFetch("/instagram/connect-url");
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      showToast("Couldn't start the Instagram connection", "error");
    }
  }

  async function createTrigger() {
    setFormError("");
    const kw = keyword.trim();
    if (!eventId) return setFormError("Pick an event first.");
    if (!kw) return setFormError("Add a keyword people will comment.");
    setCreating(true);
    try {
      const res = await authenticatedFetch("/host/comment-triggers", {
        method: "POST",
        body: JSON.stringify({ eventId, keyword: kw, match, replyText: replyText.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data?.conflict) {
        setFormError(
          `"${kw}" is already live on "${data.conflict.eventTitle}" until ${fmtDate(
            data.conflict.expiresAt
          )}. Pick a different keyword, or let that one expire.`
        );
        return;
      }
      if (!res.ok || !data.ok) throw new Error(data?.error || "create failed");
      setTriggers((t) => [data.trigger, ...t]);
      setKeyword("");
      setReplyText("");
      showToast("Trigger created", "success");
    } catch {
      showToast("Couldn't create the trigger", "error");
    } finally {
      setCreating(false);
    }
  }

  async function toggle(trigger) {
    const next = !trigger.enabled;
    try {
      const res = await authenticatedFetch(`/host/comment-triggers/${trigger.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data?.conflict) {
        showToast(
          `"${trigger.keyword}" is already live on "${data.conflict.eventTitle}". Disable that one first.`
        , "error");
        return;
      }
      if (!res.ok || !data.ok) throw new Error();
      setTriggers((list) => list.map((t) => (t.id === trigger.id ? data.trigger : t)));
    } catch {
      showToast("Couldn't update the trigger", "error");
    }
  }

  async function remove(trigger) {
    try {
      const res = await authenticatedFetch(`/host/comment-triggers/${trigger.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setTriggers((list) => list.filter((t) => t.id !== trigger.id));
    } catch {
      showToast("Couldn't delete the trigger", "error");
    }
  }

  // ── Header (shared across all states) ──
  const header = (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: colors.gradientInstagram,
            flexShrink: 0,
            boxShadow: "0 6px 18px rgba(214,36,159,0.30)",
          }}
        >
          <Instagram size={22} color="#fff" />
        </span>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
            <span style={gradientText}>Auto-DM</span>
          </h1>
          <p style={{ fontSize: 14, color: colors.textMuted, margin: "2px 0 0" }}>
            Turn Instagram comments into RSVPs — automatically.
          </p>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          fontSize: 12.5,
          color: colors.textMuted,
        }}
      >
        {["Post on Instagram", "Someone comments your keyword", "PullUp DMs them your event link"].map(
          (step, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: colors.instagramSoft,
                  color: colors.instagram,
                  fontSize: 10,
                  fontWeight: 800,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {i + 1}
              </span>
              {step}
              {i < 2 && <span style={{ color: colors.textFaded }}>→</span>}
            </span>
          )
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div style={wrap}>
        {header}
        <div style={{ ...card, color: colors.textSubtle, fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  // ── Not connected: send them into the connect flow ──
  if (!igConnected) {
    return (
      <div style={wrap}>
        {header}
        <div style={{ ...card, textAlign: "center", padding: "36px 24px" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              margin: "0 auto 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: colors.gradientInstagram,
            }}
          >
            <Instagram size={28} color="#fff" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>
            Connect your Instagram to begin
          </h2>
          <p style={{ fontSize: 14, color: colors.textMuted, maxWidth: 420, margin: "0 auto 20px" }}>
            Once connected, PullUp watches for keyword comments on your posts and DMs the right event
            link the instant someone asks.
          </p>
          <button
            onClick={connectInstagram}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 24px",
              borderRadius: 999,
              border: "none",
              background: colors.gradientInstagram,
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(214,36,159,0.32)",
            }}
          >
            <Instagram size={17} /> Connect Instagram
          </button>
        </div>
      </div>
    );
  }

  const noEvents = events.length === 0;

  return (
    <div style={wrap}>
      {header}

      {/* Connected account chip */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "5px 12px",
            borderRadius: 999,
            background: colors.instagramSoft,
            border: `1px solid ${colors.instagramBorder}`,
            color: colors.instagram,
            fontSize: 13,
            fontWeight: 650,
          }}
        >
          <Instagram size={14} /> @{account?.username || "account"}
        </span>
      </div>

      {/* New trigger */}
      <div style={{ ...card, marginBottom: 22 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <Plus size={16} color={colors.instagram} /> New trigger
        </div>

        {noEvents ? (
          <div style={{ fontSize: 13.5, color: colors.textMuted, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={15} color={colors.textSubtle} />
            You have no upcoming events yet. Create one first (a draft is fine — the trigger goes live
            when you publish), then come back to wire a comment trigger to it.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={fieldLabel}>Event</div>
              <select value={eventId} onChange={(e) => setEventId(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} · {fmtDate(ev.startsAt)}{ev.isDraft ? " · draft" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px" }}>
                <div style={fieldLabel}>Keyword</div>
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="e.g. GUESTLIST"
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = colors.instagramBorder)}
                  onBlur={(e) => (e.target.style.borderColor = colors.borderStrong)}
                />
              </div>
              <div style={{ flex: "0 0 140px" }}>
                <div style={fieldLabel}>Match</div>
                <select value={match} onChange={(e) => setMatch(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="contains">contains</option>
                  <option value="exact">exact</option>
                </select>
              </div>
            </div>

            <div>
              <div style={fieldLabel}>DM message</div>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={2}
                placeholder="You're in — tap to grab your spot 👇"
                style={{ ...inputStyle, resize: "none", lineHeight: 1.5, fontFamily: "inherit" }}
                onFocus={(e) => (e.target.style.borderColor = colors.instagramBorder)}
                onBlur={(e) => (e.target.style.borderColor = colors.borderStrong)}
              />
              <div style={{ fontSize: 11.5, color: colors.textSubtle, marginTop: 5 }}>
                The event link is added automatically at the end of the DM.
              </div>
            </div>

            {formError && (
              <div
                style={{
                  fontSize: 13,
                  color: colors.danger,
                  background: colors.dangerRgba,
                  border: "1px solid rgba(220,38,38,0.2)",
                  borderRadius: 10,
                  padding: "9px 12px",
                  display: "flex",
                  gap: 8,
                }}
              >
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                {formError}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={createTrigger}
                disabled={creating}
                style={{
                  padding: "10px 22px",
                  borderRadius: 999,
                  border: "none",
                  background: colors.gradientInstagram,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: creating ? "wait" : "pointer",
                  opacity: creating ? 0.7 : 1,
                  boxShadow: "0 6px 18px rgba(214,36,159,0.28)",
                }}
              >
                {creating ? "Creating…" : "Create trigger"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Existing triggers */}
      <div style={{ fontSize: 13, fontWeight: 700, color: colors.textSubtle, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
        Your triggers
      </div>

      {triggers.length === 0 ? (
        <div style={{ ...card, fontSize: 13.5, color: colors.textSubtle }}>
          No triggers yet. Create one above and it'll start watching your comments.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {triggers.map((t) => (
            <div
              key={t.id}
              style={{
                ...card,
                padding: 16,
                opacity: t.status === "expired" ? 0.7 : 1,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 11px",
                    borderRadius: 8,
                    background: colors.instagramSoft,
                    border: `1px solid ${colors.instagramBorder}`,
                    color: colors.instagram,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  <MessageCircle size={13} /> {t.keyword}
                  <span style={{ fontWeight: 500, color: colors.textSubtle, fontSize: 11 }}>
                    {t.match === "exact" ? "exact" : "contains"}
                  </span>
                </span>
                <StatusBadge status={t.status} expiresAt={t.expiresAt} />
                <button
                  onClick={() => remove(t)}
                  title="Delete trigger"
                  style={{
                    marginLeft: "auto",
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    border: `1px solid ${colors.border}`,
                    background: colors.surface,
                    color: colors.danger,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: colors.textMuted }}>
                <Calendar size={13} color={colors.textSubtle} />
                {t.eventTitle}
                {t.startsAt && <span style={{ color: colors.textFaded }}>· {fmtDate(t.startsAt)}</span>}
              </div>

              {t.replyText && (
                <div style={{ fontSize: 13, color: colors.textSubtle, fontStyle: "italic", lineHeight: 1.5 }}>
                  “{t.replyText}”
                </div>
              )}

              {t.status !== "expired" && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 2 }}>
                  <input
                    type="checkbox"
                    checked={t.enabled}
                    onChange={() => toggle(t)}
                    style={{ width: 16, height: 16, accentColor: colors.instagram, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 13, color: colors.text }}>Active</span>
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AutoDmPage;
