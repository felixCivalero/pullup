import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors.js";
import { publicFetch } from "../lib/api.js";
import { trackEvent, getVisitorId } from "../lib/analytics.js";
import { ParticleField } from "../components/ParticleField";

const ROTATING_WORDS = ["people", "life", "culture", "art"];

const LOGOS = [
  // `invert: true` for dark-on-transparent logos that need to flip to white on the dark bg.
  // Colour logos (Cliff Barnes orange) and already-white logos (Zoda) render untouched.
  // `width`/`height` are intrinsic dimensions — set so the browser reserves the right
  // aspect-ratio slot before the image loads, keeping the marquee track width stable.
  { type: "image", src: "/landing/logos/soho-house.png", alt: "Soho House", invert: true, width: 280, height: 179 },
  { type: "image", src: "/landing/logos/doberman.png", alt: "EY Doberman", invert: true, width: 705, height: 139 },
  { type: "image", src: "/landing/logos/cliff-barnes.svg", alt: "Cliff Barnes Bränneri", width: 408, height: 176 },
  { type: "image", src: "/landing/logos/aperol.png", alt: "Aperol", width: 1280, height: 618 },
  { type: "image", src: "/zoda_logotype_white.webp", alt: "Zoda", width: 1600, height: 541 },
  { type: "image", src: "/landing/logos/showlighters.png", alt: "Showlighters", width: 3830, height: 2267 },
  // Square logos get a `boost` so they don't read as tiny next to the wide wordmarks.
  { type: "image", src: "/landing/logos/hendricks-gin.png", alt: "Hendrick's Gin", invert: true, width: 160, height: 160, boost: 1.7 },
  { type: "image", src: "/landing/logos/jagermeister.png", alt: "Jägermeister", invert: true, width: 160, height: 160, boost: 1.7 },
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
  const { user, loading } = useAuth();
  // Ensure the auto-redirect to /events fires at most once per mount,
  // even if the user object reference churns. Without this, a transient
  // auth-state flap can ping-pong us between / and /events.
  const redirectedRef = useRef(false);

  // Hero CTA goes to onboarding for new users; existing users skip ahead
  // to the dashboard. Nav CTA always goes to /login (returning users).
  const handleHeroCta = () => {
    trackEvent("cta_click", { location: "hero", user_logged_in: !!user });
    navigate(user ? "/events" : "/start");
  };
  const handleNavCta = () => {
    trackEvent("cta_click", { location: "nav", user_logged_in: !!user });
    navigate(user ? "/events" : "/login");
  };

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Generate or retrieve a persistent visitor ID
    const visitorId = getVisitorId();
    if (!visitorId) return;
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

  // Logged-in users skip the marketing landing page entirely and go straight
  // to their dashboard. Gate on `loading` so we don't fire during auth
  // hydration, and use a timestamp circuit-breaker so that if anything in
  // the app sends us back to "/" within a few seconds (e.g. a 401 from a
  // background call) we don't immediately re-redirect and create a loop.
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (redirectedRef.current) return;

    const LAST_KEY = "pullup_landing_redirected_at";
    const lastAt = Number(sessionStorage.getItem(LAST_KEY)) || 0;
    if (Date.now() - lastAt < 4000) {
      // Just came back from /events very recently — break the loop and let
      // the user see the landing page.
      return;
    }

    redirectedRef.current = true;
    sessionStorage.setItem(LAST_KEY, String(Date.now()));

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
      trackEvent("signed_in", { via: pendingFlag ? "google" : "auto" });
    }
    navigate("/events", { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
      <ParticleField zIndex={1} />
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
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
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
          gap: 48px;
          width: max-content;
          animation: logo-marquee 22s linear infinite;
          will-change: transform;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          transform: translate3d(0, 0, 0);
        }
        @media (min-width: 768px) {
          .logo-marquee-track { gap: 64px; }
        }
        .logo-marquee-item {
          flex: none;
          height: 28px;
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
          onClick={handleNavCta}
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
            onClick={handleHeroCta}
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
            <div
              className="logo-marquee-item"
              key={i}
              style={logo.boost ? { height: `${28 * logo.boost}px` } : undefined}
            >
              {logo.type === "image" ? (
                <img
                  src={logo.src}
                  alt={logo.alt}
                  width={logo.width}
                  height={logo.height}
                  decoding="async"
                  loading="eager"
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


    </div>
  );
}
