import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { logger } from "../lib/logger.js";
import { colors } from "../theme/colors.js";
import { SilverIcon } from "../components/ui/SilverIcon.jsx";
import { authenticatedFetch } from "../lib/api.js";

// Simple analytics tracking function
function trackEvent(eventName, properties = {}) {
  // For now, send via logger (can be wired to real analytics later)
  logger.info(`[Analytics] ${eventName}`, properties);
  // TODO: Integrate with analytics service (e.g., PostHog, Mixpanel, etc.)
}

export function LandingPage() {
  const navigate = useNavigate();
  const { signInWithGoogle, signInWithEmailPassword, user } = useAuth();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState(null);
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);
  const [newsletterPopup, setNewsletterPopup] = useState(null);

  // Auto-redirect to /events if already logged in
  // (handles OAuth callback landing back on "/" after session is established)
  useEffect(() => {
    if (user) {
      navigate("/events", { replace: true });
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

  const handleEmailPasswordSubmit = async (event) => {
    event.preventDefault();
    if (signingIn) return;

    setFormError("");
    trackEvent("landing_email_login_submit", {
      user_logged_in: !!user,
    });

    try {
      setSigningIn(true);
      await signInWithEmailPassword(email.trim(), password);
      navigate("/events");
    } catch (error) {
      const raw = error?.message || "";
      const msg = raw.toLowerCase();

      let friendlyMessage = "Something went wrong signing you in. Please try again.";

      if (msg.includes("email not confirmed")) {
        friendlyMessage =
          "Check your email to confirm your account, then come back here to enter pullup.";
      } else if (msg.includes("email address") && msg.includes("invalid")) {
        friendlyMessage = "Enter a valid email address to continue.";
      } else if (msg.includes("rate limit") || msg.includes("too many requests")) {
        friendlyMessage =
          "Too many attempts for this email. Wait a moment, then try again.";
      } else if (msg.includes("already registered")) {
        friendlyMessage =
          "This email already uses a sign-in method. Try \"Continue with Google\" for this address.";
      } else if (msg.includes("password")) {
        friendlyMessage = raw;
      } else if (msg.includes("invalid login credentials")) {
        friendlyMessage = "Incorrect email or password.";
      }

      setFormError(friendlyMessage);
    } finally {
      setSigningIn(false);
    }
  };

  const handleGoogleContinue = async () => {
    if (signingIn) return;

    trackEvent("landing_google_continue_click", {
      user_logged_in: !!user,
    });

    if (user) {
      navigate("/events");
      return;
    }

    try {
      setSigningIn(true);
      await signInWithGoogle("/events");
    } catch (error) {
      console.error("Sign in error:", error);
      setFormError("Google sign-in failed. Please try again.");
      setSigningIn(false);
    }
  };

  const handleNewsletterSubmit = async (event) => {
    event.preventDefault();
    if (!newsletterEmail || newsletterSubmitting) return;

    setNewsletterStatus(null);
    setNewsletterPopup(null);
    trackEvent("landing_newsletter_submit", {
      email_present: !!newsletterEmail,
    });

    try {
      setNewsletterSubmitting(true);
      const response = await authenticatedFetch("/newsletter", {
        method: "POST",
        body: JSON.stringify({
          email: newsletterEmail.trim(),
          source: "landing_newsletter",
        }),
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const code = String(payload?.code || "").toLowerCase();

        let message = "Couldn’t sign you up. Try again soon.";
        if (code === "invalid_email") {
          message = "Enter a valid email address to continue.";
        } else if (code === "rate_limited") {
          message =
            "Too many attempts for this email. Wait a moment, then try again.";
        } else if (code === "suppressed") {
          message =
            "We can't subscribe this address right now. Try a different email.";
        } else if (code === "newsletter_not_configured") {
          message = "Newsletter is not configured yet.";
        }

        setNewsletterStatus(message);
        setNewsletterPopup({
          type: "error",
          title: "Couldn’t sign you up",
          message,
        });
        return;
      }

      const status = payload?.status || "subscribed";
      let message = "You’re in. Watch your inbox for upcoming underground events.";
      let title = "Subscribed";

      if (status === "already_subscribed") {
        title = "Already subscribed";
        message = "You’re already in. We’ll keep you in the loop.";
      } else if (status === "resubscribed") {
        title = "Welcome back";
        message = "Welcome back. You’ll start getting invites again.";
      }

      setNewsletterStatus(message);
      setNewsletterPopup({
        type: "success",
        title,
        message,
      });
      setNewsletterEmail("");
    } catch (error) {
      console.error("Newsletter signup error:", error);
      const message = "Couldn’t sign you up. Try again soon.";
      setNewsletterStatus(message);
      setNewsletterPopup({
        type: "error",
        title: "Couldn’t sign you up",
        message,
      });
    } finally {
      setNewsletterSubmitting(false);
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
          background: `${colors.gradientGlow}, ${colors.background}`,
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
          background: colors.gradientCursorGlow,
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
            padding: "clamp(16px, 3vh, 32px) 20px clamp(16px, 4vh, 96px)",
            boxSizing: "border-box",
            overflow: "hidden",
            overscrollBehavior: "none",
            position: "relative",
          }}
        >
          {/* Floating Module - Mobile First, Centered */}
          <div
            style={{
              maxWidth: "420px",
              width: "100%",
              padding: "0 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            {/* Main Headline - Mobile Optimized */}
            <h1
              style={{
                fontSize: "clamp(34px, 9vw, 60px)",
                fontWeight: 800,
                lineHeight: "1.1",
                marginBottom: "clamp(8px, 1.5vh, 18px)",
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
                  background: colors.gradientPrimary,
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
                marginBottom: "clamp(8px, 1.5vh, 20px)",
                maxWidth: "320px",
                textAlign: "center",
              }}
            >
              Everything cultural hosts need -{" "}
              <span
                style={{
                  background:
                    "linear-gradient(90deg, #FFD700 0%, #FFB200 40%, #FFF7AA 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  fontWeight: 800,
                  letterSpacing: "0.01em",
                  textShadow: "0 2px 8px rgba(255, 215, 0, 0.28)",
                }}
              >
                always free
              </span>
            </p>

            {/* Auth card - email/password + Google */}
            <div
              style={{
                width: "100%",
                maxWidth: "320px",
                padding: "clamp(12px, 2vh, 20px) 18px clamp(12px, 2vh, 18px)",
                borderRadius: "22px",
                background:
                  "linear-gradient(145deg, rgba(11,10,20,0.96), rgba(17,15,30,0.98))",
                boxShadow:
                  "0 22px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.06)",
                backdropFilter: "blur(18px)",
                display: "flex",
                flexDirection: "column",
                gap: "clamp(8px, 1.2vh, 14px)",
                alignItems: "stretch",
                marginBottom: "clamp(8px, 1.5vh, 18px)",
              }}
            >
              <form
                onSubmit={handleEmailPasswordSubmit}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "clamp(6px, 1vh, 10px)",
                }}
              >
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <label
                    style={{
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.72)",
                      textAlign: "left",
                    }}
                    htmlFor="landing-email"
                  >
                    Email
                  </label>
                  <input
                    id="landing-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "clamp(9px, 1.3vh, 12px) 14px",
                      borderRadius: "999px",
                      border: "1px solid rgba(255,255,255,0.14)",
                      background:
                        "radial-gradient(circle at 0 0, rgba(255,255,255,0.09), transparent 60%), rgba(8,7,15,0.92)",
                      color: "#fff",
                      fontSize: "13px",
                      outline: "none",
                      boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
                    }}
                  />
                </div>

                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <label
                    style={{
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.72)",
                      textAlign: "left",
                    }}
                    htmlFor="landing-password"
                  >
                    Password
                  </label>
                  <input
                    id="landing-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "clamp(9px, 1.3vh, 12px) 14px",
                      borderRadius: "999px",
                      border: "1px solid rgba(255,255,255,0.14)",
                      background:
                        "radial-gradient(circle at 0 0, rgba(255,255,255,0.07), transparent 60%), rgba(8,7,15,0.92)",
                      color: "#fff",
                      fontSize: "13px",
                      outline: "none",
                      boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    marginTop: "2px",
                    marginBottom: "2px",
                  }}
                >
                  <button
                    type="submit"
                    disabled={signingIn}
                    style={{
                      width: "100%",
                      padding: "clamp(10px, 1.4vh, 13px) 0",
                      borderRadius: "999px",
                      border: "none",
                      background:
                        "linear-gradient(135deg, #A7A8AA 0%, #ECECEC 65%, #87898C 100%)", // PullUp original silver gradient
                      color: "#232629",
                      fontSize: "13px",
                      fontWeight: 700,
                      minWidth: "0",
                      cursor: signingIn ? "wait" : "pointer",
                      boxShadow:
                        "0 8px 20px rgba(170,170,175,0.12), 0 0 0 1px rgba(160,160,170,0.18)",
                      opacity: signingIn ? 0.8 : 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      letterSpacing: "0.01em",
                      transition: "background 0.18s, box-shadow 0.18s",
                    }}
                  >
                    {signingIn ? "Entering..." : "Enter pullup"}
                  </button>
                </div>

                {formError && (
                  <div
                    style={{
                      marginTop: "4px",
                      fontSize: "11px",
                      color: "rgba(255, 119, 119, 0.96)",
                      textAlign: "left",
                    }}
                  >
                    {formError}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginTop: "clamp(4px, 0.8vh, 10px)",
                    marginBottom: "clamp(2px, 0.5vh, 4px)",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background: "rgba(255,255,255,0.06)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.16em",
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    or
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background: "rgba(255,255,255,0.06)",
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleContinue}
                  disabled={signingIn}
                  style={{
                    width: "100%",
                    borderRadius: "999px",
                    border: "1px solid rgba(0,0,0,0.16)",
                    background: "#ffffff",
                    padding: "clamp(8px, 1.2vh, 10px) 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    cursor: signingIn ? "wait" : "pointer",
                    boxShadow:
                      "0 1px 2px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.1)",
                    color: "#3c4043",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 2,
                      overflow: "hidden",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ width: 18, height: 18, display: "block" }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.61l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.4 5.38 2.56 13.22l7.98 6.2C12.48 13.02 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#34A853"
                        d="M46.98 24.55c0-1.64-.15-3.21-.43-4.74H24v9.02h12.94c-.56 2.9-2.26 5.36-4.82 7.02l7.66 5.94C44.54 37.89 46.98 31.76 46.98 24.55z"
                      />
                      <path
                        fill="#4A90E2"
                        d="M10.54 28.42a10.5 10.5 0 0 1-.55-3.17c0-1.1.2-2.16.55-3.17l-7.98-6.2A23.86 23.86 0 0 0 0 25.25c0 3.8.9 7.39 2.56 10.62l7.98-6.2z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M24 47.5c6.48 0 11.93-2.13 15.9-5.79l-7.66-5.94C30.62 37.48 27.61 38.5 24 38.5c-6.26 0-11.52-3.52-13.46-8.92l-7.98 6.2C6.4 42.62 14.62 47.5 24 47.5z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                  </span>
                  <span>Continue with Google</span>
                </button>
              </form>
            </div>
            {/* Stats/Trust indicators - Mobile Optimized */}
            <div
              style={{
                display: "flex",
                gap: "20px",
                justifyContent: "center",
                flexWrap: "wrap",
                fontSize: "12px",
                opacity: 0.55,
                marginTop: "clamp(6px, 1vh, 16px)",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <SilverIcon as={Sparkles} size={14} /> Custom events
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <SilverIcon as={Sparkles} size={14} /> Email marketing
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <SilverIcon as={Sparkles} size={14} /> Free
              </div>
            </div>

            {/* Newsletter block - integrated with content */}
            <div
              style={{
                width: "100%",
                maxWidth: "320px",
                marginTop: "clamp(14px, 3vh, 66px)",
                padding: "14px 14px 12px",
                borderRadius: "18px",
                background:
                  "linear-gradient(135deg, rgba(56,40,6,0.92) 0%, rgba(102,76,14,0.9) 45%, rgba(150,112,24,0.9) 100%)",
                border: "1px solid rgba(255,230,160,0.18)",
                boxShadow:
                  "0 18px 38px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.75)",
                backdropFilter: "blur(12px)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <form
                onSubmit={handleNewsletterSubmit}
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                      color: "rgba(255,255,255,0.9)",
                      marginBottom: 2,
                    }}
                  >
                    Stay in the loop, fomo is real.
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      lineHeight: 1.6,
                      color: "rgba(255,255,255,0.68)",
                      maxWidth: "320px",
                    }}
                  >
                    Get invites to special underground events, private dinners
                    and deep cultural experiences.
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                  }}
                >
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={{
                      flex: 1,
                      padding: "9px 12px",
                      borderRadius: "999px",
                      border: "1px solid rgba(255,255,255,0.18)",
                      background:
                        "radial-gradient(circle at 0 0, rgba(255,255,255,0.09), transparent 60%), rgba(7,6,14,0.92)",
                      color: "#fff",
                      fontSize: "12px",
                      outline: "none",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={newsletterSubmitting}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "999px",
                      border: "none",
                      background:
                        "linear-gradient(135deg, #f5f5f5 0%, #c7c7c7 60%, #a1a1a1 100%)",
                      color: "#121212",
                      fontSize: "11px",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      cursor: newsletterSubmitting ? "wait" : "pointer",
                      whiteSpace: "nowrap",
                      boxShadow:
                        "0 4px 10px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.4)",
                      opacity: newsletterSubmitting ? 0.8 : 1,
                    }}
                  >
                    {newsletterSubmitting ? "Joining..." : "Join"}
                  </button>
                </div>

                {newsletterStatus && (
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: "11px",
                      color: "rgba(255,255,255,0.7)",
                      textAlign: "left",
                    }}
                  >
                    {newsletterStatus}
                  </div>
                )}
              </form>
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
      {newsletterPopup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0, 0, 0, 0.6)",
            padding: "24px",
          }}
          onClick={() => setNewsletterPopup(null)}
        >
          <div
            style={{
              maxWidth: "340px",
              width: "100%",
              borderRadius: "20px",
              background:
                "linear-gradient(145deg, rgba(11,10,20,0.98), rgba(17,15,30,0.98))",
              boxShadow: "0 24px 60px rgba(0,0,0,0.85)",
              border: "1px solid rgba(255,255,255,0.16)",
              padding: "18px 18px 14px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: "13px",
                fontWeight: 600,
                marginBottom: 6,
                color:
                  newsletterPopup.type === "success"
                    ? "rgba(255,255,255,0.96)"
                    : "rgba(255,180,180,0.96)",
              }}
            >
              {newsletterPopup.title}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.8)",
                marginBottom: 14,
              }}
            >
              {newsletterPopup.message}
            </div>
            <button
              type="button"
              onClick={() => setNewsletterPopup(null)}
              style={{
                width: "100%",
                padding: "10px 0",
                borderRadius: "999px",
                border: "none",
                background:
                  "linear-gradient(135deg, #f5f5f5 0%, #c7c7c7 60%, #a1a1a1 100%)",
                color: "#121212",
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
