// frontend/src/components/EventAutoDmPanel.jsx
//
// The event-scoped Instagram automation panel — rendered inside the event
// editor's left rail (the Instagram icon). Manages the WHOLE per-event flow
// without ever leaving the panel:
//   1. Connect / remove the host's ONE Instagram account.
//   2. Comment → DM: comment a keyword → PullUp DMs the event link. Scopeable
//      to ANY post or ONE specific post (thumbnail picker).
//   3. RSVP → DM: a guest RSVPs → PullUp DMs them in the thread they started in.
//
// One account per host (you connect one; to change it you remove and re-add,
// which re-enters the Instagram connect flow). Both trigger types attach to a
// saved event (draft triggers go live on publish; the DM carries the public
// /e/:slug link). In create mode we explain why it's not ready yet — never a
// dead form.
//
// IG reality (RSVP → DM): Instagram only lets us DM someone inside a 24h window
// opened by THEM messaging us. So the RSVP DM reaches the guests who came in
// through Instagram and messaged you back — the warm comment→DM→reply→RSVP path.
// Everyone else still gets the standard WhatsApp/email confirmation; this never
// double-sends. The card says so plainly.
//
// EVERY <button> here MUST be type="button" — the panel renders inside the
// editor's <form onSubmit={handleCreate}>, so an untyped button defaults to
// submit and would re-save the event + navigate away. Don't drop the type.

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Instagram, X, AlertCircle, ArrowUpRight, MessageCircle, UserCheck, Image as ImageIcon, Send } from "lucide-react";
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
const cardWrap = {
  borderRadius: 14,
  border: `1px solid ${colors.border}`,
  background: colors.surface,
  padding: "16px 16px 18px",
  marginBottom: 16,
};
const cardHead = { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 };
const cardTitle = { fontSize: 13.5, fontWeight: 700, color: colors.text };
const cardSub = { fontSize: 12.5, color: colors.textMuted, margin: "0 0 14px", lineHeight: 1.5 };
const igBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "10px 20px",
  borderRadius: 999,
  border: "none",
  background: colors.gradientInstagram,
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
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
  const [account, setAccount] = useState(null); // { id, ig_username }

  const [triggers, setTriggers] = useState([]);

  // Comment → DM create form
  const [keyword, setKeyword] = useState("");
  const [match, setMatch] = useState("contains");
  const [replyText, setReplyText] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  // Comment → DM post scope ('all' = whole account, 'post' = one media_id)
  const [scopeMode, setScopeMode] = useState("all");
  const [selectedMedia, setSelectedMedia] = useState(null); // { id, thumbnailUrl, caption }
  const [pickerOpen, setPickerOpen] = useState(false);
  const [media, setMedia] = useState([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaCursor, setMediaCursor] = useState(null); // paging.next; null = no more
  const [mediaMore, setMediaMore] = useState(false); // loading the next page
  const [mediaSandbox, setMediaSandbox] = useState(false);

  // DM / story-reply → DM create form
  const [dmKeyword, setDmKeyword] = useState("");
  const [dmMatch, setDmMatch] = useState("contains");
  const [dmReply, setDmReply] = useState("");
  const [dmCreating, setDmCreating] = useState(false);
  const [dmError, setDmError] = useState("");

  // RSVP → DM editor
  const [rsvpText, setRsvpText] = useState("");
  const [rsvpSaving, setRsvpSaving] = useState(false);

  // You can prepare a trigger on a saved event whether it's a draft or live —
  // a draft trigger stays pending and goes live the moment you publish. The
  // only hard requirement is that the event is SAVED (has an id to attach to).
  const ready = isEditMode && !!eventId;
  const isDraft = eventStatus !== "PUBLISHED";

  const commentTriggers = triggers.filter((t) => (t.triggerType || "comment") === "comment");
  const dmTriggers = triggers.filter((t) => t.triggerType === "dm_keyword");
  const rsvpTrigger = triggers.find((t) => t.triggerType === "rsvp_success") || null;

  const load = useCallback(async () => {
    if (!ready) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [tRes, cRes] = await Promise.all([
        authenticatedFetch("/host/comment-triggers"),
        authenticatedFetch("/instagram/connection"),
      ]);
      if (!tRes.ok) throw new Error();
      const tData = await tRes.json();
      const cData = cRes.ok ? await cRes.json() : {};
      const accts = Array.isArray(cData.accounts) ? cData.accounts : [];
      const acct = accts.find((a) => a.isDefault) || accts[0] || null;
      setIgConnected(!!(cData.connected || tData.igConnected));
      setAccount(acct);
      const mine = (tData.triggers || []).filter((t) => t.eventId === eventId);
      setTriggers(mine);
      const rsvp = mine.find((t) => t.triggerType === "rsvp_success");
      if (rsvp) setRsvpText(rsvp.replyText || "");
    } catch {
      showToast("Couldn't load Auto-DM", "error");
    } finally {
      setLoading(false);
    }
  }, [ready, eventId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  // Connect THE account → Instagram OAuth round-trip (returns to this panel).
  // Note: Instagram's redirect URI is registered against the production domain,
  // so this round-trip only completes on pullup.se — locally it bounces to prod.
  async function connectInstagram() {
    try {
      const returnTo = `/app/events/${eventId}/edit?panel=autoDm`;
      const res = await authenticatedFetch(
        `/instagram/connect-url?return_to=${encodeURIComponent(returnTo)}`
      );
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      if (url) window.location.href = url;
      else showToast("Instagram isn't configured yet", "error");
    } catch {
      showToast("Couldn't start the Instagram connection", "error");
    }
  }

  // Remove the connected account. After this, the panel shows "Connect" again,
  // and connecting re-enters the Instagram flow for a fresh account link.
  async function removeAccount() {
    if (!account?.id) return;
    try {
      const res = await authenticatedFetch(`/instagram/connections/${account.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setAccount(null);
      setIgConnected(false);
      setMedia([]);
      clearScope();
      showToast("Instagram disconnected", "success");
    } catch {
      showToast("Couldn't disconnect", "error");
    }
  }

  // ── Post picker (cursor-paginated; newest first) ──────────────────────
  async function openPicker() {
    setPickerOpen(true);
    if (media.length || mediaLoading) return;
    setMediaLoading(true);
    try {
      const res = await authenticatedFetch("/instagram/media");
      const data = await res.json().catch(() => ({}));
      setMedia(Array.isArray(data.media) ? data.media : []);
      setMediaCursor(data.nextCursor || null);
      setMediaSandbox(!!data.sandbox);
    } catch {
      showToast("Couldn't load your posts", "error");
    } finally {
      setMediaLoading(false);
    }
  }

  async function loadMoreMedia() {
    if (!mediaCursor || mediaMore) return;
    setMediaMore(true);
    try {
      const res = await authenticatedFetch(`/instagram/media?after=${encodeURIComponent(mediaCursor)}`);
      const data = await res.json().catch(() => ({}));
      setMedia((list) => [...list, ...(Array.isArray(data.media) ? data.media : [])]);
      setMediaCursor(data.nextCursor || null);
    } catch {
      showToast("Couldn't load more posts", "error");
    } finally {
      setMediaMore(false);
    }
  }

  // Honest label — IG-Login can't tell us Reel vs feed-video, so VIDEO → "Video".
  function mediaBadge(m) {
    if (m.mediaType === "VIDEO") return "Video";
    if (m.mediaType === "CAROUSEL_ALBUM") return "Album";
    return null;
  }

  function chooseMedia(m) {
    setSelectedMedia(m);
    setScopeMode("post");
    setPickerOpen(false);
  }

  function clearScope() {
    setScopeMode("all");
    setSelectedMedia(null);
  }

  async function createTrigger() {
    setFormError("");
    const kw = keyword.trim();
    if (!kw) return setFormError("Add a keyword people will comment.");
    setCreating(true);
    try {
      const res = await authenticatedFetch("/host/comment-triggers", {
        method: "POST",
        body: JSON.stringify({
          eventId,
          keyword: kw,
          match,
          replyText: replyText.trim(),
          mediaId: scopeMode === "post" && selectedMedia ? selectedMedia.id : null,
        }),
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
      clearScope();
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

  // DM / story-reply keyword trigger (separate surface from comments).
  async function createDmTrigger() {
    setDmError("");
    const kw = dmKeyword.trim();
    if (!kw) return setDmError("Add a keyword people will DM you.");
    setDmCreating(true);
    try {
      const res = await authenticatedFetch("/host/comment-triggers", {
        method: "POST",
        body: JSON.stringify({ eventId, triggerType: "dm_keyword", keyword: kw, match: dmMatch, replyText: dmReply.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data?.conflict) {
        setDmError(
          `"${kw}" is already a live DM keyword on "${data.conflict.eventTitle}" until ${fmtDate(
            data.conflict.expiresAt
          )}. Pick a different keyword.`
        );
        return;
      }
      if (!res.ok || !data.ok) throw new Error();
      setTriggers((t) => [data.trigger, ...t]);
      setDmKeyword("");
      setDmReply("");
      showToast("DM trigger created", "success");
    } catch {
      showToast("Couldn't create the DM trigger", "error");
    } finally {
      setDmCreating(false);
    }
  }

  // ── RSVP → DM: create on first save, PATCH thereafter; toggle enabled. ──
  async function saveRsvpTrigger() {
    const text = rsvpText.trim();
    if (!text) return showToast("Write the DM guests will get", "error");
    setRsvpSaving(true);
    try {
      let res;
      if (rsvpTrigger) {
        res = await authenticatedFetch(`/host/comment-triggers/${rsvpTrigger.id}`, {
          method: "PATCH",
          body: JSON.stringify({ replyText: text, enabled: true }),
        });
      } else {
        res = await authenticatedFetch("/host/comment-triggers", {
          method: "POST",
          body: JSON.stringify({ eventId, triggerType: "rsvp_success", replyText: text }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error();
      setTriggers((list) => {
        const others = list.filter((t) => t.triggerType !== "rsvp_success");
        return [data.trigger, ...others];
      });
      showToast(rsvpTrigger ? "RSVP DM saved" : "RSVP DM turned on", "success");
    } catch {
      showToast("Couldn't save the RSVP DM", "error");
    } finally {
      setRsvpSaving(false);
    }
  }

  async function toggleRsvpTrigger(nextEnabled) {
    if (!rsvpTrigger) return;
    try {
      const res = await authenticatedFetch(`/host/comment-triggers/${rsvpTrigger.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error();
      setTriggers((list) => list.map((t) => (t.id === rsvpTrigger.id ? data.trigger : t)));
    } catch {
      showToast("Couldn't update the RSVP DM", "error");
    }
  }

  // ── Heading ──
  const heading = (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
        <Instagram size={18} color={colors.instagram} />
        <span style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>Instagram automations</span>
      </div>
      <p style={{ fontSize: 13, color: colors.textMuted, margin: 0, lineHeight: 1.5 }}>
        Turn comments and RSVPs into DMs — sent automatically, in your voice.
      </p>
    </div>
  );

  if (!ready) {
    return (
      <div>
        {heading}
        <Notice>
          Save this event first (it saves as a draft) — then you can wire your
          Instagram automations right here. They go live automatically when you publish.
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
            <button type="button" onClick={connectInstagram} style={igBtn}>
              <Instagram size={15} /> Connect Instagram
            </button>
          }
        >
          Connect your Instagram account to start turning comments and RSVPs into DMs.
        </Notice>
      </div>
    );
  }

  const rsvpStatus = rsvpTrigger?.status; // 'active' | 'pending' | 'paused' | 'expired'

  return (
    <div>
      {heading}

      {/* Connected-account header — one account; remove to swap. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span
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
          }}
        >
          <Instagram size={13} /> @{account?.ig_username || "account"}
        </span>
        <button
          type="button"
          onClick={removeAccount}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: colors.textSubtle,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Remove
        </button>
      </div>

      {isDraft && (
        <div
          style={{
            fontSize: 12.5,
            color: colors.textMuted,
            background: colors.instagramSoft,
            border: `1px solid ${colors.instagramBorder}`,
            borderRadius: 10,
            padding: "9px 12px",
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          This event is a draft — anything you set up is saved now and goes live automatically when you publish.
        </div>
      )}

      {/* ── Card: Comment → DM ──────────────────────────────────────── */}
      <div style={cardWrap}>
        <div style={cardHead}>
          <MessageCircle size={15} color={colors.instagram} />
          <span style={cardTitle}>Comment → DM</span>
        </div>
        <p style={cardSub}>
          Someone comments a keyword → PullUp DMs this event's link. The link is added automatically.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Where it listens */}
          <div>
            <div style={lbl}>Which post?</div>
            {scopeMode === "all" || !selectedMedia ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setScopeMode("all")}
                  style={{
                    flex: "1 1 auto",
                    padding: "9px 12px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: `1px solid ${scopeMode === "all" ? colors.instagramBorder : colors.borderStrong}`,
                    background: scopeMode === "all" ? colors.instagramSoft : "#fff",
                    color: scopeMode === "all" ? colors.instagram : colors.textMuted,
                  }}
                >
                  Any post on @{account?.ig_username || "account"}
                </button>
                <button
                  type="button"
                  onClick={openPicker}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "9px 12px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: `1px solid ${colors.borderStrong}`,
                    background: "#fff",
                    color: colors.textMuted,
                  }}
                >
                  <ImageIcon size={14} /> Pick a post
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: 8,
                  borderRadius: 10,
                  border: `1px solid ${colors.instagramBorder}`,
                  background: colors.instagramSoft,
                }}
              >
                <div
                  style={{
                    width: 42, height: 42, borderRadius: 8, flexShrink: 0,
                    background: selectedMedia.thumbnailUrl ? `center/cover url(${selectedMedia.thumbnailUrl})` : colors.border,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {!selectedMedia.thumbnailUrl && <ImageIcon size={16} color={colors.textSubtle} />}
                </div>
                <span style={{ flex: 1, fontSize: 12.5, color: colors.text, lineHeight: 1.4, maxHeight: 36, overflow: "hidden" }}>
                  {selectedMedia.caption ? selectedMedia.caption.slice(0, 70) : "Scoped to one post"}
                </span>
                <button type="button" onClick={openPicker} style={{ border: "none", background: "none", color: colors.instagram, fontSize: 12, fontWeight: 650, cursor: "pointer" }}>
                  Change
                </button>
                <button type="button" onClick={clearScope} title="Any post" style={{ border: "none", background: "none", color: colors.textSubtle, cursor: "pointer", display: "flex" }}>
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

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
              type="button"
              onClick={createTrigger}
              disabled={creating}
              style={{ ...igBtn, cursor: creating ? "wait" : "pointer", opacity: creating ? 0.7 : 1 }}
            >
              {creating ? "Creating…" : "Create trigger"}
            </button>
          </div>
        </div>

        {/* This event's comment triggers */}
        {commentTriggers.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {commentTriggers.map((t) => (
              <div
                key={t.id}
                style={{
                  padding: "11px 13px",
                  borderRadius: 11,
                  border: `1px solid ${colors.border}`,
                  background: "#fff",
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
                  {t.mediaId ? "on 1 post · " : "any post · "}
                  {t.status === "expired"
                    ? "expired"
                    : t.status === "pending"
                    ? "goes live when published"
                    : t.status === "paused"
                    ? "paused"
                    : `retires ${fmtDate(t.expiresAt)}`}
                </span>
                <button
                  type="button"
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
      </div>

      {/* ── Card: DM / story reply → DM ─────────────────────────────── */}
      <div style={cardWrap}>
        <div style={cardHead}>
          <Send size={15} color={colors.instagram} />
          <span style={cardTitle}>DM or story reply → DM</span>
        </div>
        <p style={cardSub}>
          Someone DMs you a keyword — or replies to your story with it (Instagram delivers story replies as DMs) —
          and PullUp DMs back this event's link, automatically.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px" }}>
              <div style={lbl}>Keyword</div>
              <input
                value={dmKeyword}
                onChange={(e) => setDmKeyword(e.target.value)}
                placeholder="e.g. INFO"
                style={input}
                onFocus={(e) => (e.target.style.borderColor = colors.instagramBorder)}
                onBlur={(e) => (e.target.style.borderColor = colors.borderStrong)}
              />
            </div>
            <div style={{ flex: "0 0 130px" }}>
              <div style={lbl}>Match</div>
              <select value={dmMatch} onChange={(e) => setDmMatch(e.target.value)} style={{ ...input, cursor: "pointer" }}>
                <option value="contains">contains</option>
                <option value="exact">exact</option>
              </select>
            </div>
          </div>
          <div>
            <div style={lbl}>DM message</div>
            <textarea
              value={dmReply}
              onChange={(e) => setDmReply(e.target.value)}
              rows={2}
              placeholder="Here's everything — tap to grab your spot 👇"
              style={{ ...input, resize: "none", lineHeight: 1.5, fontFamily: "inherit" }}
              onFocus={(e) => (e.target.style.borderColor = colors.instagramBorder)}
              onBlur={(e) => (e.target.style.borderColor = colors.borderStrong)}
            />
          </div>
          {dmError && (
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
              {dmError}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={createDmTrigger}
              disabled={dmCreating}
              style={{ ...igBtn, cursor: dmCreating ? "wait" : "pointer", opacity: dmCreating ? 0.7 : 1 }}
            >
              {dmCreating ? "Creating…" : "Create trigger"}
            </button>
          </div>
        </div>

        {dmTriggers.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {dmTriggers.map((t) => (
              <div
                key={t.id}
                style={{
                  padding: "11px 13px",
                  borderRadius: 11,
                  border: `1px solid ${colors.border}`,
                  background: "#fff",
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
                  <Send size={12} /> {t.keyword}
                </span>
                <span style={{ fontSize: 11.5, color: colors.textSubtle }}>
                  {t.status === "expired"
                    ? "expired"
                    : t.status === "pending"
                    ? "goes live when published"
                    : t.status === "paused"
                    ? "paused"
                    : `retires ${fmtDate(t.expiresAt)}`}
                </span>
                <button
                  type="button"
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
      </div>

      {/* ── Card: RSVP → DM ─────────────────────────────────────────── */}
      <div style={cardWrap}>
        <div style={{ ...cardHead, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserCheck size={15} color={colors.instagram} />
            <span style={cardTitle}>When someone RSVPs → DM</span>
          </div>
          {rsvpTrigger && rsvpStatus !== "expired" && (
            <button
              type="button"
              onClick={() => toggleRsvpTrigger(rsvpStatus === "paused")}
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: 999,
                cursor: "pointer",
                border: `1px solid ${rsvpStatus === "paused" ? colors.border : colors.instagramBorder}`,
                background: rsvpStatus === "paused" ? "#fff" : colors.instagramSoft,
                color: rsvpStatus === "paused" ? colors.textSubtle : colors.instagram,
              }}
            >
              {rsvpStatus === "paused" ? "Off" : rsvpStatus === "pending" ? "On · live at publish" : "On"}
            </button>
          )}
        </div>
        <p style={cardSub}>
          Lands in the DMs of guests who came through Instagram and messaged you back — the event link is added
          automatically. Everyone else still gets your normal confirmation.
        </p>

        <div>
          <div style={lbl}>DM message</div>
          <textarea
            value={rsvpText}
            onChange={(e) => setRsvpText(e.target.value)}
            rows={2}
            placeholder="You're in 🎉 Can't wait to see you there"
            style={{ ...input, resize: "none", lineHeight: 1.5, fontFamily: "inherit" }}
            onFocus={(e) => (e.target.style.borderColor = colors.instagramBorder)}
            onBlur={(e) => (e.target.style.borderColor = colors.borderStrong)}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button
            type="button"
            onClick={saveRsvpTrigger}
            disabled={rsvpSaving}
            style={{ ...igBtn, cursor: rsvpSaving ? "wait" : "pointer", opacity: rsvpSaving ? 0.7 : 1 }}
          >
            {rsvpSaving ? "Saving…" : rsvpTrigger ? "Save" : "Turn on"}
          </button>
        </div>
      </div>

      <Link
        to="/auto-dm"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 12.5,
          fontWeight: 600,
          color: colors.instagram,
          textDecoration: "none",
        }}
      >
        Manage all triggers <ArrowUpRight size={13} />
      </Link>

      {/* ── Post picker modal ─────────────────────────────────────────── */}
      {pickerOpen && (
        <div
          onClick={() => setPickerOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 16, width: "min(560px, 100%)",
              maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${colors.border}` }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>Pick a post</span>
              <button type="button" onClick={() => setPickerOpen(false)} style={{ border: "none", background: "none", cursor: "pointer", color: colors.textSubtle, display: "flex" }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: 16, overflowY: "auto" }}>
              {mediaSandbox && (
                <div
                  style={{
                    fontSize: 12, color: colors.textMuted, lineHeight: 1.5,
                    background: colors.instagramSoft, border: `1px solid ${colors.instagramBorder}`,
                    borderRadius: 10, padding: "8px 11px", marginBottom: 12,
                  }}
                >
                  These are placeholders — your real Instagram posts show here on the live site (pullup.se).
                </div>
              )}
              {mediaLoading ? (
                <div style={{ fontSize: 13, color: colors.textSubtle, padding: 20, textAlign: "center" }}>Loading your posts…</div>
              ) : media.length === 0 ? (
                <div style={{ fontSize: 13, color: colors.textSubtle, padding: 20, textAlign: "center", lineHeight: 1.5 }}>
                  No posts found on @{account?.ig_username || "your account"}. You can still listen on any post.
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {media.map((m) => {
                      const badge = mediaBadge(m);
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => chooseMedia(m)}
                          title={m.caption || ""}
                          style={{
                            position: "relative",
                            aspectRatio: "1 / 1",
                            borderRadius: 10,
                            border: `1px solid ${colors.border}`,
                            cursor: "pointer",
                            overflow: "hidden",
                            padding: 0,
                            background: m.thumbnailUrl ? `center/cover url(${m.thumbnailUrl})` : colors.surface,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          {!m.thumbnailUrl && <ImageIcon size={22} color={colors.textSubtle} />}
                          {badge && (
                            <span style={{ position: "absolute", top: 6, right: 6, fontSize: 10, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.5)", padding: "2px 6px", borderRadius: 6 }}>
                              {badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {mediaCursor && (
                    <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
                      <button
                        type="button"
                        onClick={loadMoreMedia}
                        disabled={mediaMore}
                        style={{
                          padding: "8px 18px", borderRadius: 999, fontSize: 12.5, fontWeight: 650,
                          border: `1px solid ${colors.borderStrong}`, background: "#fff",
                          color: colors.textMuted, cursor: mediaMore ? "wait" : "pointer",
                        }}
                      >
                        {mediaMore ? "Loading…" : "Load older posts"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EventAutoDmPanel;
