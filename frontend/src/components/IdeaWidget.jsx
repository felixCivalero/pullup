import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Lightbulb, X, Send, Sparkles, ChevronRight, ExternalLink } from "lucide-react";
import { colors } from "../theme/colors.js";
import { authenticatedFetch, publicFetch } from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useHostResource } from "../contexts/useHostResource.js";
import { useRecentChatActivity } from "../lib/useRecentChatActivity.js";

function getAiDismissKey(type, id) {
  return `coach-widget-dismissed:${type || "_"}:${id || "_"}`;
}

// "publish_event" → "Published this", "draft_campaign" → "Drafted a campaign", etc.
// Pure presentation — keeps the narration line readable without a round-trip.
function narrateAction(row) {
  const r = row?.result || {};
  const args = row?.args || {};
  switch (row?.tool) {
    case "create_event":           return "Created the event";
    case "update_event":           return "Updated event details";
    case "publish_event":          return "Published this event";
    case "unpublish_event":        return "Reverted to draft";
    case "delete_event":           return "Deleted the event";
    case "duplicate_event":        return "Duplicated the event";
    case "upload_event_image":     return "Uploaded a new cover";
    case "upload_event_media":     return "Uploaded media";
    case "draft_campaign":         return r.totalRecipients != null
      ? `Drafted a campaign to ${r.totalRecipients} people`
      : "Drafted a campaign";
    case "update_campaign":        return "Updated the draft";
    case "send_campaign":          return r.totalRecipients != null
      ? `Sent a campaign to ${r.totalRecipients} people`
      : "Sent a campaign";
    case "update_rsvp":            return args.status ? `Set an RSVP to ${args.status}` : "Updated an RSVP";
    case "refund_payment":         return r.isFullRefund ? "Issued a full refund" : "Issued a refund";
    case "update_person":          return "Updated a contact";
    case "set_host_brief":         return "Updated your host brief";
    default:                       return row?.tool ? row.tool.replace(/_/g, " ") : "Did something";
  }
}

// Each chat action has a UI place it lives. Return a dispatchable intent
// (same shape as coach suggestions) or null if there's no useful landing.
function narrationIntent(row) {
  if (!row) return null;
  const args = row.args || {};
  switch (row.tool) {
    case "create_event":
    case "update_event":
    case "publish_event":
    case "unpublish_event":
    case "duplicate_event":
      return row.target_id
        ? { type: "navigate", url: `/app/events/${row.target_id}/edit` }
        : null;
    case "delete_event":
      // Event is gone; no landing.
      return null;
    case "upload_event_image":
    case "upload_event_media":
      return row.target_id
        ? {
            type: "navigate",
            url: `/app/events/${row.target_id}/edit`,
            focus: "media",
          }
        : null;
    case "draft_campaign":
    case "update_campaign":
    case "send_campaign":
      return row.target_id
        ? { type: "navigate", url: `/crm?campaignId=${row.target_id}` }
        : null;
    case "update_rsvp":
    case "refund_payment":
      return args.eventId
        ? { type: "navigate", url: `/app/events/${args.eventId}/guests` }
        : null;
    case "update_person":
      return { type: "navigate", url: "/crm" };
    case "set_host_brief":
      return { type: "navigate", url: "/settings" };
    default:
      return null;
  }
}

