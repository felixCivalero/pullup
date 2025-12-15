import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { logger } from "../lib/logger.js";

// Simple analytics tracking function
function trackEvent(eventName, properties = {}) {
  // For now, send via logger (can be wired to real analytics later)
  logger.info(`[Analytics] ${eventName}`, properties);
  // TODO: Integrate with analytics service (e.g., PostHog, Mixpanel, etc.)
}

export function LandingPage() {
  const navigate = useNavigate();
  const { signInWithGoogle, user } = useAuth();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [signingIn, setSigningIn] = useState(false);

  // Note: Removed auto-redirect to /home
  // Users should explicitly choose their path, even if logged in

  // Prevent scrolling on landing page - enforce single frame
  useEffect(() => {
    // Prevent all scrolling
    document.body.style.overflow = "hidden";
    document.body.style.height = "100vh";
    document.body.style.width = "100vw";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.height = "100vh";
    document.documentElement.style.width = "100vw";

    // Prevent touch scrolling on mobile
    const preventDefault = (e) => {
      if (e.touches.length > 1) return; // Allow pinch zoom
      e.preventDefault();
    };
    document.addEventListener("touchmove", preventDefault, { passive: false });
    document.addEventListener("wheel", preventDefault, { passive: false });
    document.addEventListener("scroll", preventDefault, { passive: false });

    return () => {
      document.body.style.overflow = "";
      document.body.style.height = "";
      document.body.style.width = "";
      document.documentElement.style.overflow = "";
      document.documentElement.style.height = "";
      document.documentElement.style.width = "";
      document.removeEventListener("touchmove", preventDefault);
      document.removeEventListener("wheel", preventDefault);
      document.removeEventListener("scroll", preventDefault);
    };
  }, []);

  const handlePrimaryCTA = async (type) => {
    trackEvent("landing_cta_click", {
      type,
      user_logged_in: !!user,
    });

    if (!user) {
      // Store intent, then redirect to login
      // The returnTo will be passed to signInWithGoogle
      try {
        setSigningIn(true);
        await signInWithGoogle(type === "post" ? "/post" : "/create");
        // OAuth redirect will happen automatically
      } catch (error) {
        console.error("Sign in error:", error);
        setSigningIn(false);
      }
    } else {
      // Already logged in, go directly to the flow
      navigate(type === "post" ? "/post" : "/create");
    }
  };

  const handleLoginClick = async () => {
    trackEvent("landing_login_click", {
      user_logged_in: !!user,
    });

    if (user) {
      // Already logged in, go straight to event creation
      navigate("/create");
    } else {
      // Not logged in, go to login (which will redirect to /create after)
      try {
        setSigningIn(true);
        await signInWithGoogle("/create");
        // OAuth redirect will happen automatically
      } catch (error) {
        console.error("Sign in error:", error);
        setSigningIn(false);
      }
    }
  };

  useEffect(() => {
    function handleMouseMove(e) {
      setMousePosition({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        maxHeight: "100vh",
        maxWidth: "100vw",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: "hidden",
        overscrollBehavior: "none",
        touchAction: "none",
      }}
      onWheel={(e) => e.preventDefault()}
      onTouchMove={(e) => e.preventDefault()}
    >
      {/* Animated gradient background */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.15) 0%, transparent 50%), #05040a",
          zIndex: 0,
        }}
      />

      {/* Cursor-following glow effect */}
      <div
        style={{
          position: "absolute",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)",
          left: mousePosition.x - 300,
          top: mousePosition.y - 300,
          pointerEvents: "none",
          transition: "all 0.3s ease-out",
          zIndex: 1,
        }}
      />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2 }}>
        {/* Hero Section - Single Frame Only - No Scrolling */}
        <section
          style={{
            height: "100vh",
            width: "100vw",
            maxHeight: "100vh",
            maxWidth: "100vw",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 20px",
            boxSizing: "border-box",
            overflow: "hidden",
            overscrollBehavior: "none",
            position: "relative",
          }}
        >
          {/* Floating Module - Mobile First, Centered */}
          <div
            style={{
              maxWidth: "400px",
              width: "100%",
              padding: "0 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            {/* Logo/Brand - Smaller for mobile */}
            <div
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                opacity: 0.5,
                marginBottom: "32px",
                fontWeight: 600,
              }}
            >
              PullUp
            </div>

            {/* Main Headline - Mobile Optimized */}
            <h1
              style={{
                fontSize: "clamp(32px, 10vw, 56px)",
                fontWeight: 800,
                lineHeight: "1.1",
                marginBottom: "16px",
                background:
                  "linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.9) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                textAlign: "center",
              }}
            >
              Make 'em{" "}
              <span
                style={{
                  background:
                    "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  display: "inline-block",
                }}
              >
                pull up
              </span>
            </h1>

            {/* Subheadline - Shorter for mobile */}
            <p
              style={{
                fontSize: "clamp(14px, 3.5vw, 18px)",
                opacity: 0.85,
                lineHeight: "1.5",
                marginBottom: "48px",
                maxWidth: "320px",
                textAlign: "center",
              }}
            >
              Create an RSVP link. Drop it in your bio.
            </p>

            {/* Primary CTAs - Mobile First, Stacked, Large Touch Targets */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                width: "100%",
                maxWidth: "340px",
                marginBottom: "32px",
              }}
            >
              {/* Post event quick - Fast & Energetic */}
              <button
                onClick={() => handlePrimaryCTA("post")}
                disabled={signingIn}
                style={{
                  width: "100%",
                  padding: "20px 24px",
                  borderRadius: "16px",
                  border: "none",
                  background:
                    "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "18px",
                  cursor: signingIn ? "wait" : "pointer",
                  boxShadow: "0 8px 24px rgba(139, 92, 246, 0.4)",
                  transition: "all 0.15s ease",
                  textAlign: "center",
                  opacity: signingIn ? 0.7 : 1,
                  minHeight: "64px",
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "8px",
                }}
                onTouchStart={(e) => {
                  if (!signingIn) {
                    e.currentTarget.style.transform = "scale(0.97)";
                    e.currentTarget.style.opacity = "0.9";
                  }
                }}
                onTouchEnd={(e) => {
                  if (!signingIn) {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.opacity = "1";
                  }
                }}
              >
                <span style={{ fontSize: "22px" }}>⚡</span>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: "2px",
                  }}
                >
                  <span style={{ fontSize: "18px", fontWeight: 700 }}>
                    Post event quick
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 400,
                      opacity: 0.95,
                      textTransform: "none",
                    }}
                  >
                    Friends pullup & social events
                  </span>
                </div>
              </button>

              {/* Plan event in detail - Secure & Professional */}
              <button
                onClick={() => handlePrimaryCTA("create")}
                disabled={signingIn}
                style={{
                  width: "100%",
                  padding: "20px 24px",
                  borderRadius: "16px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(255, 255, 255, 0.05)",
                  backdropFilter: "blur(10px)",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "18px",
                  cursor: signingIn ? "wait" : "pointer",
                  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
                  transition: "all 0.2s ease",
                  textAlign: "center",
                  opacity: signingIn ? 0.7 : 1,
                  minHeight: "64px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "4px",
                }}
                onTouchStart={(e) => {
                  if (!signingIn) {
                    e.currentTarget.style.transform = "scale(0.98)";
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.08)";
                  }
                }}
                onTouchEnd={(e) => {
                  if (!signingIn) {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.05)";
                  }
                }}
              >
                <span style={{ fontSize: "18px", fontWeight: 600 }}>
                  Plan event in detail
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 400,
                    opacity: 0.85,
                    textTransform: "none",
                  }}
                >
                  Structured, Dinner & Paid events
                </span>
              </button>
            </div>

            {/* Visual Separator - Subtle */}
            <div
              style={{
                width: "100%",
                maxWidth: "280px",
                height: "1px",
                background: "rgba(255, 255, 255, 0.08)",
                marginBottom: "20px",
              }}
            />

            {/* Secondary Login - De-emphasized, Link Style */}
            <div
              style={{
                fontSize: "14px",
                opacity: 0.5,
                textAlign: "center",
                marginBottom: "32px",
              }}
            >
              <span style={{ opacity: 0.6 }}>Already hosting? </span>
              <a
                href="/home"
                onClick={(e) => {
                  e.preventDefault();
                  handleLoginClick();
                }}
                style={{
                  color: "rgba(255, 255, 255, 0.7)",
                  textDecoration: "none",
                  cursor: "pointer",
                  transition: "opacity 0.2s ease",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
                  paddingBottom: "2px",
                }}
                onTouchStart={(e) => {
                  e.target.style.opacity = "1";
                }}
                onTouchEnd={(e) => {
                  e.target.style.opacity = "0.7";
                }}
              >
                Log in →
              </a>
            </div>

            {/* Stats/Trust indicators - Mobile Optimized */}
            <div
              style={{
                display: "flex",
                gap: "20px",
                justifyContent: "center",
                flexWrap: "wrap",
                fontSize: "12px",
                opacity: 0.5,
                marginTop: "auto",
                paddingTop: "24px",
              }}
            >
              <div>⚡ Instant</div>
              <div>🚫 No signup</div>
              <div>🔥 Free</div>
            </div>
          </div>
        </section>
      </div>

      {/* Animations & Global Scroll Prevention */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.8;
          }
        }
        
        /* Prevent all scrolling on landing page */
        html, body {
          overflow: hidden !important;
          height: 100vh !important;
          width: 100vw !important;
          position: fixed !important;
          overscroll-behavior: none !important;
          touch-action: none !important;
        }
      `}</style>
    </div>
  );
}
