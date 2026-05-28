import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { publicFetch } from "../lib/api.js";
import { trackEvent, getVisitorId } from "../lib/analytics.js";

// 3D cube of words spinning on its X axis behind the gazing star.
// One word faces the camera at a time. The cube rotateX(0 → -360deg) over
// CUBE_PERIOD seconds; each face is placed at translateZ(depth) on its own
// fixed rotateX so the front-face sequence is: people → life → art → culture.
const CUBE_PERIOD = 10; // seconds — matches the old cube tempo
// `fadeDelay` is the negative animation-delay (in seconds) that makes each
// face's opacity fade-keyframe peak exactly when that face is forward-facing.
// Formula: delay = period * (faceAngle - 360) / 360, mod period.
const CUBE_WORDS = [
  { word: "people",  faceAngle: 0,   fadeDelay: 0    }, // front at t=0
  { word: "life",    faceAngle: 90,  fadeDelay: -7.5 }, // front at t=2.5s
  { word: "art",     faceAngle: 180, fadeDelay: -5   }, // front at t=5s
  { word: "culture", faceAngle: -90, fadeDelay: -2.5 }, // front at t=7.5s
];

const LOGOS = [
  // `invert: true` for dark-on-transparent logos that need to flip to white on the dark banner.
  // Colour logos (Cliff Barnes orange) and already-white logos (Zoda) render untouched.
  { type: "image", src: "/landing/logos/soho-house.png", alt: "Soho House", invert: true, width: 280, height: 179 },
  { type: "image", src: "/landing/logos/doberman.png", alt: "EY Doberman", invert: true, width: 705, height: 139 },
  { type: "image", src: "/landing/logos/cliff-barnes.svg", alt: "Cliff Barnes Bränneri", width: 408, height: 176 },
  { type: "image", src: "/landing/logos/aperol.png", alt: "Aperol", width: 1280, height: 618 },
  { type: "image", src: "/zoda_logotype_white.webp", alt: "Zoda", width: 1600, height: 541 },
  { type: "image", src: "/landing/logos/showlighters.png", alt: "Showlighters", width: 3830, height: 2267 },
  { type: "image", src: "/landing/logos/hendricks-gin.png", alt: "Hendrick's Gin", invert: true, width: 160, height: 160, boost: 1.7 },
  { type: "image", src: "/landing/logos/jagermeister.png", alt: "Jägermeister", invert: true, width: 160, height: 160, boost: 1.7 },
];

const PINK = "#EC178F";
const INK = "#0a0a0a";
const INK_MUTED = "rgba(10,10,10,0.62)";
const INK_FAINT = "rgba(10,10,10,0.35)";
const SURFACE = "#ffffff";

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

