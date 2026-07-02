import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { X, Sparkles, ChevronRight, ExternalLink, MessageCircle, Wand2, Send } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useHostResource } from "../contexts/useHostResource.js";
import { useRecentChatActivity } from "../lib/useRecentChatActivity.js";
import { addSpotifySection, addInstagramField } from "../lib/coachMutations.js";
import { useMcpStatus } from "../lib/useMcpStatus.js";
import { AI_CREATE_ENABLED } from "../lib/featureFlags.js";
import { colors } from "../theme/colors.js";
import { CanvasChat } from "./CanvasChat.jsx";

// Tiny face-pile tints for the Messages trigger (mirrors DockMessages avatars).
const FACE_TINTS = ["#ec178f", "#0d9488", "#ea580c", "#7c3aed", "#1478c8", "#e11d48"];
function faceColor(n) { let h = 0; for (const c of String(n || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return FACE_TINTS[h % FACE_TINTS.length]; }
function faceInitials(n = "") { return String(n).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"; }
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
  const [msgExpanded, setMsgExpanded] = useState(false);

  // A notification (or anywhere) can pop the Messages dock open on a specific
  // person's thread via the `pullup:open-thread` event. {id,ts} — ts so the same
  // person re-opens even if already the target.
  const [openThread, setOpenThread] = useState(null);
  useEffect(() => {
    const onOpenThread = (e) => {
      const pid = e?.detail?.personId;
      if (!pid) return;
      setDockTab("messages");
      setOpen(true);
      setOpenThread({ id: pid, ts: Date.now() });
    };
    window.addEventListener("pullup:open-thread", onOpenThread);
    return () => window.removeEventListener("pullup:open-thread", onOpenThread);
  }, []);

  // An event room's "Message guests" pops the dock open pre-aimed at that
  // event's audience via `pullup:message-event`. {id,ts} — ts so the same
  // event re-applies even if already the filter.
  const [openEventFilter, setOpenEventFilter] = useState(null);
  useEffect(() => {
    const onMessageEvent = (e) => {
      const eid = e?.detail?.eventId;
      if (!eid) return;
      setDockTab("messages");
      setOpen(true);
      setOpenEventFilter({ id: eid, ts: Date.now() });
    };
    window.addEventListener("pullup:message-event", onMessageEvent);
    return () => window.removeEventListener("pullup:message-event", onMessageEvent);
  }, []);

  // The create/edit page broadcasts the event being built so the dock can
  // become a live build chat (the /create-scoped canvas). Null elsewhere.
  const [canvasEventId, setCanvasEventId] = useState(null);
  useEffect(() => {
    // AI build canvas paused (out of Anthropic credits) — ignore the create
    // page's context broadcast so the dock stays on Messages everywhere.
    if (!AI_CREATE_ENABLED) return;
    const onContext = (e) => setCanvasEventId(e.detail?.eventId ?? null);
    window.addEventListener("pullup:canvas-context", onContext);
    return () => window.removeEventListener("pullup:canvas-context", onContext);
  }, []);
  // When a build surface is present, auto-open the dock on the Create face.
  useEffect(() => {
    if (canvasEventId) { setOpen(true); setDockTab("create"); }
  }, [canvasEventId]);

  // The create page's "let AI build the look" offer: open the dock on the
  // Create face and seed the composer with a ready-to-send prompt (the host
  // still hits send — we draft, we don't auto-fire).
  const [canvasSeed, setCanvasSeed] = useState(null);
  useEffect(() => {
    if (!AI_CREATE_ENABLED) return; // canvas paused — see note above
    const onBuildLook = (e) => {
      setOpen(true);
      setDockTab("create");
      setCanvasSeed({ text: e.detail?.prompt || "", key: e.detail?.key || `${e.timeStamp}` });
    };
    window.addEventListener("pullup:ai-build-look", onBuildLook);
    return () => window.removeEventListener("pullup:ai-build-look", onBuildLook);
  }, []);

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

  // A few faces for the Messages trigger — needs-you first. Lightweight read.
  const [roomFaces, setRoomFaces] = useState([]);
  useEffect(() => {
    let alive = true;
    authenticatedFetch("/host/room")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        const ppl = [...(d.people || [])].sort((a, b) => (b.needsYou ? 1 : 0) - (a.needsYou ? 1 : 0));
        setRoomFaces(ppl.slice(0, 3));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

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

  // Desktop hides the slot when there's no mode (logged out / mid-load / public
  // page). On mobile the AI coach faces stay off, but Messages — your people —
  // should still be one tap away for any logged-in host on an in-app route.
  const mobileMessages = !isDesktop && !!user && !isEventPagePath;
  if (mode === null && !mobileMessages) return null;

  // On mobile the dock opens as a full-screen sheet (native messaging feel),
  // not the small desktop popup. The two-pane "expanded" mode is desktop-only
  // (it needs width), so mobile always rides the single-pane DockMessages.
  const fullScreen = !isDesktop;

    return (
      <div style={{ position: "fixed", bottom: "calc(24px + env(safe-area-inset-bottom, 0px))", right: 24, zIndex: 9999 }}>
        {open && (
          <div
            style={
              fullScreen
                ? { position: "fixed", inset: 0, zIndex: 10000, background: colors.background, display: "flex", flexDirection: "column", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", boxSizing: "border-box" }
                : canvasEventId
                ? { position: "absolute", bottom: 56, right: 0, width: 360, background: colors.background, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 18, boxShadow: "0 8px 30px rgba(10,10,10,0.10)" }
                : { position: "absolute", bottom: 56, right: 0, width: msgExpanded ? "min(96vw, 960px)" : 372, height: msgExpanded ? "min(88vh, 780px)" : 560, maxHeight: "88vh", background: colors.background, border: `1px solid ${colors.borderStrong}`, borderRadius: 20, overflow: "hidden", boxShadow: "0 20px 60px rgba(10,10,10,0.18)" }
            }
          >
            {canvasEventId ? (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: fullScreen ? "14px 14px 0" : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, color: colors.gold }}>
                    <Sparkles size={14} />
                    <span style={{ fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 600 }}>PullUp · build</span>
                  </div>
                  <button onClick={dismissAiMode} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: colors.textSubtle }} aria-label="Hide for this session" title="Hide for this session"><X size={16} /></button>
                </div>
                <div style={{ height: fullScreen ? "auto" : "min(64vh, 480px)", flex: fullScreen ? 1 : undefined, minHeight: 0 }}>
                  <CanvasChat eventId={canvasEventId} seed={canvasSeed} suggestions={(coachItems || []).map((it) => ({ label: it.headline, prompt: it.headline }))} />
                </div>
              </>
            ) : (
              <DockMessages
                onClose={() => setOpen(false)}
                expanded={!fullScreen && msgExpanded}
                onToggleExpand={fullScreen ? undefined : () => setMsgExpanded((v) => !v)}
                openThread={openThread}
                openEventFilter={openEventFilter}
              />
            )}
          </div>
        )}

        {/* Trigger pill — "Messages" (your people) by default; "PullUp" sparkle in
            AI-build mode. Hidden whenever the dock is open (the panel has its own
            close) — on desktop it used to stay visible and float over the panel's
            footer "Write to N" button. */}
        {!open && (
        <button
          ref={triggerRef}
          onClick={() => setOpen((prev) => !prev)}
          title={canvasEventId ? "PullUp" : "Messages"}
          style={{
            borderRadius: 999,
            border: `1px solid ${canvasEventId ? "rgba(180, 83, 9, 0.28)" : colors.border}`,
            background: colors.background,
            boxShadow: "0 4px 16px rgba(10,10,10,0.08)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: canvasEventId ? colors.gold : colors.text,
            transition: "all 0.15s ease",
            padding: "9px 13px 9px 14px",
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
          {canvasEventId ? (
            <>
              <span ref={sparkleRef} style={{ display: "inline-flex", alignItems: "center" }}>
                <Sparkles size={18} />
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", color: colors.gold }}>
                PullUp
                {coachItems && coachItems.length > 0 ? ` · ${coachItems.length}` : ""}
              </span>
            </>
          ) : (
            <>
              <Send size={17} color={colors.accent} strokeWidth={2.2} />
              <span style={{ fontSize: 14, fontWeight: 750, whiteSpace: "nowrap", color: colors.text, letterSpacing: "-0.01em" }}>
                Messages
              </span>
              {roomFaces.length > 0 && (
                <span style={{ display: "flex", marginLeft: 4 }}>
                  {roomFaces.map((p, i) => (
                    <span key={p.id || i} title={p.name}
                      style={{ marginLeft: i === 0 ? 0 : -8, width: 24, height: 24, borderRadius: "50%", boxShadow: `0 0 0 2px ${colors.background}`, background: `linear-gradient(135deg, ${faceColor(p.name)} 0%, ${faceColor(p.name)}99 100%)`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 800, letterSpacing: "-0.02em" }}>
                      {faceInitials(p.name)}
                    </span>
                  ))}
                </span>
              )}
            </>
          )}
        </button>
        )}
      </div>
    );

}
