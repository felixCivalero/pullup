import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  Calendar,
  Users,
  Mail,
  BarChart3,
  Ticket,
  UtensilsCrossed,
  Crown,
  UserPlus,
  CheckCircle,
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

const INTEREST_OPTIONS = [
  { id: "music", label: "Music" },
  { id: "club", label: "Club & nightlife" },
  { id: "exhibition", label: "Exhibitions" },
  { id: "culture", label: "Culture" },
  { id: "theatre", label: "Theatre" },
  { id: "arts", label: "Arts" },
];

const FEATURES = [
  { icon: Calendar, title: "Event pages", desc: "Your event deserves more than a group chat. Create a real page in seconds." },
  { icon: Ticket, title: "RSVP & tickets", desc: "Free or paid. Capacity limits, waitlists, guest lists — handled." },
  { icon: UtensilsCrossed, title: "Dinner seatings", desc: "Drag-and-drop seating for intimate dinners and gatherings." },
  { icon: Users, title: "Guest CRM", desc: "Know your people. Track who shows up, build real community." },
  { icon: Mail, title: "Email marketing", desc: "Send invites and newsletters. Track opens and clicks." },
  { icon: BarChart3, title: "Analytics", desc: "See what's working. RSVPs, attendance, growth — all in one view." },
  { icon: Crown, title: "VIP invites", desc: "Private, token-gated invitations for your inner circle." },
  { icon: UserPlus, title: "Co-hosts", desc: "Run events with your crew. Shared access, shared vision." },
];

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

