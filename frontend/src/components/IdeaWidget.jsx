import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Lightbulb, X, Send } from "lucide-react";
import { colors } from "../theme/colors.js";
import { authenticatedFetch, publicFetch } from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext.jsx";

export function IdeaWidget() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const textareaRef = useRef(null);

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
