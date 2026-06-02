import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { X, Sparkles, ChevronRight, ExternalLink, MessageCircle, Wand2 } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useHostResource } from "../contexts/useHostResource.js";
import { useRecentChatActivity } from "../lib/useRecentChatActivity.js";
import { addSpotifySection, addInstagramField } from "../lib/coachMutations.js";
import { useMcpStatus } from "../lib/useMcpStatus.js";
import { colors } from "../theme/colors.js";
import { CanvasChat } from "./CanvasChat.jsx";
import DockMessages from "./DockMessages.jsx";

// The two-face toggle at the top of the dock: Messages ↔ Create.
const dockTabStyle = (on) => ({
  flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "7px 10px", borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  border: `1px solid ${on ? colors.accent : colors.border}`,
  background: on ? colors.accent : "transparent", color: on ? "#fff" : colors.textMuted,
});

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
  // The dock has two faces the host toggles between: their messages (the
  // pullup chat — talk to your people) and Create (the event-building AI).
  // Messages is the default home; a build surface flips it to Create.
  const [dockTab, setDockTab] = useState("messages");

  // The create/edit page broadcasts the event being built so the dock can
  // become a live build chat (the /create-scoped canvas). Null elsewhere.
  const [canvasEventId, setCanvasEventId] = useState(null);
  useEffect(() => {
    const onContext = (e) => setCanvasEventId(e.detail?.eventId ?? null);
    window.addEventListener("pullup:canvas-context", onContext);
    return () => window.removeEventListener("pullup:canvas-context", onContext);
  }, []);
  // When a build surface is present, auto-open the dock on the Create face.
  useEffect(() => {
    if (canvasEventId) { setOpen(true); setDockTab("create"); }
  }, [canvasEventId]);

  // The floating slot has three modes derived from auth + MCP connection
  // status + whether the current page declares a host resource:
  //   - promo-connect   : logged in, no MCP connection (CTA to settings)
  //   - coach           : logged in, MCP connected, on a host resource
  //   - brand           : logged in, MCP connected, no resource (homepage,
  //                       settings, etc.) — brand presence + handoff
  // null hides the slot entirely (logged-out visitors, mobile, public
  // event pages, mid-load).
  const resource = useHostResource();
  const { hasActivity: _hasActivity, lastAction } = useRecentChatActivity({
    enabled: !!resource,
    targetType: resource?.type,
    targetId: resource?.id,
  });
  const mcpStatus = useMcpStatus(user);

  // Suppress the unused-var lint while we keep the hook live (its realtime
  // subscription drives lastAction, which the pulse + narration both use).
  void _hasActivity;

  let mode = null;
  const isEventPagePath = pathname.startsWith("/e/") || pathname.startsWith("/events/");
  if (isDesktop && !isEventPagePath && user) {
    if (mcpStatus.loading) {
      mode = null; // brief hide while we check connection state
    } else if (!mcpStatus.connected) {
      mode = "promo-connect";
    } else if (resource) {
      mode = "coach";
    } else {
      mode = "brand";
    }
  }
  const inAiMode = mode === "coach" || mode === "brand";

  // Coach suggestions for the AI mode panel. Fetched once we enter coach
  // mode (which requires a resource — brand mode skips this entirely).
  const [coachItems, setCoachItems] = useState(null);
  useEffect(() => {
    if (!inAiMode || !resource) { setCoachItems(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          surface: "event",
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
    if (!inAiMode || !open || !resource) return;
    let cancelled = false;
    (async () => {
      try {
        // No `since` filter — the panel shows the recent chat history on
        // this resource regardless of when. The pulse and realtime
        // subscription already handle the "AI is here right now" signal;
        // the narration is "what has chat done with this thing."
        const params = new URLSearchParams({
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
        { boxShadow: `0 4px 16px ${colors.silverShadow}, 0 0 28px rgba(180, 83, 9, 0.35)` },
        { boxShadow: `0 4px 16px ${colors.silverShadow}, 0 0 12px rgba(180, 83, 9, 0.08)` },
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
    let prompt;
    if (resource) {
      prompt = `I'm working on this event in PullUp (id: ${resource.id}) — pick up where we left off. You have the PullUp MCP connected.`;
    } else {
      // Brand-mode handoff — no specific resource, just open a fresh chat
      // primed for PullUp work.
      prompt = "Help me with my PullUp events. You have the PullUp MCP connected — check get_recent_actions and get_host_brief to ground yourself.";
    }
    return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
  }, [resource]);

  // The X in the panel header just closes the panel — the gold pill stays
  // (Felix's "at all times once MCP is connected" model). If the host wants
  // to truly hide the pill they'd disconnect MCP in settings.
  function dismissAiMode() {
    setOpen(false);
  }

  // Track in-flight mutations keyed by suggestion `key` so the right button
  // can show a "Adding…" state without disabling its siblings.
  const [mutatingKey, setMutatingKey] = useState(null);
  const [mutationError, setMutationError] = useState(null);

  function focusOrNavigate(url, focus) {
    if (!url) return;
    const target = url.split("?")[0];
    if (target === pathname) {
      if (focus) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("focus", focus);
          return next;
        }, { replace: true });
      }
    } else {
      const finalUrl = focus
        ? `${url}${url.includes("?") ? "&" : "?"}focus=${encodeURIComponent(focus)}`
        : url;
      navigate(finalUrl);
    }
  }

  async function runMutation(intent) {
    if (!resource?.id) return;
    setMutatingKey(intent._key || intent.mutation);
    setMutationError(null);
    try {
      if (intent.mutation === "add_spotify_section") {
        await addSpotifySection(resource.id);
      } else if (intent.mutation === "add_instagram_field") {
        await addInstagramField(resource.id);
      } else {
        throw new Error(`Unknown mutation: ${intent.mutation}`);
      }
      // Land the host on the right tab so they see what just got added.
      focusOrNavigate(intent.afterUrl, intent.focus);
      setOpen(false);
    } catch (err) {
      console.warn("[IdeaWidget] mutation failed:", err?.message);
      setMutationError(err?.message || "Couldn't apply that — try again");
    } finally {
      setMutatingKey(null);
    }
  }

  function dispatchIntent(intent) {
    if (!intent) return;
    if (intent.type === "navigate" && intent.url) {
      focusOrNavigate(intent.url, intent.focus);
      setOpen(false);
      return;
    }
    if (intent.type === "mutate") {
      runMutation(intent);
      return;
    }
  }

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (mode === null) return null;

  // Promo mode: MCP pitch for hosts who haven't wired up a token yet.
    return (
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999 }}>
        {open && (
          <div
            style={{
              position: "absolute",
              bottom: 56,
              right: 0,
              width: 340,
              background: colors.background,
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              padding: 18,
              boxShadow: "0 8px 30px rgba(10,10,10,0.10)",
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
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: colors.gold }}>
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
                  color: colors.textSubtle,
                }}
                aria-label="Hide for this session"
                title="Hide for this session"
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              <button onClick={() => setDockTab("messages")} style={dockTabStyle(dockTab === "messages")}><MessageCircle size={14} /> Messages</button>
              <button onClick={() => setDockTab("create")} style={dockTabStyle(dockTab === "create")}><Wand2 size={14} /> Create</button>
            </div>

            {dockTab === "messages" ? (
              <DockMessages />
            ) : (!mcpStatus.connected && !canvasEventId) ? (
              <div style={{ padding: "4px 0 8px" }}>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: colors.textMuted, marginBottom: 12 }}>
                  Connect PullUp to claude.ai (or any MCP-capable AI) and build events from chat — draft, edit, answer "who's coming Saturday." ~30 seconds.
                </div>
                <button onClick={() => { navigate("/settings"); setOpen(false); }} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(180,83,9,0.35)", background: "rgba(180,83,9,0.06)", color: colors.gold, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Connect your AI</button>
              </div>
            ) : (
              <>

            {canvasEventId && (
              <div style={{ height: "min(72vh, 540px)" }}>
                <CanvasChat
                  eventId={canvasEventId}
                  suggestions={(coachItems || []).map((it) => ({
                    label: it.headline,
                    prompt: it.headline,
                  }))}
                />
              </div>
            )}

            {!canvasEventId && (
            <>
            {recentActions.length > 0 && (
              <div
                style={{
                  marginBottom: 12,
                  paddingBottom: 12,
                  borderBottom: `1px solid ${colors.border}`,
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
                    color: colors.textFaded,
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
                    color: colors.textMuted,
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
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", color: intent ? colors.text : colors.textMuted }}>
                        {narrateAction(a)}
                      </span>
                      <span style={{ fontSize: 10.5, color: colors.textFaded, whiteSpace: "nowrap" }}>
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

            {!resource && (
              <div style={{ fontSize: 12.5, color: colors.textMuted, padding: "4px 0 8px", lineHeight: 1.5 }}>
                Your AI is connected. Open it from any host page for in-context coaching, or jump straight into claude.ai below.
              </div>
            )}
            {resource && coachItems === null && (
              <div style={{ fontSize: 12, color: colors.textSubtle, padding: "8px 0" }}>Loading…</div>
            )}
            {resource && coachItems && coachItems.length === 0 && (
              <div style={{ fontSize: 12, color: colors.textMuted, padding: "8px 0", lineHeight: 1.5 }}>
                Nothing left to suggest right now — looks tight from here.
              </div>
            )}
            {coachItems && coachItems.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {coachItems.map((it) => {
                  const target = it.intent?.url ? it.intent.url.split("?")[0] : null;
                  // Mutate intents are always actionable. Navigate intents on
                  // the same page need a `focus` to be meaningful; without
                  // one they're advice only.
                  const isMutate = it.intent?.type === "mutate";
                  const isInfo =
                    !isMutate &&
                    target && target === pathname && !it.intent?.focus;
                  const isMutating = mutatingKey === it.key;
                  return (
                    <button
                      key={it.key}
                      type="button"
                      onClick={() =>
                        isInfo || isMutating
                          ? null
                          : dispatchIntent({ ...it.intent, _key: it.key })
                      }
                      disabled={isInfo || isMutating}
                      style={{
                        textAlign: "left",
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        rowGap: 2,
                        columnGap: 10,
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: `1px solid ${isInfo ? colors.border : colors.borderStrong}`,
                        background: isInfo ? colors.surface : colors.background,
                        color: colors.text,
                        cursor: isInfo ? "default" : isMutating ? "wait" : "pointer",
                        opacity: isMutating ? 0.7 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isInfo && !isMutating) {
                          e.currentTarget.style.background = colors.surfaceMuted;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isInfo && !isMutating) {
                          e.currentTarget.style.background = colors.background;
                        }
                      }}
                    >
                      <span
                        style={{
                          gridColumn: 1,
                          gridRow: 1,
                          fontSize: 13.5,
                          fontWeight: 600,
                          lineHeight: 1.3,
                          color: colors.text,
                        }}
                      >
                        {isMutating ? "Adding…" : it.headline}
                      </span>
                      {it.why && !isMutating && (
                        <span
                          style={{
                            gridColumn: 1,
                            gridRow: 2,
                            fontSize: 11.5,
                            color: colors.textMuted,
                            lineHeight: 1.4,
                          }}
                        >
                          {it.why}
                        </span>
                      )}
                      {!isInfo && !isMutating && (
                        <ChevronRight
                          size={14}
                          style={{
                            gridColumn: 2,
                            gridRow: "1 / span 2",
                            alignSelf: "center",
                            color: colors.textSubtle,
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {mutationError && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11.5,
                  color: colors.danger,
                  lineHeight: 1.4,
                }}
              >
                {mutationError}
              </div>
            )}

            {continueChatUrl && (
              <a
                href={continueChatUrl}
                target="pullup-claude"
                rel="noopener noreferrer"
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: `1px solid rgba(180, 83, 9, 0.20)`,
                  background: `rgba(180, 83, 9, 0.04)`,
                  color: colors.gold,
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
            </>
            )}
            </>
            )}
          </div>
        )}

        {/* AI-mode trigger pill — amber-tinted to signal "AI is here" */}
        <button
          ref={triggerRef}
          onClick={() => setOpen((prev) => !prev)}
          title="PullUp"
          style={{
            borderRadius: 999,
            border: `1px solid rgba(180, 83, 9, 0.28)`,
            background: colors.background,
            boxShadow: "0 4px 16px rgba(10,10,10,0.08)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 7,
            color: colors.gold,
            transition: "all 0.15s ease",
            padding: "10px 14px 10px 12px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = colors.surface;
            e.currentTarget.style.boxShadow = "0 4px 16px rgba(10,10,10,0.12)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = colors.background;
            e.currentTarget.style.boxShadow = "0 4px 16px rgba(10,10,10,0.08)";
          }}
        >
          <span ref={sparkleRef} style={{ display: "inline-flex", alignItems: "center" }}>
            <Sparkles size={18} />
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", color: colors.gold }}>
            PullUp
            {coachItems && coachItems.length > 0 ? ` · ${coachItems.length}` : ""}
          </span>
        </button>
      </div>
    );

}
