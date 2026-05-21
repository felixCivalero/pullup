import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Lightbulb, X, Send, Sparkles, ChevronRight } from "lucide-react";
import { colors } from "../theme/colors.js";
import { authenticatedFetch, publicFetch } from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useHostResource } from "../contexts/useHostResource.js";
import { useRecentChatActivity } from "../lib/useRecentChatActivity.js";

function getAiDismissKey(type, id) {
  return `coach-widget-dismissed:${type || "_"}:${id || "_"}`;
}

export function IdeaWidget() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
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
  const { hasActivity } = useRecentChatActivity({
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
      if (target !== pathname) {
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
                  const isInfo = target && target === pathname;
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
          </div>
        )}

        {/* AI-mode trigger pill — gold-tinted to signal "AI is here" */}
        <button
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
          <Sparkles size={18} />
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