/* ─── component ─── */
export function LandingPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const redirectedRef = useRef(false);

  const handleNavCta = () => {
    trackEvent("cta_click", { location: "nav", user_logged_in: !!user });
    navigate(user ? "/events" : "/login");
  };

  const [scrolled, setScrolled] = useState(false);
  // Mouse-spotlight tracker runs on the whole page container so the
  // pink-eye reveal + glow follow the cursor above AND below the dark
  // logo banner. The banner stays opaque so it naturally masks the
  // effect within its own bounds.
  const pageRef = useRef(null);

  useEffect(() => {
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

  // Auto-redirect signed-in users to dashboard, with a sessionStorage
  // circuit-breaker so a background 401 bouncing us back to "/" doesn't
  // ping-pong with /events.
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (redirectedRef.current) return;

    const LAST_KEY = "pullup_landing_redirected_at";
    const lastAt = Number(sessionStorage.getItem(LAST_KEY)) || 0;
    if (Date.now() - lastAt < 4000) return;

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

  // Cursor "flashlight" over the eye grid. Update CSS custom props directly
  // to avoid re-rendering React on every mousemove.
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    let raf = 0;
    let pending = null;
    const apply = () => {
      raf = 0;
      if (!pending) return;
      const { x, y, vx, vy } = pending;
      // Wrap-local coords drive the in-flow spotlight layers (eye-pink-wrap,
      // cursor-glow), which are position:absolute inside the wrap.
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
      // Viewport coords drive the big-eye cursor, which is position:fixed
      // so it floats above everything (including the fixed nav).
      el.style.setProperty("--bx", `${vx}px`);
      el.style.setProperty("--by", `${vy}px`);
      pending = null;
    };
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      pending = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        vx: e.clientX,
        vy: e.clientY,
      };
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onEnter = () => el.style.setProperty("--mouse-active", "1");
    const onLeave = () => el.style.setProperty("--mouse-active", "0");
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={pageRef}
      className="page-eyes-wrap"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: SURFACE,
        color: INK,
        position: "relative",
      }}
    >
      <style>{`
        /* ─── 3D word cube spinning behind the gazing star ─── */
        /* translateX shifts the rotation axis right so the front-facing
           word sits along the gaze tail. Y-shift is 0 here because the
           star itself is shifted DOWN inside the wrap so its gaze line
           already lines up with the wrap's vertical center (and with
           "for"/"pullup" in the flex row). */
        @keyframes cube-spin {
          from { transform: translateX(60px) rotateX(0deg);    }
          to   { transform: translateX(60px) rotateX(-360deg); }
        }
        .hero-row {
          display: flex;
          align-items: center;
          justify-content: center;
          /* Normal word-spacing between "pullup" and "for". */
          gap: clamp(8px, 1.5vmin, 18px);
        }
        .hero-pullup-logo {
          /* SVG was re-viewBoxed to crop the original whitespace, so the
             rendered height equals the visible cap-height directly. */
          height: clamp(36px, 7vmin, 70px);
          width: auto;
          display: block;
          flex: none;
        }
        .hero-for {
          font-size: clamp(36px, 7vmin, 70px);
          font-weight: 800;
          letter-spacing: -0.035em;
          line-height: 1;
          color: ${INK};
          flex: none;
          /* Lift above the cube-wrap's 3D context so the star can't
             overlap "for" when the negative margin pulls them together. */
          position: relative;
          z-index: 10;
        }
        .cube-wrap {
          position: relative;
          width: clamp(220px, 40vmin, 360px);
          height: clamp(220px, 40vmin, 360px);
          flex: none;
          /* Aggressively pull the cube-wrap leftward so the star body
             sits directly after "for" — the wrap has tons of empty space
             on its left side before the centered star image. */
          margin-left: clamp(-120px, -20vmin, -70px);
        }
        .cube-stage {
          position: absolute;
          inset: 0;
          perspective: 900px;
          transform-style: preserve-3d;
        }
        .word-cube {
          --depth: clamp(16px, 3vmin, 28px);
          position: absolute;
          inset: 0;
          transform-style: preserve-3d;
          animation: cube-spin ${CUBE_PERIOD}s linear infinite;
          will-change: transform;
        }
        .cube-face {
          position: absolute;
          top: 50%;
          left: 50%;
          font-size: clamp(36px, 7vmin, 70px);
          font-weight: 800;
          letter-spacing: -0.035em;
          line-height: 1;
          color: ${INK};
          white-space: nowrap;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          transform:
            translate(-50%, -50%)
            rotateX(var(--face-angle))
            translateZ(var(--depth));
        }
        .star-3d {
          position: absolute;
          top: 50%;
          left: 50%;
          width: clamp(150px, 30vmin, 260px);
          height: auto;
          /* Shift DOWN so the star's gaze line (in its upper half) lands
             on the wrap's vertical center — that's the line where "for"
             and the spinning word sit. translateZ(0) keeps the star at
             z=0 in 3D so the front-facing word renders in front of it. */
          transform: translate(-50%, calc(-50% + 20px)) translateZ(0);
          pointer-events: none;
          user-select: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .word-cube { animation: none; }
        }
        @keyframes logo-marquee {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }
        .logo-marquee {
          /* position:relative joins the positioned-paint pass so the
             page-wide eye-base layer (absolute, z:auto) renders BEHIND
             the banner instead of on top of it. */
          position: relative;
          overflow: hidden;
          padding: 0;
          background: #05040a;
          line-height: 0;
          /* Gap below needs to exceed one eye-tile (~32px) so the
             page-level eye-base reliably shows rows of eyes
             between banner and footer — otherwise the centered-tile
             pattern can land entirely in whitespace. */
          margin-bottom: 80px;
          /* 'top' shifts the banner down visually without changing layout
             (the section above is flex:1 so a margin-top would just be
             absorbed). The banner stays opaque dark, so it cleanly covers
             the eye-base layer underneath. */
          top: 32px;
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
          height: 32px;
          display: block;
          opacity: 0.75;
          transition: opacity 0.2s;
        }
        .logo-marquee-item:hover { opacity: 1; }
        .logo-marquee-item img {
          height: 100%;
          width: auto;
          display: block;
        }
        .logo-marquee-item img.invert {
          filter: brightness(0) invert(1);
        }

        /* ─── Eye-grid hover spotlight ─── */
        .page-eyes-wrap {
          --mx: 50%;
          --my: 50%;
          --mouse-active: 0;
        }
        .eye-layer {
          position: absolute;
          inset: 0;
          pointer-events: none;
          -webkit-mask-image: url(/pullup-smalleyes.svg);
          mask-image: url(/pullup-smalleyes.svg);
          -webkit-mask-repeat: repeat;
          mask-repeat: repeat;
          -webkit-mask-size: 32px auto;
          mask-size: 32px auto;
          -webkit-mask-position: center;
          mask-position: center;
        }
        .eye-base {
          background: ${INK};
          opacity: 0.05;
          z-index: 0;
        }
        .eye-pink-wrap {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          -webkit-mask-image: radial-gradient(circle 150px at var(--mx) var(--my), #000 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.18) 75%, transparent 100%);
          mask-image: radial-gradient(circle 150px at var(--mx) var(--my), #000 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.18) 75%, transparent 100%);
          opacity: var(--mouse-active);
          transition: opacity 0.35s ease;
        }
        .eye-pink {
          background: ${PINK};
        }
        .cursor-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 2;
          background: radial-gradient(circle 190px at var(--mx) var(--my), rgba(236,23,143,0.08) 0%, rgba(236,23,143,0.035) 45%, transparent 100%);
          opacity: var(--mouse-active);
          transition: opacity 0.35s ease;
        }
        /* Register --mouse-active so calc() can treat it as a number
           (without @property an unregistered var() inside calc() falls
           back to invalid and the scale wouldn't animate). */
        @property --mouse-active {
          syntax: "<number>";
          initial-value: 0;
          inherits: true;
        }
        /* Big-eye IS the cursor: position:fixed so it floats above
           everything (including the fixed nav), --bx/--by track the
           cursor's viewport coords directly. Hide the native cursor on
           the whole landing page and all descendants so the eye is the
           only pointer the visitor sees. */
        .page-eyes-wrap,
        .page-eyes-wrap * {
          cursor: none;
        }
        .big-eye-focus {
          position: fixed;
          top: -30px;
          left: -30px;
          width: 60px;
          height: 60px;
          translate: var(--bx, 50%) var(--by, 50%);
          pointer-events: none;
          z-index: 9999;
          opacity: var(--mouse-active);
          transition:
            opacity 0.35s ease,
            translate 0.08s cubic-bezier(0.2, 0, 0.2, 1);
          will-change: translate, opacity;
        }
        .big-eye-focus::before {
          content: "";
          position: absolute;
          inset: 0;
          background: ${PINK};
          -webkit-mask-image: url(/pullup-bigeyes.svg);
          mask-image: url(/pullup-bigeyes.svg);
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-size: contain;
          mask-size: contain;
          -webkit-mask-position: center;
          mask-position: center;
          transform-origin: center center;
          transform: scale(calc(0.55 + 0.45 * var(--mouse-active)));
          transition: transform 0.25s cubic-bezier(0.2, 0, 0.2, 1);
        }
      `}</style>

      {/* Page-wide eye pattern + mouse-spotlight layers. All three span the
          full page container so the cursor-following pink reveal + glow work
          above AND below the dark logo banner. The banner's dark fill covers
          these layers where it sits; the footer covers them with white. */}
      <div className="eye-layer eye-base" aria-hidden="true" />
      <div className="eye-pink-wrap" aria-hidden="true">
        <div className="eye-layer eye-pink" />
      </div>
      <div className="cursor-glow" aria-hidden="true" />
      <div className="big-eye-focus" aria-hidden="true" />

      {/* ─── NAV ─── */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          padding: "0 clamp(16px, 4vw, 40px) 0 clamp(12px, 2vw, 24px)",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: scrolled ? "rgba(255,255,255,0.92)" : "transparent",
          backdropFilter: scrolled ? "blur(16px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(16px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(10,10,10,0.06)" : "none",
          transition: "background 0.3s, border-color 0.3s",
        }}
      >
        <div
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{ cursor: "pointer", display: "flex", alignItems: "center" }}
        >
          <img
            src="/pullup-logo.svg"
            alt="PullUp"
            style={{ height: 44, width: "auto", display: "block" }}
          />
        </div>
        <button
          onClick={handleNavCta}
          style={{
            padding: "8px 22px",
            borderRadius: "999px",
            border: `1px solid ${PINK}`,
            background: "transparent",
            color: PINK,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = PINK;
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = PINK;
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
          padding: "120px clamp(20px, 5vw, 40px) 48px",
          position: "relative",
        }}
      >
        <div style={{ maxWidth: 820, width: "100%", position: "relative", zIndex: 3 }}>
          <h1
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0,0,0,0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
          >
            Pullup for people, culture, art, and life.
          </h1>

          <Reveal delay={0.05}>
            <div className="hero-row" aria-hidden="true">
              <img
                src="/pullup-textlogo.svg"
                alt=""
                className="hero-pullup-logo"
              />
              <span className="hero-for">for</span>
              <div className="cube-wrap">
                <div className="cube-stage">
                  <div className="word-cube">
                    {CUBE_WORDS.map((w) => (
                      <span
                        key={w.word}
                        className="cube-face"
                        style={{ "--face-angle": `${w.faceAngle}deg` }}
                      >
                        {w.word}
                      </span>
                    ))}
                  </div>
                  <img
                    src="/pullup-logo.svg"
                    alt=""
                    className="star-3d"
                  />
                </div>
              </div>
            </div>
          </Reveal>

        </div>
      </section>

      {/* ─── TRUST LOGOS MARQUEE (dark banner) ─── */}
      <div className="logo-marquee">
        <div className="logo-marquee-track">
          {[...LOGOS, ...LOGOS].map((logo, i) => (
            <div
              className="logo-marquee-item"
              key={i}
            >
              <img
                src={logo.src}
                alt={logo.alt}
                width={logo.width}
                height={logo.height}
                decoding="async"
                loading="eager"
                className={logo.invert ? "invert" : undefined}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ─── FOOTER ─── */}
      <footer
        style={{
          position: "relative",
          padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "clamp(10px, 3vw, 20px)",
          flexWrap: "wrap",
          fontSize: 11,
          color: INK_FAINT,
          background: SURFACE,
          borderTop: "1px solid rgba(10,10,10,0.06)",
        }}
      >
        <span>pullup &copy; {new Date().getFullYear()}</span>
        <span style={{ opacity: 0.5 }}>&middot;</span>
        <a href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>Privacy</a>
        <a href="/terms" style={{ color: "inherit", textDecoration: "none" }}>Terms</a>
        <a href="/cookies" style={{ color: "inherit", textDecoration: "none" }}>Cookies</a>
        <span style={{ opacity: 0.5 }}>&middot;</span>
        <a href="mailto:hello@pullup.se" style={{ color: "inherit", textDecoration: "none" }}>hello@pullup.se</a>
      </footer>
    </div>
  );
}
