import { useState, useEffect, useCallback } from "react";

const slides = [
  // 1 — Title
  {
    bg: "radial-gradient(ellipse at 30% 40%, rgba(192,192,192,0.12) 0%, transparent 60%), radial-gradient(ellipse at 70% 70%, rgba(232,232,232,0.08) 0%, transparent 50%), #05040a",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
        <div style={{
          fontSize: "clamp(60px, 10vw, 120px)", fontWeight: 800, letterSpacing: "-3px",
          background: "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 40%, #a8a8a8 70%, #e8e8e8 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          lineHeight: 1,
        }}>
          PULLUP
        </div>
        <div style={{
          fontSize: "clamp(16px, 2.5vw, 28px)", fontWeight: 400, color: "rgba(255,255,255,0.4)",
          marginTop: "16px", letterSpacing: "0.15em", textTransform: "uppercase",
        }}>
          The event platform
        </div>
        <div style={{
          width: 60, height: 2, borderRadius: 1, marginTop: 32,
          background: "linear-gradient(90deg, transparent, rgba(192,192,192,0.4), transparent)",
        }} />
      </div>
    ),
  },

  // 2 — The Problem
  {
    bg: "#05040a",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "0 10%" }}>
        <div style={{ fontSize: "clamp(14px, 1.8vw, 20px)", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 16 }}>
          The problem
        </div>
        <div style={{ fontSize: "clamp(28px, 4.5vw, 52px)", fontWeight: 700, color: "#fff", lineHeight: 1.2, maxWidth: 800 }}>
          Hosting events is chaotic.
        </div>
        <div style={{ fontSize: "clamp(16px, 2vw, 22px)", color: "rgba(255,255,255,0.4)", marginTop: 20, lineHeight: 1.6, maxWidth: 700 }}>
          Scattered guest lists in spreadsheets. No idea who showed up. Manual check-ins. Zero insight into what's working.
        </div>
      </div>
    ),
  },

  // 3 — The Solution
  {
    bg: "radial-gradient(ellipse at 60% 50%, rgba(192,192,192,0.08) 0%, transparent 60%), #05040a",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "0 10%" }}>
        <div style={{ fontSize: "clamp(14px, 1.8vw, 20px)", color: "rgba(192,192,192,0.5)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 16 }}>
          The solution
        </div>
        <div style={{ fontSize: "clamp(28px, 4.5vw, 52px)", fontWeight: 700, color: "#fff", lineHeight: 1.2, maxWidth: 800 }}>
          One platform. <br />
          <span style={{ background: "linear-gradient(135deg, #e8e8e8, #a8a8a8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Every event.
          </span>
        </div>
        <div style={{ fontSize: "clamp(16px, 2vw, 22px)", color: "rgba(255,255,255,0.4)", marginTop: 20, lineHeight: 1.6, maxWidth: 700 }}>
          PullUp handles your event page, RSVPs, guest list, live check-in, and analytics — all in one place.
        </div>
      </div>
    ),
  },

  // 4 — Create
  {
    bg: "#05040a",
    render: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 8%", gap: "8%" }}>
        <div style={{ flex: 1, maxWidth: 500 }}>
          <div style={{ fontSize: "clamp(12px, 1.5vw, 16px)", color: "rgba(16,185,129,0.7)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
            Create
          </div>
          <div style={{ fontSize: "clamp(26px, 3.5vw, 44px)", fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 20 }}>
            Beautiful event pages in minutes
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {["Customizable event pages with media galleries", "Capacity management with smart waitlists", "Paid or free ticketing with Stripe", "Dinner seatings with time slot management"].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: "rgba(16,185,129,0.5)", marginTop: 8, flexShrink: 0 }} />
                <span style={{ fontSize: "clamp(14px, 1.6vw, 18px)", color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{
          flex: 1, maxWidth: 400, aspectRatio: "9/16", borderRadius: 24,
          background: "linear-gradient(180deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 100%)",
          border: "1px solid rgba(16,185,129,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "48px", color: "rgba(16,185,129,0.2)",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "clamp(40px, 5vw, 64px)" }}>+</div>
            <div style={{ fontSize: "clamp(12px, 1.3vw, 16px)", marginTop: 8, color: "rgba(16,185,129,0.3)" }}>Event Page</div>
          </div>
        </div>
      </div>
    ),
  },

  // 5 — Manage
  {
    bg: "#05040a",
    render: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 8%", gap: "8%" }}>
        <div style={{
          flex: 1, maxWidth: 400, aspectRatio: "4/3", borderRadius: 20,
          background: "rgba(59,130,246,0.04)",
          border: "1px solid rgba(59,130,246,0.12)",
          padding: "clamp(16px, 3vw, 32px)", display: "flex", flexDirection: "column", justifyContent: "center",
        }}>
          {["Sarah + 2", "Marcus + 1", "Elena + 3", "David", "Julia + 1"].map((name, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 12px", borderRadius: 8, marginBottom: 4,
              background: i < 3 ? "rgba(16,185,129,0.06)" : "transparent",
            }}>
              <span style={{ fontSize: "clamp(12px, 1.3vw, 15px)", color: i < 3 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)" }}>{name}</span>
              <span style={{
                fontSize: "clamp(9px, 1vw, 11px)", padding: "2px 8px", borderRadius: 999, fontWeight: 600,
                background: i < 3 ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                color: i < 3 ? "#10b981" : "#f59e0b",
              }}>
                {i < 3 ? "ARRIVED" : "CONFIRMED"}
              </span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, maxWidth: 500 }}>
          <div style={{ fontSize: "clamp(12px, 1.5vw, 16px)", color: "rgba(59,130,246,0.7)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
            Manage
          </div>
          <div style={{ fontSize: "clamp(26px, 3.5vw, 44px)", fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 20 }}>
            Real-time guest management
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {["Live check-in counter at the door", "Team roles — owner, admin, editor, reception", "VIP invite links with personal tracking", "CRM across all your events"].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: "rgba(59,130,246,0.5)", marginTop: 8, flexShrink: 0 }} />
                <span style={{ fontSize: "clamp(14px, 1.6vw, 18px)", color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },

  // 6 — Analyze
  {
    bg: "#05040a",
    render: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 8%", gap: "8%" }}>
        <div style={{ flex: 1, maxWidth: 500 }}>
          <div style={{ fontSize: "clamp(12px, 1.5vw, 16px)", color: "rgba(251,191,36,0.7)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
            Analyze
          </div>
          <div style={{ fontSize: "clamp(26px, 3.5vw, 44px)", fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 20 }}>
            Know what's working
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {["Traffic sources — see where guests discover you", "Conversion funnel — views to RSVPs to arrivals", "Email campaign tracking with open & click rates", "Partner CTA performance metrics"].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: "rgba(251,191,36,0.5)", marginTop: 8, flexShrink: 0 }} />
                <span style={{ fontSize: "clamp(14px, 1.6vw, 18px)", color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{
          flex: 1, maxWidth: 400, aspectRatio: "4/3", borderRadius: 20,
          background: "rgba(251,191,36,0.03)",
          border: "1px solid rgba(251,191,36,0.1)",
          padding: "clamp(16px, 3vw, 32px)", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 6,
        }}>
          {/* Mini chart bars */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: "60%", padding: "0 8px" }}>
            {[35, 50, 40, 70, 55, 80, 65, 90, 75, 100, 60, 85].map((h, i) => (
              <div key={i} style={{
                flex: 1, borderRadius: 3,
                height: `${h}%`,
                background: `rgba(251,191,36,${0.15 + (h / 100) * 0.35})`,
              }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0 8px" }}>
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.15)" }}>Views</span>
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.15)" }}>by source, per day</span>
          </div>
        </div>
      </div>
    ),
  },

  // 7 — How it works
  {
    bg: "radial-gradient(ellipse at 50% 50%, rgba(192,192,192,0.06) 0%, transparent 60%), #05040a",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 8%", textAlign: "center" }}>
        <div style={{ fontSize: "clamp(14px, 1.8vw, 20px)", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 16 }}>
          How it works
        </div>
        <div style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 48 }}>
          Three steps. That's it.
        </div>
        <div style={{ display: "flex", gap: "clamp(20px, 4vw, 60px)", flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { step: "1", title: "Create", desc: "Build your event page with all the details", color: "16,185,129" },
            { step: "2", title: "Share", desc: "Send your link — track every click and RSVP", color: "59,130,246" },
            { step: "3", title: "Host", desc: "Check in guests live and see real-time analytics", color: "251,191,36" },
          ].map((s) => (
            <div key={s.step} style={{ width: "clamp(160px, 22vw, 240px)", textAlign: "center" }}>
              <div style={{
                width: "clamp(48px, 6vw, 72px)", height: "clamp(48px, 6vw, 72px)",
                borderRadius: "50%", margin: "0 auto 16px",
                background: `rgba(${s.color},0.08)`,
                border: `1px solid rgba(${s.color},0.2)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "clamp(20px, 2.5vw, 28px)", fontWeight: 700, color: `rgba(${s.color},0.7)`,
              }}>
                {s.step}
              </div>
              <div style={{ fontSize: "clamp(16px, 2vw, 22px)", fontWeight: 700, color: "#fff", marginBottom: 6 }}>{s.title}</div>
              <div style={{ fontSize: "clamp(12px, 1.4vw, 15px)", color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 8 — For who
  {
    bg: "#05040a",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "0 10%" }}>
        <div style={{ fontSize: "clamp(14px, 1.8vw, 20px)", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 16 }}>
          Built for
        </div>
        <div style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 32 }}>
          Anyone who hosts.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(clamp(180px, 25vw, 280px), 1fr))", gap: 12, maxWidth: 900 }}>
          {[
            { label: "Nightlife & clubs", desc: "Capacity control, VIP lists, door check-in" },
            { label: "Private dinners", desc: "Seating management with time slots" },
            { label: "Brand activations", desc: "Track reach and engagement per channel" },
            { label: "Community events", desc: "Free RSVPs with waitlist overflow" },
            { label: "Corporate events", desc: "Team roles and multi-host collaboration" },
            { label: "Pop-ups & launches", desc: "One-time pages with full analytics" },
          ].map((item, i) => (
            <div key={i} style={{
              padding: "14px 18px", borderRadius: 14,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ fontSize: "clamp(14px, 1.6vw, 17px)", fontWeight: 600, color: "#fff", marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: "clamp(12px, 1.2vw, 14px)", color: "rgba(255,255,255,0.3)", lineHeight: 1.4 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 9 — CTA
  {
    bg: "radial-gradient(ellipse at 50% 60%, rgba(192,192,192,0.1) 0%, transparent 50%), #05040a",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
        <div style={{
          fontSize: "clamp(36px, 6vw, 72px)", fontWeight: 800, lineHeight: 1.1,
          background: "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 40%, #a8a8a8 70%, #e8e8e8 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          marginBottom: 16,
        }}>
          Ready to pull up?
        </div>
        <div style={{
          fontSize: "clamp(16px, 2vw, 22px)", color: "rgba(255,255,255,0.35)", marginBottom: 40, maxWidth: 500,
        }}>
          Start creating events for free. No credit card required.
        </div>
        <div style={{
          padding: "16px 48px", borderRadius: 999,
          background: "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)",
          color: "#111", fontSize: "clamp(14px, 1.8vw, 18px)", fontWeight: 700,
          letterSpacing: "0.05em", textTransform: "uppercase",
        }}>
          pullup.se
        </div>
      </div>
    ),
  },
];

export function AdminPresentationPage() {
  const [current, setCurrent] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  const goTo = useCallback((index) => {
    if (index < 0 || index >= slides.length || index === current || transitioning) return;
    setTransitioning(true);
    setCurrent(index);
    setTimeout(() => setTransitioning(false), 400);
  }, [current, transitioning]);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        goTo(current + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goTo(current - 1);
      } else if (e.key === "f" || e.key === "F") {
        document.documentElement.requestFullscreen?.();
      } else if (e.key === "Escape") {
        document.exitFullscreen?.();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [current, goTo]);

  const slide = slides[current];

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: slide.bg,
      color: "#fff",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      overflow: "hidden",
      cursor: "none",
    }}>
      {/* Slide content */}
      <div
        key={current}
        style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          animation: "slideIn 0.4s ease-out",
        }}
      >
        {slide.render()}
      </div>

      {/* Click zones */}
      <div
        onClick={() => goTo(current - 1)}
        style={{ position: "absolute", top: 0, left: 0, width: "20%", height: "100%", cursor: current > 0 ? "w-resize" : "default" }}
      />
      <div
        onClick={() => goTo(current + 1)}
        style={{ position: "absolute", top: 0, right: 0, width: "80%", height: "100%", cursor: current < slides.length - 1 ? "e-resize" : "default" }}
      />

      {/* Progress dots */}
      <div style={{
        position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
        display: "flex", gap: 6,
      }}>
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            style={{
              width: i === current ? 24 : 6, height: 6, borderRadius: 3,
              background: i === current ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.15)",
              border: "none", padding: 0, cursor: "pointer",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>

      {/* Slide counter */}
      <div style={{
        position: "absolute", bottom: 24, right: 28,
        fontSize: "12px", color: "rgba(255,255,255,0.15)",
      }}>
        {current + 1} / {slides.length}
      </div>

      {/* CSS animation */}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