/* ─── component ─── */
export function LandingPage() {
  const navigate = useNavigate();
  const { signInWithGoogle, signInWithEmailPassword, user } = useAuth();

  const [showAuth, setShowAuth] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");

  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState(null);
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [newsletterPopup, setNewsletterPopup] = useState(null);

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    publicFetch("/t/pageview", {
      method: "POST",
      body: JSON.stringify({ page: "landing" }),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) navigate("/events", { replace: true });
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
    trackEvent("landing_email_login_submit", { user_logged_in: !!user });
    try {
      setSigningIn(true);
      await signInWithEmailPassword(email.trim(), password);
      navigate("/events");
    } catch (error) {
      const msg = (error?.message || "").toLowerCase();
      let friendly = "Something went wrong. Please try again.";
      if (msg.includes("email not confirmed")) friendly = "Check your email to confirm your account, then come back.";
      else if (msg.includes("invalid login credentials")) friendly = "Incorrect email or password.";
      else if (msg.includes("rate limit")) friendly = "Too many attempts. Wait a moment, then try again.";
      else if (msg.includes("already registered")) friendly = 'This email uses another sign-in method. Try "Continue with Google".';
      else if (msg.includes("password")) friendly = error.message;
      setFormError(friendly);
    } finally {
      setSigningIn(false);
    }
  };

  const handleGoogleContinue = async () => {
    if (signingIn) return;
    trackEvent("landing_google_continue_click", { user_logged_in: !!user });
    if (user) { navigate("/events"); return; }
    try {
      setSigningIn(true);
      await signInWithGoogle("/events");
    } catch {
      setFormError("Google sign-in failed. Please try again.");
      setSigningIn(false);
    }
  };

  /* ─── newsletter ─── */
  const handleNewsletterSubmit = async (e) => {
    e.preventDefault();
    if (!newsletterEmail || newsletterSubmitting) return;
    setNewsletterStatus(null);
    setNewsletterPopup(null);
    trackEvent("landing_newsletter_submit", { email_present: !!newsletterEmail, interests: selectedInterests });
    try {
      setNewsletterSubmitting(true);
      const response = await authenticatedFetch("/newsletter", {
        method: "POST",
        body: JSON.stringify({ email: newsletterEmail.trim(), source: "landing_newsletter", interests: selectedInterests }),
      });
      let payload = null;
      try { payload = await response.json(); } catch { payload = null; }
      if (!response.ok) {
        const code = String(payload?.code || "").toLowerCase();
        let message = "Couldn't sign you up. Try again soon.";
        if (code === "invalid_email") message = "Enter a valid email address.";
        else if (code === "rate_limited") message = "Too many attempts. Wait a moment.";
        else if (code === "suppressed") message = "We can't subscribe this address right now.";
        setNewsletterStatus(message);
        setNewsletterPopup({ type: "error", title: "Couldn't sign you up", message });
        return;
      }
      const status = payload?.status || "subscribed";
      let message = "You're in. Watch your inbox.";
      let title = "Subscribed";
      if (status === "already_subscribed") { title = "Already subscribed"; message = "You're already in."; }
      else if (status === "resubscribed") { title = "Welcome back"; message = "Welcome back. Invites incoming."; }
      setNewsletterStatus(message);
      setNewsletterPopup({ type: "success", title, message });
      setNewsletterEmail("");
      setSelectedInterests([]);
    } catch {
      const message = "Couldn't sign you up. Try again soon.";
      setNewsletterStatus(message);
      setNewsletterPopup({ type: "error", title: "Couldn't sign you up", message });
    } finally {
      setNewsletterSubmitting(false);
    }
  };

  const toggleInterest = (id) => {
    setSelectedInterests((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const GoogleIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ width: 18, height: 18, display: "block" }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.61l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.4 5.38 2.56 13.22l7.98 6.2C12.48 13.02 17.74 9.5 24 9.5z" />
      <path fill="#34A853" d="M46.98 24.55c0-1.64-.15-3.21-.43-4.74H24v9.02h12.94c-.56 2.9-2.26 5.36-4.82 7.02l7.66 5.94C44.54 37.89 46.98 31.76 46.98 24.55z" />
      <path fill="#4A90E2" d="M10.54 28.42a10.5 10.5 0 0 1-.55-3.17c0-1.1.2-2.16.55-3.17l-7.98-6.2A23.86 23.86 0 0 0 0 25.25c0 3.8.9 7.39 2.56 10.62l7.98-6.2z" />
      <path fill="#FBBC05" d="M24 47.5c6.48 0 11.93-2.13 15.9-5.79l-7.66-5.94C30.62 37.48 27.61 38.5 24 38.5c-6.26 0-11.52-3.52-13.46-8.92l-7.98 6.2C6.4 42.62 14.62 47.5 24 47.5z" />
    </svg>
  );

  const sp = { padding: "clamp(40px, 6vh, 72px) clamp(16px, 5vw, 40px)", maxWidth: 1100, margin: "0 auto", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ minHeight: "100vh", background: colors.background, color: "#fff", overflowX: "hidden" }}>

      {/* ─── NAV ─── */}
      <nav
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
          padding: "0 clamp(16px, 4vw, 40px)", height: 56,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: scrolled ? "rgba(5,4,10,0.92)" : "transparent",
          backdropFilter: scrolled ? "blur(16px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "none",
          transition: "background 0.3s",
        }}
      >
        <div
          style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", cursor: "pointer" }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <span style={{ color: "#fff" }}>pull</span>
          <span style={{ background: colors.gradientPrimary, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>up</span>
        </div>
        <button
          onClick={() => setShowAuth(true)}
          style={{
            padding: "8px 22px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 14, fontWeight: 600,
            cursor: "pointer", backdropFilter: "blur(8px)",
          }}
        >
          Log in
        </button>
      </nav>

      {/* ─── HERO ─── */}
      <section
        style={{
          height: "calc(100dvh - 80px)", maxHeight: 720, minHeight: 400,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", textAlign: "center",
          padding: "72px clamp(20px, 5vw, 40px) 48px", position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute", top: "15%", left: "50%", transform: "translateX(-50%)",
            width: "min(700px, 90vw)", height: 400, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(192,192,192,0.07) 0%, transparent 70%)", pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 640 }}>
          <div
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "5px 14px", borderRadius: "999px",
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 24,
            }}
          >
            <Sparkles size={13} style={{ color: colors.silver }} />
            More events. More culture.
          </div>

          <h1 style={{ fontSize: "clamp(42px, 10vw, 80px)", fontWeight: 800, lineHeight: 1.05, marginBottom: 20, letterSpacing: "-0.03em" }}>
            Make 'em{" "}
            <span style={{ background: colors.gradientPrimary, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              pull up
            </span>
          </h1>

          <p style={{ fontSize: "clamp(15px, 3vw, 19px)", lineHeight: 1.55, color: "rgba(255,255,255,0.65)", maxWidth: 480, margin: "0 auto 32px" }}>
            The free event platform built for the cultural underground.
            For the creators, curators, and hosts who make cities worth living in.
          </p>

          <button
            onClick={() => setShowAuth(true)}
            style={{
              padding: "14px 36px", borderRadius: "999px", border: "none",
              background: colors.gradientPrimary, color: "#111", fontSize: 16, fontWeight: 700,
              cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
              boxShadow: "0 8px 32px rgba(192,192,192,0.18)",
            }}
          >
            Start hosting <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" style={sp}>
        <h2 style={{ fontSize: "clamp(26px, 5vw, 40px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 12, textAlign: "center" }}>
          Pro tools,{" "}
          <span style={{ background: colors.gradientPrimary, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>zero budget</span>{" "}required
        </h2>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", textAlign: "center", maxWidth: 440, margin: "0 auto clamp(28px, 4vh, 48px)" }}>
          You shouldn't need a marketing team to throw a great event. Everything you need, nothing you don't.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: "clamp(12px, 2vw, 20px)" }}>
          {FEATURES.map((f, i) => (
            <div
              key={i}
              style={{
                padding: "clamp(20px, 2.5vw, 28px)", borderRadius: 16,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                transition: "border-color 0.2s, background 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
            >
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(192,192,192,0.08)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <f.icon size={20} style={{ color: colors.silverLight }} />
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{f.title}</h3>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: "rgba(255,255,255,0.5)", margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section style={{ ...sp, textAlign: "center", paddingBottom: "clamp(48px, 8vh, 80px)" }}>
        <h2 style={{ fontSize: "clamp(24px, 5vw, 38px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 12 }}>
          Your city needs more{" "}
          <span style={{ background: colors.gradientPrimary, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>culture</span>
        </h2>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", maxWidth: 400, margin: "0 auto 24px" }}>
          We keep PullUp free because we believe the next wave of culture comes from independent hosts like you.
        </p>
        <button
          onClick={() => setShowAuth(true)}
          style={{
            padding: "14px 36px", borderRadius: "999px", border: "none",
            background: colors.gradientPrimary, color: "#111", fontSize: 16, fontWeight: 700,
            cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
            boxShadow: "0 8px 32px rgba(192,192,192,0.18)",
          }}
        >
          Start hosting <ArrowRight size={18} />
        </button>
      </section>

      {/* ─── FOOTER ─── */}
      <footer
        style={{
          position: "relative", overflow: "hidden",
          borderTop: "1px solid rgba(251,191,36,0.12)",
          background: "linear-gradient(180deg, rgba(251,191,36,0.03) 0%, rgba(251,191,36,0.06) 50%, rgba(217,119,6,0.04) 100%)",
          padding: "clamp(36px, 6vh, 56px) clamp(16px, 5vw, 40px) clamp(20px, 3vh, 32px)",
        }}
      >
        {/* Ambient gold glow */}
        <div
          style={{
            position: "absolute", top: "-40%", left: "50%", transform: "translateX(-50%)",
            width: "min(600px, 90vw)", height: 300, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(251,191,36,0.08) 0%, rgba(245,158,11,0.04) 40%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div id="newsletter" style={{ position: "relative", zIndex: 1, maxWidth: 440, margin: "0 auto 28px", textAlign: "center" }}>
          <h3
            style={{
              fontSize: 16, fontWeight: 800, marginBottom: 5, letterSpacing: "-0.01em",
              background: colors.gradientGold, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}
          >
            Stay in the loop
          </h3>
          <p style={{ fontSize: 12, color: "rgba(255,230,160,0.5)", marginBottom: 16, lineHeight: 1.5 }}>
            Get early invites to underground events, private dinners, and things you won't find on Instagram.
          </p>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center" }}>
              {INTEREST_OPTIONS.map((opt) => {
                const active = selectedInterests.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleInterest(opt.id)}
                    style={{
                      padding: "5px 11px", borderRadius: "999px",
                      border: active ? "1px solid rgba(251,191,36,0.35)" : "1px solid rgba(251,191,36,0.12)",
                      background: active ? "rgba(251,191,36,0.12)" : "rgba(251,191,36,0.04)",
                      color: active ? "rgba(255,230,160,0.9)" : "rgba(255,230,160,0.4)",
                      fontSize: 11, cursor: "pointer", transition: "all 0.15s", fontWeight: active ? 600 : 400,
                    }}
                  >
                    {active && <CheckCircle size={10} style={{ marginRight: 3, verticalAlign: -1.5 }} />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleNewsletterSubmit} style={{ display: "flex", gap: 6, justifyContent: "center" }}>
            <input
              type="email" inputMode="email" autoComplete="email" required
              value={newsletterEmail} onChange={(e) => setNewsletterEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ ...inputStyle, flex: "1 1 180px", maxWidth: 260, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(251,191,36,0.15)", padding: "10px 13px", fontSize: 12, borderRadius: 10 }}
            />
            <button
              type="submit" disabled={newsletterSubmitting}
              style={{
                padding: "10px 18px", borderRadius: 10, border: "none",
                background: colors.gradientGold, color: "#111",
                fontSize: 12, fontWeight: 700,
                cursor: newsletterSubmitting ? "wait" : "pointer", whiteSpace: "nowrap",
                opacity: newsletterSubmitting ? 0.6 : 1, transition: "opacity 0.15s",
                boxShadow: "0 4px 16px rgba(245,158,11,0.2)",
              }}
            >
              {newsletterSubmitting ? "Joining..." : "Subscribe"}
            </button>
          </form>

          {newsletterStatus && (
            <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,230,160,0.5)", textAlign: "center" }}>{newsletterStatus}</div>
          )}
        </div>

        <div
          style={{
            position: "relative", zIndex: 1,
            borderTop: "1px solid rgba(251,191,36,0.08)", paddingTop: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: "clamp(12px, 3vw, 24px)", flexWrap: "wrap", fontSize: 11, color: "rgba(255,230,160,0.25)",
          }}
        >
          <span>pullup &copy; {new Date().getFullYear()}</span>
          <span style={{ opacity: 0.3 }}>&middot;</span>
          <a href="/privacy" style={{ color: "rgba(255,230,160,0.3)", textDecoration: "none" }}>Privacy</a>
          <a href="/terms" style={{ color: "rgba(255,230,160,0.3)", textDecoration: "none" }}>Terms</a>
          <a href="/cookies" style={{ color: "rgba(255,230,160,0.3)", textDecoration: "none" }}>Cookies</a>
          <span style={{ opacity: 0.3 }}>&middot;</span>
          <a href="mailto:hello@pullup.se" style={{ color: "rgba(255,230,160,0.3)", textDecoration: "none" }}>hello@pullup.se</a>
        </div>
      </footer>

      {/* ─── AUTH MODAL ─── */}
      {showAuth && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", padding: 20 }}
          onClick={() => setShowAuth(false)}
        >
          <div
            style={{ maxWidth: 380, width: "100%", borderRadius: 24, background: "linear-gradient(145deg, rgba(11,10,20,0.98), rgba(17,15,30,0.99))", boxShadow: "0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)", padding: "clamp(24px, 4vw, 36px)", position: "relative" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowAuth(false)}
              style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 4 }}
            >
              <X size={20} />
            </button>

            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, textAlign: "center" }}>
              Enter{" "}
              <span style={{ background: colors.gradientPrimary, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>pullup</span>
            </h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", textAlign: "center", marginBottom: 24 }}>
              Sign in or create your account
            </p>

            <form onSubmit={handleEmailPasswordSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }} htmlFor="auth-email">Email</label>
                <input id="auth-email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }} htmlFor="auth-password">Password</label>
                <input id="auth-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" style={inputStyle} />
              </div>
              <button
                type="submit" disabled={signingIn}
                style={{ width: "100%", padding: "14px 0", borderRadius: "999px", border: "none", background: colors.gradientPrimary, color: "#111", fontSize: 14, fontWeight: 700, cursor: signingIn ? "wait" : "pointer", opacity: signingIn ? 0.7 : 1, marginTop: 4 }}
              >
                {signingIn ? "Entering..." : "Enter pullup"}
              </button>
              {formError && <div style={{ fontSize: 12, color: "rgba(255,119,119,0.95)", textAlign: "center" }}>{formError}</div>}
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0" }}>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", color: "rgba(255,255,255,0.35)" }}>or</span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
              </div>
              <button
                type="button" onClick={handleGoogleContinue} disabled={signingIn}
                style={{ width: "100%", borderRadius: "999px", border: "1px solid rgba(0,0,0,0.16)", background: "#fff", padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: signingIn ? "wait" : "pointer", color: "#3c4043", fontSize: 14, fontWeight: 500 }}
              >
                {GoogleIcon}
                <span>Continue with Google</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── NEWSLETTER POPUP ─── */}
      {newsletterPopup && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", padding: 24 }}
          onClick={() => setNewsletterPopup(null)}
        >
          <div
            style={{ maxWidth: 340, width: "100%", borderRadius: 20, background: "linear-gradient(145deg, rgba(11,10,20,0.98), rgba(17,15,30,0.98))", boxShadow: "0 24px 60px rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.12)", padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: newsletterPopup.type === "success" ? "#fff" : "rgba(255,180,180,0.96)" }}>
              {newsletterPopup.title}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 20, lineHeight: 1.5 }}>
              {newsletterPopup.message}
            </div>
            <button
              type="button" onClick={() => setNewsletterPopup(null)}
              style={{ width: "100%", padding: "12px 0", borderRadius: "999px", border: "none", background: colors.gradientPrimary, color: "#111", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