function relTime(iso) {
  if (!iso) return "";
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(diffSec) || diffSec < 0) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function IdeaWidget() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const textareaRef = useRef(null);

  // AI / coach mode: the floating slot swaps from "Have an idea?" to a
  // sparkle-flavoured coach panel whenever the current host page declares a
  // resource AND chat has recently touched it.
  const resource = useHostResource();
  const { hasActivity, lastAction } = useRecentChatActivity({
    enabled: !!resource,
    targetType: resource?.type,
    targetId: resource?.id,
  });
  const [aiDismissed, setAiDismissed] = useState(() => {
    if (!resource) return false;
    try {
      return sessionStorage.getItem(getAiDismissKey(resource.type, resource.id)) === "1";
    } catch {
      return false;
    }
  });
  // Recompute dismissed state when the resource changes (page navigation).
  useEffect(() => {
    if (!resource) {
      setAiDismissed(false);
      return;
    }
    try {
      setAiDismissed(
        sessionStorage.getItem(getAiDismissKey(resource.type, resource.id)) === "1",
      );
    } catch {
      setAiDismissed(false);
    }
  }, [resource]);
  const inAiMode = !!resource && hasActivity && !aiDismissed;

  // Coach suggestions for the AI mode panel. Fetched once we enter AI mode.
  const [coachItems, setCoachItems] = useState(null);
  useEffect(() => {
    if (!inAiMode) return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          surface: resource.type === "campaign" ? "campaign" : "event",
          id: String(resource.id),
          limit: "3",
        });
        const res = await authenticatedFetch(`/host/coach/actions?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setCoachItems(data.items || []);
      } catch (err) {
        if (!cancelled) {
          console.warn("[IdeaWidget] coach fetch failed:", err?.message);
          setCoachItems([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inAiMode, resource]);

  // Close the panel when mode flips so the host doesn't see stale chrome.
  useEffect(() => {
    setOpen(false);
  }, [inAiMode]);

  // Narration: last few chat actions on this resource, shown above the
  // suggestion buttons in the panel. Pure log read — no LLM cost. Refetched
  // when the panel opens AND when a fresh chat action lands.
  const [recentActions, setRecentActions] = useState([]);
  useEffect(() => {
    if (!inAiMode || !open) return;
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const params = new URLSearchParams({
          since,
          targetType: resource.type,
          targetId: String(resource.id),
          source: "chat",
          limit: "5",
        });
        const res = await authenticatedFetch(`/host/actions/recent?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setRecentActions(data.items || []);
      } catch (err) {
        // Best-effort. Narration is decorative, not load-bearing.
        console.warn("[IdeaWidget] narration fetch failed:", err?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [inAiMode, open, resource, lastAction?.id]);

  // Pulse the trigger button + sparkle icon whenever a fresh chat action
  // lands. Uses the Web Animations API — no CSS class juggling, no extra
  // state, just a one-shot animation triggered by lastAction.id changing.
  const triggerRef = useRef(null);
  const sparkleRef = useRef(null);
  const lastPulsedRef = useRef(null);
  useEffect(() => {
    if (!inAiMode || !lastAction?.id) return;
    if (lastPulsedRef.current === lastAction.id) return; // already pulsed for this one
    lastPulsedRef.current = lastAction.id;
    triggerRef.current?.animate(
      [
        { boxShadow: "0 4px 16px rgba(0,0,0,0.3), 0 0 28px rgba(240,216,120,0.85)" },
        { boxShadow: "0 4px 16px rgba(0,0,0,0.3), 0 0 12px rgba(232,200,102,0.15)" },
      ],
      { duration: 1800, easing: "ease-out" },
    );
    sparkleRef.current?.animate(
      [
        { transform: "scale(1) rotate(0deg)" },
        { transform: "scale(1.35) rotate(15deg)" },
        { transform: "scale(1) rotate(0deg)" },
      ],
      { duration: 900, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
    );
  }, [inAiMode, lastAction?.id]);

  // "Continue in claude.ai" — opens claude.ai in a new tab with a
  // resource-aware prompt. Zero cost on PullUp's side; the host's existing
  // claude.ai connection (with PullUp MCP) picks up the context naturally.
  const continueChatUrl = useMemo(() => {
    if (!resource) return null;
    const noun = resource.type === "campaign" ? "campaign" : "event";
    const prompt = `I'm working on this ${noun} in PullUp (id: ${resource.id}) — pick up where we left off. You have the PullUp MCP connected.`;
    return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
  }, [resource]);

  function dismissAiMode() {
    if (!resource) return;
    try {
      sessionStorage.setItem(getAiDismissKey(resource.type, resource.id), "1");
    } catch {
      // private mode / blocked storage — silent
    }
    setAiDismissed(true);
    setOpen(false);
  }

  function dispatchIntent(intent) {
    if (!intent) return;
    if (intent.type === "navigate" && intent.url) {
      const target = intent.url.split("?")[0];
      if (target === pathname) {
        // Same page — if the intent declares a `focus`, hand it off via the
        // URL so the page can jump to the right tab / section. Otherwise
        // no-op (the suggestion was informational about the current view).
        if (intent.focus) {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("focus", intent.focus);
            return next;
          }, { replace: true });
        }
      } else {
        navigate(intent.url);
      }
      setOpen(false);
    }
  }

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      const fetchFn = user ? authenticatedFetch : publicFetch;
      await fetchFn("/ideas", {
        method: "POST",
        body: JSON.stringify({ body: body.trim(), pageUrl: window.location.href }),
      });
      setSent(true);
      setBody("");
      setTimeout(() => {
        setSent(false);
        setOpen(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to submit idea:", err);
    } finally {
      setSending(false);
    }
  }, [body, sending, user]);

  const handleKeyDown = useCallback(
    (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  // Only show on landing page and dashboard, not on event pages
  const isEventPage = pathname.startsWith("/e/") || pathname.startsWith("/events/");
  if (!isDesktop || isEventPage) return null;

  const canSubmit = body.trim().length > 0 && !sending;

  if (inAiMode) {
    return (
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999 }}>
        {open && (
          <div
            style={{
              position: "absolute",
              bottom: 56,
              right: 0,
              width: 340,
              background: "rgba(12, 10, 18, 0.92)",
              border: "1px solid rgba(232, 200, 102, 0.25)",
              borderRadius: 16,
              padding: 18,
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(232,200,102,0.05)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#f0d878" }}>
                <Sparkles size={14} />
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  PullUp
                </span>
              </div>
              <button
                onClick={dismissAiMode}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  color: "rgba(255,255,255,0.4)",
                }}
                aria-label="Hide for this session"
                title="Hide for this session"
              >
                <X size={16} />
              </button>
            </div>

            {recentActions.length > 0 && (
              <div
                style={{
                  marginBottom: 12,
                  paddingBottom: 12,
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 0.7,
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.4)",
                    fontWeight: 600,
                    marginBottom: 2,
                  }}
                >
                  Chat just
                </div>
                {recentActions.slice(0, 4).map((a) => {
                  const intent = narrationIntent(a);
                  const baseStyle = {
                    fontSize: 12.5,
                    color: "rgba(255,255,255,0.78)",
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 10,
                    lineHeight: 1.4,
                    textAlign: "left",
                    width: "100%",
                    padding: 0,
                    background: "none",
                    border: "none",
                  };
                  const inner = (
                    <>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", color: intent ? "#fff" : "rgba(255,255,255,0.78)" }}>
                        {narrateAction(a)}
                      </span>
                      <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                        {relTime(a.created_at)}
                      </span>
                    </>
                  );
                  if (!intent) {
                    return (
                      <div key={a.id} style={baseStyle}>
                        {inner}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => dispatchIntent(intent)}
                      style={{ ...baseStyle, cursor: "pointer" }}
                      title="Jump to where this happened"
                    >
                      {inner}
                    </button>
                  );
                })}
              </div>
            )}

            {coachItems === null && (
              <div style={{ fontSize: 12, opacity: 0.5, padding: "8px 0" }}>Loading…</div>
            )}
            {coachItems && coachItems.length === 0 && (
              <div style={{ fontSize: 12, opacity: 0.6, padding: "8px 0", lineHeight: 1.5 }}>
                Nothing left to suggest right now — looks tight from here.
              </div>
            )}
            {coachItems && coachItems.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {coachItems.map((it) => {
                  const target = it.intent?.url ? it.intent.url.split("?")[0] : null;
                  // Same-page intent without a focus is informational; with
                  // a focus, the click flips a tab — still actionable.
                  const isInfo = target && target === pathname && !it.intent?.focus;
                  return (
                    <button
                      key={it.key}
                      type="button"
                      onClick={() => (isInfo ? null : dispatchIntent(it.intent))}
                      disabled={isInfo}
                      style={{
                        textAlign: "left",
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        rowGap: 2,
                        columnGap: 10,
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: isInfo ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
                        color: "#fff",
                        cursor: isInfo ? "default" : "pointer",
                      }}
                    >
                      <span
                        style={{
                          gridColumn: 1,
                          gridRow: 1,
                          fontSize: 13.5,
                          fontWeight: 600,
                          lineHeight: 1.3,
                        }}
                      >
                        {it.headline}
                      </span>
                      {it.why && (
                        <span
                          style={{
                            gridColumn: 1,
                            gridRow: 2,
                            fontSize: 11.5,
                            color: "rgba(255,255,255,0.55)",
                            lineHeight: 1.4,
                          }}
                        >
                          {it.why}
                        </span>
                      )}
                      {!isInfo && (
                        <ChevronRight
                          size={14}
                          style={{
                            gridColumn: 2,
                            gridRow: "1 / span 2",
                            alignSelf: "center",
                            opacity: 0.55,
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {continueChatUrl && (
              <a
                href={continueChatUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(232,200,102,0.2)",
                  background: "rgba(232,200,102,0.06)",
                  color: "#f0d878",
                  fontSize: 12.5,
                  fontWeight: 600,
                  textDecoration: "none",
                  letterSpacing: 0.2,
                }}
                title="Open this in claude.ai with the context pre-loaded"
              >
                <span>Continue in claude.ai</span>
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}

        {/* AI-mode trigger pill — gold-tinted to signal "AI is here" */}
        <button
          ref={triggerRef}
          onClick={() => setOpen((prev) => !prev)}
          title="PullUp"
          style={{
            borderRadius: 999,
            border: "1px solid rgba(232, 200, 102, 0.35)",
            background: "rgba(232, 200, 102, 0.12)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3), 0 0 12px rgba(232,200,102,0.15)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 7,
            color: "#f0d878",
            transition: "all 0.15s ease",
            padding: "10px 14px 10px 12px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(232, 200, 102, 0.18)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(232, 200, 102, 0.12)";
          }}
        >
          <span ref={sparkleRef} style={{ display: "inline-flex", alignItems: "center" }}>
            <Sparkles size={18} />
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
            PullUp
            {coachItems && coachItems.length > 0 ? ` · ${coachItems.length}` : ""}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999 }}>
      {/* Panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: 56,
            right: 0,
            width: 320,
            background: colors.backgroundOverlay,
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 16,
            padding: 20,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          {/* Close button */}
          <button
            onClick={() => setOpen(false)}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.4)",
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>

          {sent ? (
            <div
              style={{
                color: colors.success,
                fontSize: 14,
                fontWeight: 500,
                textAlign: "center",
                padding: "20px 0",
              }}
            >
              Thanks! Your idea has been received.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 14, color: "#fff", fontWeight: 500, marginBottom: 6, lineHeight: 1.4 }}>
                Help us make PullUp top tier
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: 14,
                  lineHeight: 1.5,
                }}
              >
                We built this for free, for the culture, to keep the city alive. Every idea helps us get better — tell us what you'd love to see.
              </div>

              <textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={2000}
                placeholder="I wish PullUp had..."
                rows={4}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  color: "#fff",
                  fontSize: 13,
                  resize: "vertical",
                  outline: "none",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 10,
                }}
              >
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                  {body.length}/2000
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 16px",
                    borderRadius: 8,
                    border: "none",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: canSubmit ? "pointer" : "default",
                    background: canSubmit ? "#fff" : "rgba(255,255,255,0.1)",
                    color: canSubmit ? "#000" : "rgba(255,255,255,0.3)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {sending ? (
                    "Sending..."
                  ) : (
                    <>
                      Submit <Send size={13} />
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        title="Share an idea"
        style={{
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.06)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 7,
          color: "rgba(255,255,255,0.6)",
          transition: "all 0.15s ease",
          padding: "10px 14px 10px 12px",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "rgba(255,255,255,0.9)";
          e.currentTarget.style.background = "rgba(255,255,255,0.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "rgba(255,255,255,0.6)";
          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
        }}
      >
        <Lightbulb size={18} />
        <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>
          Have an idea?
        </span>
      </button>
    </div>
  );
}
