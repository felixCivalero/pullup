import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";

export function LandingPage() {
  const navigate = useNavigate();
  const { signInWithGoogle, user } = useAuth();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [signingIn, setSigningIn] = useState(false);

  // If user is already logged in, redirect to home
  useEffect(() => {
    if (user) {
      navigate("/home");
    }
  }, [user, navigate]);

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

  const handleSignIn = async () => {
    try {
      setSigningIn(true);
      await signInWithGoogle();
      // OAuth redirect will happen automatically
    } catch (error) {
      console.error("Sign in error:", error);
      setSigningIn(false);
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
          {/* Floating Module - Centered in middle of screen */}
          <div
            style={{
              maxWidth: "900px",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            {/* Logo/Brand */}
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                opacity: 0.6,
                marginBottom: "24px",
                fontWeight: 600,
              }}
            >
              PullUp
            </div>

            {/* Main Headline */}
            <h1
              style={{
                fontSize: "clamp(36px, 8vw, 72px)",
                fontWeight: 800,
                lineHeight: "1.1",
                marginBottom: "24px",
                background:
                  "linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.8) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Make 'em
              <br />
              <span
                style={{
                  background:
                    "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  display: "inline-block",
                  animation: "pulse 2s ease-in-out infinite",
                }}
              >
                pull up
              </span>
            </h1>

            {/* Subheadline */}
            <p
              style={{
                fontSize: "clamp(16px, 2.5vw, 22px)",
                opacity: 0.8,
                lineHeight: "1.6",
                marginBottom: "40px",
                maxWidth: "600px",
              }}
            >
              Create a sexy RSVP link in seconds. Drop it in your bio. Watch
              people pull up.
            </p>

            {/* CTA Buttons - Only interactive elements */}
            <div
              style={{
                display: "flex",
                gap: "16px",
                justifyContent: "center",
                flexWrap: "wrap",
                marginBottom: "32px",
              }}
            >
              <button
                onClick={handleSignIn}
                disabled={signingIn}
                style={{
                  padding: "16px 32px",
                  borderRadius: "999px",
                  border: "none",
                  background:
                    "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "16px",
                  cursor: signingIn ? "wait" : "pointer",
                  boxShadow: "0 10px 30px rgba(139, 92, 246, 0.4)",
                  transition: "all 0.3s ease",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  opacity: signingIn ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!signingIn) {
                  e.target.style.transform = "translateY(-2px)";
                  e.target.style.boxShadow =
                    "0 15px 40px rgba(139, 92, 246, 0.6)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!signingIn) {
                  e.target.style.transform = "translateY(0)";
                  e.target.style.boxShadow =
                    "0 10px 30px rgba(139, 92, 246, 0.4)";
                  }
                }}
              >
                {signingIn ? "Signing in..." : "Start free now"}
              </button>
              {/* Google Sign-In Button - Following Google's UX Guidelines */}
              <button
                onClick={handleSignIn}
                disabled={signingIn}
                style={{
                  padding: "12px 24px",
                  borderRadius: "4px",
                  border: "1px solid #dadce0",
                  background: "#fff",
                  color: "#3c4043",
                  fontWeight: 500,
                  fontSize: "14px",
                  fontFamily:
                    '"Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  cursor: signingIn ? "wait" : "pointer",
                  transition: "all 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  boxShadow: signingIn
                    ? "none"
                    : "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)",
                  opacity: signingIn ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!signingIn) {
                    e.target.style.boxShadow =
                      "0 2px 6px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.12)";
                    e.target.style.background = "#f8f9fa";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!signingIn) {
                    e.target.style.boxShadow =
                      "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)";
                    e.target.style.background = "#fff";
                  }
                }}
                onMouseDown={(e) => {
                  if (!signingIn) {
                    e.target.style.boxShadow = "0 1px 2px rgba(0,0,0,0.1)";
                  }
                }}
                onMouseUp={(e) => {
                  if (!signingIn) {
                    e.target.style.boxShadow =
                      "0 2px 6px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.12)";
                  }
                }}
              >
                {/* Google Logo SVG */}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  style={{ flexShrink: 0 }}
                >
                  <path
                    fill="#4285F4"
                    d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                  />
                  <path
                    fill="#34A853"
                    d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.712 0-.595.102-1.172.282-1.712V4.956H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.044l3.007-2.332z"
                  />
                  <path
                    fill="#EA4335"
                    d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.956L3.964 7.288C4.672 5.163 6.656 3.58 9 3.58z"
                  />
                </svg>
                <span style={{ color: "#3c4043" }}>
                  {signingIn ? "Signing in..." : "Continue with Google"}
                </span>
              </button>
            </div>

            {/* Stats/Trust indicators - Compact to fit in single frame */}
            <div
              style={{
                display: "flex",
                gap: "24px",
                justifyContent: "center",
                flexWrap: "wrap",
                fontSize: "13px",
                opacity: 0.6,
                marginTop: "auto",
              }}
            >
              <div>⚡ Instant links</div>
              <div>🚫 No signup required</div>
              <div>🔥 Free forever</div>
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
