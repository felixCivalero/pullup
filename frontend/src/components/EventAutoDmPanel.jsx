// frontend/src/components/EventAutoDmPanel.jsx
//
// The event-scoped Auto-DM panel — rendered inside the event editor's left rail
// (the Instagram icon). Same per-event comment→DM triggers as the standalone
// /auto-dm page, but locked to the event being edited (no event picker). Lets a
// host wire a keyword→DM right where they build the page.
//
// Gating: triggers attach to a saved, PUBLISHED event (the DM carries the public
// /e/:slug link). In create mode or on a draft we show why it's not ready yet,
// with a nudge — never a dead form.

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Instagram, X, AlertCircle, ArrowUpRight, MessageCircle } from "lucide-react";
import { colors } from "../theme/colors.js";
import { authenticatedFetch } from "../lib/api.js";
import { useToast } from "./Toast";

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
const lbl = {
  fontSize: 11,
  fontWeight: 700,
  color: colors.textSubtle,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function Notice({ children, action }) {
  return (
    <div
      style={{
        padding: "16px 16px 18px",
        borderRadius: 12,
        background: colors.instagramSoft,
        border: `1px solid ${colors.instagramBorder}`,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <div style={{ fontSize: 13.5, color: colors.textMuted, lineHeight: 1.55 }}>{children}</div>
      {action}
    </div>
  );
}

export function EventAutoDmPanel({ eventId, eventStatus, isEditMode }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [igConnected, setIgConnected] = useState(false);
  const [account, setAccount] = useState(null);
  const [triggers, setTriggers] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [match, setMatch] = useState("contains");
  const [replyText, setReplyText] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const ready = isEditMode && !!eventId && eventStatus === "PUBLISHED";

  const load = useCallback(async () => {
    if (!ready) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await authenticatedFetch("/host/comment-triggers");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setIgConnected(!!data.igConnected);
      setAccount(data.account || null);
      setTriggers((data.triggers || []).filter((t) => t.eventId === eventId));
    } catch {
      showToast("Couldn't load Auto-DM", "error");
    } finally {
      setLoading(false);
    }
  }, [ready, eventId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

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
          )}. Pick a different keyword.`
        );
        return;
      }
      if (!res.ok || !data.ok) throw new Error();
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

  async function remove(t) {
    try {
      const res = await authenticatedFetch(`/host/comment-triggers/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setTriggers((list) => list.filter((x) => x.id !== t.id));
    } catch {
      showToast("Couldn't delete the trigger", "error");
    }
  }

  // ── Heading ──
  const heading = (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
        <Instagram size={18} color={colors.instagram} />
        <span style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>Instagram Auto-DM</span>
      </div>
      <p style={{ fontSize: 13, color: colors.textMuted, margin: 0, lineHeight: 1.5 }}>
        Comment a keyword on a post → PullUp DMs this event's link. The link is added automatically.
      </p>
    </div>
  );

  if (!ready) {
    return (
      <div>
        {heading}
        <Notice>
          {!isEditMode || !eventId
            ? "Publish this event first — then you can wire a comment keyword that DMs its link."
            : "This event is still a draft. Publish it to turn on Auto-DM (the DM needs a public event link)."}
        </Notice>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        {heading}
        <div style={{ fontSize: 13, color: colors.textSubtle }}>Loading…</div>
      </div>
    );
  }

  if (!igConnected) {
    return (
      <div>
        {heading}
        <Notice
          action={
            <button
              onClick={connectInstagram}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "10px 18px",
                borderRadius: 999,
                border: "none",
                background: colors.gradientInstagram,
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Instagram size={15} /> Connect Instagram
            </button>
          }
        >
          Connect your Instagram account to start turning comments into RSVPs.
        </Notice>
      </div>
    );
  }

  return (
    <div>
      {heading}

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "5px 11px",
          borderRadius: 999,
          background: colors.instagramSoft,
          border: `1px solid ${colors.instagramBorder}`,
          color: colors.instagram,
          fontSize: 12.5,
          fontWeight: 650,
          marginBottom: 16,
        }}
      >
        <Instagram size={13} /> @{account?.username || "account"}
      </div>

      {/* Create */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <div style={lbl}>Keyword</div>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. GUESTLIST"
              style={input}
              onFocus={(e) => (e.target.style.borderColor = colors.instagramBorder)}
              onBlur={(e) => (e.target.style.borderColor = colors.borderStrong)}
            />
          </div>
          <div style={{ flex: "0 0 130px" }}>
            <div style={lbl}>Match</div>
            <select value={match} onChange={(e) => setMatch(e.target.value)} style={{ ...input, cursor: "pointer" }}>
              <option value="contains">contains</option>
              <option value="exact">exact</option>
            </select>
          </div>
        </div>
        <div>
          <div style={lbl}>DM message</div>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={2}
            placeholder="You're in — tap to grab your spot 👇"
            style={{ ...input, resize: "none", lineHeight: 1.5, fontFamily: "inherit" }}
            onFocus={(e) => (e.target.style.borderColor = colors.instagramBorder)}
            onBlur={(e) => (e.target.style.borderColor = colors.borderStrong)}
          />
        </div>
        {formError && (
          <div
            style={{
              fontSize: 12.5,
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
              padding: "10px 20px",
              borderRadius: 999,
              border: "none",
              background: colors.gradientInstagram,
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: creating ? "wait" : "pointer",
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? "Creating…" : "Create trigger"}
          </button>
        </div>
      </div>

      {/* This event's triggers */}
      {triggers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {triggers.map((t) => (
            <div
              key={t.id}
              style={{
                padding: "11px 13px",
                borderRadius: 11,
                border: `1px solid ${colors.border}`,
                background: colors.surface,
                display: "flex",
                alignItems: "center",
                gap: 10,
                opacity: t.status === "expired" ? 0.65 : 1,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 9px",
                  borderRadius: 7,
                  background: colors.instagramSoft,
                  border: `1px solid ${colors.instagramBorder}`,
                  color: colors.instagram,
                  fontSize: 12.5,
                  fontWeight: 700,
                }}
              >
                <MessageCircle size={12} /> {t.keyword}
              </span>
              <span style={{ fontSize: 11.5, color: colors.textSubtle }}>
                {t.status === "expired"
                  ? "expired"
                  : t.status === "paused"
                  ? "paused"
                  : `retires ${fmtDate(t.expiresAt)}`}
              </span>
              <button
                onClick={() => remove(t)}
                title="Delete"
                style={{
                  marginLeft: "auto",
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: `1px solid ${colors.border}`,
                  background: "#fff",
                  color: colors.danger,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Link
        to="/auto-dm"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          marginTop: 16,
          fontSize: 12.5,
          fontWeight: 600,
          color: colors.instagram,
          textDecoration: "none",
        }}
      >
        Manage all triggers <ArrowUpRight size={13} />
      </Link>
    </div>
  );
}

export default EventAutoDmPanel;
