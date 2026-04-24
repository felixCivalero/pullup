import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowRight,
  X,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors.js";
import { authenticatedFetch, publicFetch } from "../lib/api.js";

/* ─── helpers ─── */
function trackEvent(name, props) {
  try {
    if (window.gtag) window.gtag("event", name, props);
  } catch {}
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "13px 16px",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontSize: "14px",
  outline: "none",
};

const ROTATING_WORDS = ["people", "life", "culture", "art"];

const LOGOS = [
  // `invert: true` for dark-on-transparent logos that need to flip to white on the dark bg.
  // Colour logos (Cliff Barnes orange) and already-white logos (Zoda) render untouched.
  { type: "image", src: "/landing/logos/soho-house.png", alt: "Soho House", invert: true },
  { type: "image", src: "/landing/logos/doberman.png", alt: "EY Doberman", invert: true },
  { type: "image", src: "/landing/logos/cliff-barnes.svg", alt: "Cliff Barnes Bränneri" },
  { type: "image", src: "/zoda_logotype_white.webp", alt: "Zoda" },
  { type: "image", src: "/landing/logos/showlighters.png", alt: "Showlighters" },
];

/* ─── generic reveal wrapper ─── */
function Reveal({ children, delay = 0, y = 24 }) {
  const [ref, visible] = useReveal(0.12);
  return (
    <div
      ref={ref}
      style={{
        transform: visible ? "translateY(0)" : `translateY(${y}px)`,
        opacity: visible ? 1 : 0,
        transition: `transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, opacity 0.7s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/* ─── scroll reveal hook ─── */
function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

/* ─── component ─── */
export function LandingPage() {
  const navigate = useNavigate();
  const { signInWithGoogle, signInWithEmailPassword, user } = useAuth();

  const [showAuth, setShowAuth] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [authConsent, setAuthConsent] = useState(false);

  const handleSignupClick = useCallback(
    () => (user ? navigate("/events") : setShowAuth(true)),
    [user, navigate],
  );

  const [scrolled, setScrolled] = useState(false);


  /* ─── golden particle canvas ─── */
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const mouseRef = useRef({ x: -1, y: -1 });
  const lastSpawnRef = useRef(0);
  const rafRef = useRef(null);

  const GLYPHS = ["♪", "♫", "♬", "✦", "✧", "·"];

  const spawnParticle = useCallback((x, y) => {
    const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    const isNote = glyph === "♪" || glyph === "♫" || glyph === "♬";
    particlesRef.current.push({
      x: x + (Math.random() - 0.5) * 40,
      y: y + (Math.random() - 0.5) * 40,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -(0.3 + Math.random() * 0.5),
      life: 1,
      decay: 0.008 + Math.random() * 0.008,
      size: isNote ? 10 + Math.random() * 8 : 3 + Math.random() * 3,
      glyph,
      rotation: (Math.random() - 0.5) * 0.6,
      rotSpeed: (Math.random() - 0.5) * 0.02,
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = document.documentElement.scrollHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Re-measure canvas height when content changes (images load, etc.)
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(document.documentElement);

    const onMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY + window.scrollY };
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });

    const animate = () => {
      const now = Date.now();
      const { x, y } = mouseRef.current;

      // Spawn particles on mouse move (throttled)
      if (x >= 0 && now - lastSpawnRef.current > 60) {
        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) spawnParticle(x, y);
        lastSpawnRef.current = now;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        p.life -= p.decay;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.life * 0.45;

        if (p.glyph === "·") {
          // Small dot particle
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(251, 191, 36, ${p.life * 0.6})`;
          ctx.fill();
        } else {
          // Text glyph (music notes, stars)
          ctx.font = `${p.size}px serif`;
          ctx.fillStyle = `rgba(251, 191, 36, ${p.life * 0.5})`;
          ctx.shadowColor = "rgba(251, 191, 36, 0.3)";
          ctx.shadowBlur = 8;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(p.glyph, 0, 0);
        }
        ctx.restore();
      }

      // Cap particles to prevent memory issues
      if (particles.length > 80) particles.splice(0, particles.length - 80);

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      resizeObserver.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [spawnParticle]);

  useEffect(() => {
    // Generate or retrieve a persistent visitor ID
    let visitorId = localStorage.getItem("pullup_visitor_id");
    if (!visitorId) {
      visitorId = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("pullup_visitor_id", visitorId);
    }
    publicFetch("/t/pageview", {
      method: "POST",
      body: JSON.stringify({
        page: "landing",
        visitorId,
        referrer: document.referrer || null,
        deviceType: window.innerWidth < 768 ? "mobile" : "desktop",
      }),
    }).catch(() => {});
  }, []);

  // Don't auto-redirect logged-in users browsing the landing page casually.
  // But if they JUST signed in from this page, send them to the dashboard.
  // Three signals that we just completed a sign-in:
  //   1. OAuth tokens still in the URL (desktop — Supabase hasn't cleaned yet)
  //   2. OAuth `code=` in query (PKCE flow)
  //   3. Our own `pullup_signin_pending` flag set right before the OAuth
  //      redirect (mobile — Supabase scrubs the hash before React sees it,
  //      so signals 1 and 2 miss; this flag is the reliable path)
  useEffect(() => {
    if (!user) return;
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const pendingFlag = sessionStorage.getItem("pullup_signin_pending") === "1";
    const justCompletedOAuth =
      pendingFlag ||
      hash.includes("access_token") ||
      hash.includes("refresh_token") ||
      search.includes("code=");
    if (justCompletedOAuth) {
      sessionStorage.removeItem("pullup_signin_pending");
      navigate("/events", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ─── auth ─── */
  const handleEmailPasswordSubmit = async (e) => {
    e.preventDefault();
    if (signingIn) return;
    setFormError("");
    if (!authConsent) {
      setFormError("You must agree to the terms and privacy policy.");
      return;
    }
    trackEvent("landing_email_login_submit", { user_logged_in: !!user });
    try {
      setSigningIn(true);
      await signInWithEmailPassword(email.trim(), password);
      authenticatedFetch("/auth/record-consent", { method: "POST" }).catch(
        () => {},
      );
      navigate("/events");
    } catch (error) {
      const msg = (error?.message || "").toLowerCase();
      let friendly = "Something went wrong. Please try again.";
      if (msg.includes("email not confirmed"))
        friendly = "Check your email to confirm your account, then come back.";
      else if (msg.includes("invalid login credentials"))
        friendly = "Incorrect email or password.";
      else if (msg.includes("rate limit"))
        friendly = "Too many attempts. Wait a moment, then try again.";
      else if (msg.includes("already registered"))
        friendly =
          'This email uses another sign-in method. Try "Continue with Google".';
      else if (msg.includes("password")) friendly = error.message;
      setFormError(friendly);
    } finally {
      setSigningIn(false);
    }
  };

  const handleGoogleContinue = async () => {
    if (signingIn) return;
    setFormError("");
    if (!authConsent) {
      setFormError("You must agree to the terms and privacy policy.");
      return;
    }
    trackEvent("landing_google_continue_click", { user_logged_in: !!user });
    if (user) {
      navigate("/events");
      return;
    }
    try {
      setSigningIn(true);
      // Flag picked up by the user-state useEffect when we return signed in,
      // so the dashboard redirect works even if Supabase has already scrubbed
      // the OAuth tokens from the URL (common on mobile Safari).
      sessionStorage.setItem("pullup_signin_pending", "1");
      await signInWithGoogle("/events");
    } catch {
      sessionStorage.removeItem("pullup_signin_pending");
      setFormError("Google sign-in failed. Please try again.");
      setSigningIn(false);
    }
  };

  const GoogleIcon = (
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
    </svg>
  );

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: colors.background,
        color: "#fff",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* ─── Particle canvas ─── */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      <style>{`
        @-webkit-keyframes spinCube {
          from { -webkit-transform: translateZ(-0.625em) rotateX(0deg); transform: translateZ(-0.625em) rotateX(0deg); }
          to { -webkit-transform: translateZ(-0.625em) rotateX(-360deg); transform: translateZ(-0.625em) rotateX(-360deg); }
        }
        @keyframes spinCube {
          from { -webkit-transform: translateZ(-0.625em) rotateX(0deg); transform: translateZ(-0.625em) rotateX(0deg); }
          to { -webkit-transform: translateZ(-0.625em) rotateX(-360deg); transform: translateZ(-0.625em) rotateX(-360deg); }
        }
        @keyframes logo-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .logo-marquee {
          overflow: hidden;
          padding: 14px 0;
          -webkit-mask-image: linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%);
          mask-image: linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%);
        }
        .logo-marquee-track {
          display: flex;
          align-items: center;
          gap: clamp(32px, 6vw, 64px);
          width: max-content;
          animation: logo-marquee 38s linear infinite;
        }
        .logo-marquee-item {
          flex: none;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.75;
          transition: opacity 0.2s;
        }
        .logo-marquee-item:hover {
          opacity: 1;
        }
        .logo-marquee-item img {
          height: 100%;
          width: auto;
          display: block;
        }
        .logo-marquee-item img.invert {
          filter: brightness(0) invert(1);
        }
        .logo-marquee-item .logo-text {
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.22em;
          white-space: nowrap;
        }
      `}</style>
      {/* ─── NAV ─── */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          padding: "0 clamp(16px, 4vw, 40px)",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: scrolled ? "rgba(5,4,10,0.92)" : "transparent",
          backdropFilter: scrolled ? "blur(16px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "none",
          transition: "background 0.3s",
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            cursor: "pointer",
          }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <span style={{ color: "#fff" }}>pull</span>
          <span
            style={{
              background: colors.gradientPrimary,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            up
          </span>
        </div>
        <button
          onClick={handleSignupClick}
          style={{
            padding: "8px 22px",
            borderRadius: "999px",
            border: "1px solid rgba(251,191,36,0.3)",
            background: "rgba(251,191,36,0.08)",
            color: colors.gold,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            backdropFilter: "blur(8px)",
            transition: "all 0.2s",
            boxShadow: "0 0 12px rgba(251,191,36,0.08)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(251,191,36,0.15)";
            e.currentTarget.style.borderColor = "rgba(251,191,36,0.5)";
            e.currentTarget.style.boxShadow =
              "0 0 24px rgba(251,191,36,0.2), 0 0 48px rgba(251,191,36,0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(251,191,36,0.08)";
            e.currentTarget.style.borderColor = "rgba(251,191,36,0.3)";
            e.currentTarget.style.boxShadow = "0 0 12px rgba(251,191,36,0.08)";
          }}
        >
          Log in
        </button>
      </nav>

      {/* ─── HERO ─── */}
      <section
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "72px clamp(20px, 5vw, 40px) 24px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "15%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(700px, 90vw)",
            height: 400,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(251,191,36,0.06) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 800,
            width: "100%",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 14px",
              borderRadius: "999px",
              background: "rgba(251,191,36,0.06)",
              border: "1px solid rgba(251,191,36,0.15)",
              fontSize: 12,
              color: "rgba(255,230,160,0.7)",
              marginBottom: 24,
            }}
          >
            <Sparkles size={13} style={{ color: colors.gold }} />
            More events. More culture.
          </div>

          <h1
            style={{
              fontSize: "clamp(42px, 10vw, 80px)",
              fontWeight: 800,
              lineHeight: 1.05,
              marginBottom: 20,
              letterSpacing: "-0.03em",
            }}
          >
            Pullup for{" "}
            <span
              style={{
                display: "inline-block",
                WebkitPerspective: "400px",
                perspective: "400px",
                verticalAlign: "middle",
                height: "1.25em",
                position: "relative",
                top: "-0.08em",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  height: "1.25em",
                  position: "relative",
                  WebkitTransformStyle: "preserve-3d",
                  transformStyle: "preserve-3d",
                  WebkitAnimation: "spinCube 10s linear infinite",
                  animation: "spinCube 10s linear infinite",
                  willChange: "transform",
                }}
              >
                {ROTATING_WORDS.map((word, i) => {
                  const faceTransform =
                    i === 0
                      ? "rotateY(0deg) translateZ(0.625em)"
                      : i === 1
                        ? "rotateX(90deg) translateZ(0.625em)"
                        : i === 2
                          ? "rotateX(180deg) translateZ(0.625em)"
                          : "rotateX(-90deg) translateZ(0.625em)";
                  return (
                    <span
                      key={word}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: i === 0 ? "relative" : "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "1.25em",
                        boxSizing: "border-box",
                        WebkitBackfaceVisibility: "hidden",
                        backfaceVisibility: "hidden",
                        background:
                          "linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(/camo.png) center/cover",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "0.12em",
                        padding: "0 0.35em",
                        boxShadow:
                          "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -2px 4px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.5)",
                        WebkitTransform: faceTransform,
                        transform: faceTransform,
                      }}
                    >
                      <span
                        style={{
                          background: colors.gradientPrimary,
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                        }}
                      >
                        {word}
                      </span>
                    </span>
                  );
                })}
              </span>
            </span>
          </h1>

          <p
            style={{
              fontSize: "clamp(15px, 3vw, 19px)",
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.65)",
              maxWidth: 480,
              margin: "0 auto 32px",
            }}
          >
            For the people who make{" "}
            <span
              style={{
                background: colors.gradientGold,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              cities worth living in
            </span>{" "}
          </p>

          <button
            onClick={handleSignupClick}
            style={{
              padding: "14px 36px",
              borderRadius: "999px",
              border: "none",
              background: colors.gradientPrimary,
              color: "#111",
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 8px 32px rgba(192,192,192,0.18)",
              transition: "box-shadow 0.3s, transform 0.3s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow =
                "0 8px 32px rgba(192,192,192,0.18), 0 0 28px rgba(251,191,36,0.25), 0 0 56px rgba(251,191,36,0.1)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow =
                "0 8px 32px rgba(192,192,192,0.18)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            Create your account <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* ─── TRUST LOGOS MARQUEE ─── */}
      <div className="logo-marquee" style={{ position: "relative", zIndex: 2 }}>
        <div className="logo-marquee-track">
          {[...LOGOS, ...LOGOS].map((logo, i) => (
            <div className="logo-marquee-item" key={i}>
              {logo.type === "image" ? (
                <img
                  src={logo.src}
                  alt={logo.alt}
                  className={logo.invert ? "invert" : undefined}
                />
              ) : (
                <span className="logo-text">{logo.label}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ─── FOOTER ─── */}
      <footer
        style={{
          position: "relative",
          zIndex: 2,
          padding: "10px 16px calc(10px + env(safe-area-inset-bottom))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "clamp(10px, 3vw, 20px)",
          flexWrap: "wrap",
          fontSize: 11,
          color: "rgba(255,255,255,0.25)",
        }}
      >
        <span>pullup &copy; {new Date().getFullYear()}</span>
        <span style={{ opacity: 0.4 }}>&middot;</span>
        <a href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>Privacy</a>
        <a href="/terms" style={{ color: "inherit", textDecoration: "none" }}>Terms</a>
        <a href="/cookies" style={{ color: "inherit", textDecoration: "none" }}>Cookies</a>
        <span style={{ opacity: 0.4 }}>&middot;</span>
        <a href="mailto:hello@pullup.se" style={{ color: "inherit", textDecoration: "none" }}>hello@pullup.se</a>
      </footer>

      {/* ─── AUTH MODAL ─── */}
      {showAuth && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(8px)",
            padding: 20,
          }}
          onClick={() => setShowAuth(false)}
        >
          <div
            style={{
              maxWidth: 380,
              width: "100%",
              borderRadius: 24,
              background:
                "linear-gradient(145deg, rgba(11,10,20,0.98), rgba(17,15,30,0.99))",
              boxShadow:
                "0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)",
              padding: "clamp(24px, 4vw, 36px)",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowAuth(false)}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.5)",
                cursor: "pointer",
                padding: 4,
              }}
            >
              <X size={20} />
            </button>

            <h2
              style={{
                fontSize: 22,
                fontWeight: 800,
                marginBottom: 4,
                textAlign: "center",
              }}
            >
              Enter{" "}
              <span
                style={{
                  background: colors.gradientGold,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                pullup
              </span>
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.5)",
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              Sign in or create your account
            </p>

            <form
              onSubmit={handleEmailPasswordSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}
                  htmlFor="auth-email"
                >
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}
                  htmlFor="auth-password"
                >
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  style={inputStyle}
                />
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.45)",
                  cursor: "pointer",
                  marginTop: 2,
                  minHeight: 44,
                }}
              >
                <input
                  type="checkbox"
                  checked={authConsent}
                  onChange={(e) => setAuthConsent(e.target.checked)}
                  style={{
                    accentColor: "#fbbf24",
                    flexShrink: 0,
                    width: 18,
                    height: 18,
                  }}
                />
                <span>
                  I agree to the{" "}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      color: "rgba(255,255,255,0.65)",
                      textDecoration: "underline",
                    }}
                  >
                    terms
                  </a>{" "}
                  and{" "}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      color: "rgba(255,255,255,0.65)",
                      textDecoration: "underline",
                    }}
                  >
                    privacy policy
                  </a>
                </span>
              </label>
              <button
                type="submit"
                disabled={signingIn}
                style={{
                  width: "100%",
                  padding: "14px 0",
                  borderRadius: "999px",
                  border: "none",
                  background: colors.gradientGold,
                  color: "#111",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: signingIn ? "wait" : "pointer",
                  opacity: signingIn ? 0.7 : 1,
                  marginTop: 4,
                }}
              >
                {signingIn ? "Entering..." : "Enter pullup"}
              </button>
              {formError && (
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(255,119,119,0.95)",
                    textAlign: "center",
                  }}
                >
                  {formError}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  margin: "4px 0",
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
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.16em",
                    color: "rgba(255,255,255,0.35)",
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
                  background: "#fff",
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  cursor: signingIn ? "wait" : "pointer",
                  color: "#3c4043",
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                {GoogleIcon}
                <span>Continue with Google</span>
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
