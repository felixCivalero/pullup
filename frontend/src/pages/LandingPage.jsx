import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

export function LandingPage() {
  const navigate = useNavigate();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function handleMouseMove(e) {
      setMousePosition({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);
  console.log(
    "Supabase URL:",
    import.meta.env.VITE_SUPABASE_URL ? "✅ Loaded" : "❌ Missing"
  );
  return (
    <div
      style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}
    >
      {/* Animated gradient background */}
      <div
        style={{
          position: "fixed",
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
          position: "fixed",
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
        {/* Hero Section */}
        <section
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 20px",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: "900px", width: "100%" }}>
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
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              Create a sexy RSVP link in seconds. Drop it in your bio. Watch
              people pull up.
            </p>

            {/* CTA Buttons */}
            <div
              style={{
                display: "flex",
                gap: "16px",
                justifyContent: "center",
                flexWrap: "wrap",
                marginBottom: "60px",
              }}
            >
              <button
                onClick={() => navigate("/home")}
                style={{
                  padding: "16px 32px",
                  borderRadius: "999px",
                  border: "none",
                  background:
                    "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "16px",
                  cursor: "pointer",
                  boxShadow: "0 10px 30px rgba(139, 92, 246, 0.4)",
                  transition: "all 0.3s ease",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = "translateY(-2px)";
                  e.target.style.boxShadow =
                    "0 15px 40px rgba(139, 92, 246, 0.6)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = "translateY(0)";
                  e.target.style.boxShadow =
                    "0 10px 30px rgba(139, 92, 246, 0.4)";
                }}
              >
                Start free now
              </button>
              <button
                onClick={() => navigate("/home")}
                style={{
                  padding: "16px 32px",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "16px",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  backdropFilter: "blur(10px)",
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = "rgba(255,255,255,0.1)";
                  e.target.style.borderColor = "rgba(255,255,255,0.3)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = "rgba(255,255,255,0.05)";
                  e.target.style.borderColor = "rgba(255,255,255,0.2)";
                }}
              >
                Sign in
              </button>
            </div>

            {/* Stats/Trust indicators */}
            <div
              style={{
                display: "flex",
                gap: "32px",
                justifyContent: "center",
                flexWrap: "wrap",
                fontSize: "14px",
                opacity: 0.6,
              }}
            >
              <div>⚡ Instant links</div>
              <div>🎯 No signup required</div>
              <div>🔥 Free forever</div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section
          style={{
            padding: "80px 20px",
            maxWidth: "1200px",
            margin: "0 auto",
          }}
        >
          <h2
            style={{
              fontSize: "clamp(28px, 5vw, 42px)",
              textAlign: "center",
              marginBottom: "60px",
              fontWeight: 700,
            }}
          >
            Why people pull up
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "32px",
            }}
          >
            {[
              {
                emoji: "⚡",
                title: "Lightning fast",
                desc: "Create your RSVP link in under 10 seconds. No forms, no BS.",
              },
              {
                emoji: "🎨",
                title: "Sexy design",
                desc: "Beautiful event pages that make people want to pull up.",
              },
              {
                emoji: "📱",
                title: "Mobile-first",
                desc: "Works perfectly on any device. Share anywhere, anytime.",
              },
              {
                emoji: "🔗",
                title: "One link",
                desc: "Drop it in your bio, DMs, or anywhere. One link to rule them all.",
              },
              {
                emoji: "📊",
                title: "Track RSVPs",
                desc: "See who's pulling up. Manage capacity. Build your list.",
              },
              {
                emoji: "🚀",
                title: "No limits",
                desc: "Unlimited events. Unlimited RSVPs. No credit card needed.",
              },
            ].map((feature, i) => (
              <div
                key={i}
                style={{
                  background: "rgba(12, 10, 18, 0.6)",
                  padding: "32px",
                  borderRadius: "20px",
                  border: "1px solid rgba(255,255,255,0.05)",
                  backdropFilter: "blur(10px)",
                  transition: "all 0.3s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.3)";
                  e.currentTarget.style.boxShadow =
                    "0 20px 40px rgba(0,0,0,0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ fontSize: "40px", marginBottom: "16px" }}>
                  {feature.emoji}
                </div>
                <h3
                  style={{
                    fontSize: "20px",
                    fontWeight: 600,
                    marginBottom: "8px",
                  }}
                >
                  {feature.title}
                </h3>
                <p
                  style={{ fontSize: "14px", opacity: 0.7, lineHeight: "1.6" }}
                >
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section
          style={{
            padding: "80px 20px",
            background: "rgba(12, 10, 18, 0.4)",
          }}
        >
          <div style={{ maxWidth: "900px", margin: "0 auto" }}>
            <h2
              style={{
                fontSize: "clamp(28px, 5vw, 42px)",
                textAlign: "center",
                marginBottom: "60px",
                fontWeight: 700,
              }}
            >
              How it works
            </h2>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "40px",
              }}
            >
              {[
                {
                  step: "01",
                  title: "Create your PullUp",
                  desc: "Add event details. Get a sexy link. Takes 10 seconds.",
                },
                {
                  step: "02",
                  title: "Share the link",
                  desc: "Drop it in your bio, stories, DMs, or anywhere people hang.",
                },
                {
                  step: "03",
                  title: "Watch them pull up",
                  desc: "People RSVP. You see who's coming. Build your community.",
                },
              ].map((step, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: "24px",
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      fontSize: "clamp(32px, 6vw, 48px)",
                      fontWeight: 800,
                      background:
                        "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                      flexShrink: 0,
                    }}
                  >
                    {step.step}
                  </div>
                  <div>
                    <h3
                      style={{
                        fontSize: "clamp(20px, 3vw, 28px)",
                        fontWeight: 600,
                        marginBottom: "8px",
                      }}
                    >
                      {step.title}
                    </h3>
                    <p
                      style={{
                        fontSize: "clamp(14px, 2vw, 18px)",
                        opacity: 0.7,
                        lineHeight: "1.6",
                      }}
                    >
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section
          style={{
            padding: "100px 20px",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: "700px", margin: "0 auto" }}>
            <h2
              style={{
                fontSize: "clamp(32px, 6vw, 56px)",
                fontWeight: 800,
                marginBottom: "24px",
                lineHeight: "1.2",
              }}
            >
              Ready to make them
              <br />
              <span
                style={{
                  background:
                    "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                pull up?
              </span>
            </h2>
            <p
              style={{
                fontSize: "clamp(16px, 2.5vw, 20px)",
                opacity: 0.8,
                marginBottom: "40px",
              }}
            >
              Join creators, hosts, and event organizers who are building their
              communities.
            </p>
            <button
              onClick={() => navigate("/create")}
              style={{
                padding: "18px 40px",
                borderRadius: "999px",
                border: "none",
                background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                color: "#fff",
                fontWeight: 700,
                fontSize: "18px",
                cursor: "pointer",
                boxShadow: "0 10px 30px rgba(139, 92, 246, 0.4)",
                transition: "all 0.3s ease",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = "translateY(-2px) scale(1.05)";
                e.target.style.boxShadow =
                  "0 15px 40px rgba(139, 92, 246, 0.6)";
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = "translateY(0) scale(1)";
                e.target.style.boxShadow =
                  "0 10px 30px rgba(139, 92, 246, 0.4)";
              }}
            >
              Create your PullUp →
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer
          style={{
            padding: "40px 20px",
            textAlign: "center",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            opacity: 0.6,
            fontSize: "14px",
          }}
        >
          <div>PullUp · Make them pull up</div>
        </footer>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
}
