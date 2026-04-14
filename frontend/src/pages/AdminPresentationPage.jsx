import { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";

function Bullet({ color, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <div style={{ width: 6, height: 6, borderRadius: 3, background: color, marginTop: 8, flexShrink: 0 }} />
      <span style={{ fontSize: "clamp(13px, 1.5vw, 17px)", color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

function FeatureCard({ title, desc }) {
  return (
    <div style={{
      padding: "14px 18px", borderRadius: 14,
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{ fontSize: "clamp(13px, 1.5vw, 16px)", fontWeight: 600, color: "#fff", marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: "clamp(11px, 1.2vw, 14px)", color: "rgba(255,255,255,0.3)", lineHeight: 1.4 }}>{desc}</div>
    </div>
  );
}

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

  // 2 — Content-first event pages
  {
    bg: "radial-gradient(ellipse at 60% 40%, rgba(192,192,192,0.06) 0%, transparent 60%), #05040a",
    render: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 6%", gap: "5%" }}>
        <div style={{ flex: 1, maxWidth: 520 }}>
          <div style={{ fontSize: "clamp(12px, 1.4vw, 16px)", color: "rgba(192,192,192,0.5)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
            Event pages
          </div>
          <div style={{ fontSize: "clamp(26px, 3.5vw, 44px)", fontWeight: 700, color: "#fff", lineHeight: 1.15, marginBottom: 20 }}>
            Content first. <br />
            <span style={{ color: "rgba(255,255,255,0.4)" }}>Not template first.</span>
          </div>
          <div style={{ fontSize: "clamp(13px, 1.5vw, 17px)", color: "rgba(255,255,255,0.35)", lineHeight: 1.6, marginBottom: 24, maxWidth: 460 }}>
            Every event page is built around your content. Photos, video, text sections — arranged exactly how you want. No rigid templates. Your event, your story.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Bullet color="rgba(192,192,192,0.4)">Drag-and-drop sections — media, text, details in any order</Bullet>
            <Bullet color="rgba(192,192,192,0.4)">Full-bleed photo and video galleries</Bullet>
            <Bullet color="rgba(192,192,192,0.4)">Custom title styling — fonts, alignment, overlay controls</Bullet>
            <Bullet color="rgba(192,192,192,0.4)">Mobile-optimized out of the box</Bullet>
          </div>
        </div>
        {/* Phone mockup */}
        <div style={{
          flex: "0 0 auto", width: "clamp(180px, 22vw, 260px)", aspectRatio: "9/19", borderRadius: "clamp(20px, 3vw, 36px)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          <div style={{ height: "45%", background: "linear-gradient(180deg, rgba(192,192,192,0.08), transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "60%", height: "60%", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
          </div>
          <div style={{ padding: "0 12%", flex: 1 }}>
            <div style={{ height: 8, width: "70%", borderRadius: 4, background: "rgba(255,255,255,0.1)", marginBottom: 6 }} />
            <div style={{ height: 6, width: "50%", borderRadius: 3, background: "rgba(255,255,255,0.05)", marginBottom: 16 }} />
            <div style={{ height: 5, width: "100%", borderRadius: 3, background: "rgba(255,255,255,0.03)", marginBottom: 4 }} />
            <div style={{ height: 5, width: "90%", borderRadius: 3, background: "rgba(255,255,255,0.03)", marginBottom: 4 }} />
            <div style={{ height: 5, width: "60%", borderRadius: 3, background: "rgba(255,255,255,0.03)", marginBottom: 16 }} />
            <div style={{ height: 28, borderRadius: 8, background: "linear-gradient(135deg, rgba(192,192,192,0.15), rgba(192,192,192,0.08))" }} />
          </div>
        </div>
      </div>
    ),
  },

  // 3 — Event creation deep dive
  {
    bg: "#05040a",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "0 8%" }}>
        <div style={{ fontSize: "clamp(12px, 1.4vw, 16px)", color: "rgba(16,185,129,0.7)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
          Create
        </div>
        <div style={{ fontSize: "clamp(24px, 3.5vw, 42px)", fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 28 }}>
          Everything you need. Nothing you don't.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(clamp(200px, 28vw, 320px), 1fr))", gap: 10, maxWidth: 1000 }}>
          <FeatureCard title="Smart capacity" desc="Set cocktail and dinner capacity separately. Automatic waitlist when full — guests get notified when spots open." />
          <FeatureCard title="Dinner seatings" desc="Time-slot based dinner management. Guests pick their slot. Per-slot capacity limits. Overflow rules you control." />
          <FeatureCard title="Paid ticketing" desc="Stripe-powered payments. Set your price, currency, and let guests pay at RSVP. Revenue tracked in analytics." />
          <FeatureCard title="Plus-ones" desc="Control how many guests each person can bring. Party size tracked through RSVP, check-in, and analytics." />
          <FeatureCard title="Approval flow" desc="Optionally require manual approval before confirming RSVPs. You decide who gets in." />
          <FeatureCard title="Instant waitlist" desc="Skip confirmations entirely — everyone lands on the waitlist. Release spots on your terms." />
        </div>
      </div>
    ),
  },

  // 4 — Live check-in
  {
    bg: "#05040a",
    render: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 6%", gap: "5%" }}>
        {/* Check-in mockup */}
        <div style={{
          flex: "0 0 auto", width: "clamp(200px, 24vw, 300px)", borderRadius: 20,
          background: "rgba(16,185,129,0.03)",
          border: "1px solid rgba(16,185,129,0.1)",
          padding: "clamp(16px, 2.5vw, 28px)",
        }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: "clamp(14px, 1.6vw, 18px)", fontWeight: 700, color: "#fff" }}>Sarah Chen</div>
            <div style={{ fontSize: "clamp(11px, 1.1vw, 13px)", color: "rgba(255,255,255,0.3)", marginTop: 2 }}>3 guests expected</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 20, fontWeight: 600 }}>-</div>
            <div style={{ fontSize: "clamp(28px, 3.5vw, 36px)", fontWeight: 700, color: "#fff" }}>2<span style={{ fontSize: "0.5em", color: "rgba(255,255,255,0.3)" }}>/3</span></div>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 20, fontWeight: 600 }}>+</div>
          </div>
          <div style={{ height: 36, borderRadius: 10, background: "linear-gradient(135deg, rgba(16,185,129,0.8), rgba(5,150,105,0.8))", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "clamp(12px, 1.3vw, 14px)", fontWeight: 700 }}>
            Check in 2/3
          </div>
        </div>
        <div style={{ flex: 1, maxWidth: 480 }}>
          <div style={{ fontSize: "clamp(12px, 1.4vw, 16px)", color: "rgba(16,185,129,0.7)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
            At the door
          </div>
          <div style={{ fontSize: "clamp(24px, 3.5vw, 42px)", fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 20 }}>
            Check-in that<br />just works
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Bullet color="rgba(16,185,129,0.5)">Search guests instantly — tap to check in</Bullet>
            <Bullet color="rgba(16,185,129,0.5)">Track party sizes — know exactly who arrived out of how many</Bullet>
            <Bullet color="rgba(16,185,129,0.5)">Made a mistake? Tap to undo — adjust the count down</Bullet>
            <Bullet color="rgba(16,185,129,0.5)">Reception role — give door staff check-in access without editing power</Bullet>
            <Bullet color="rgba(16,185,129,0.5)">Works on any phone — no app install needed</Bullet>
          </div>
        </div>
      </div>
    ),
  },

  // 5 — CRM
  {
    bg: "radial-gradient(ellipse at 30% 50%, rgba(168,85,247,0.06) 0%, transparent 50%), #05040a",
    render: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 6%", gap: "5%" }}>
        <div style={{ flex: 1, maxWidth: 480 }}>
          <div style={{ fontSize: "clamp(12px, 1.4vw, 16px)", color: "rgba(168,85,247,0.7)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
            CRM
          </div>
          <div style={{ fontSize: "clamp(24px, 3.5vw, 42px)", fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 10 }}>
            Your audience,<br />across every event
          </div>
          <div style={{ fontSize: "clamp(13px, 1.5vw, 17px)", color: "rgba(255,255,255,0.35)", lineHeight: 1.6, marginBottom: 24, maxWidth: 420 }}>
            Every RSVP builds your contact database automatically. See who comes back, who brings friends, and who engages.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Bullet color="rgba(168,85,247,0.5)">Unified guest profiles — attendance history across all events</Bullet>
            <Bullet color="rgba(168,85,247,0.5)">See total events attended, party sizes, no-show rate per person</Bullet>
            <Bullet color="rgba(168,85,247,0.5)">Tag and segment your audience for targeted outreach</Bullet>
            <Bullet color="rgba(168,85,247,0.5)">Every new event grows your database — zero extra work</Bullet>
          </div>
        </div>
        {/* CRM mockup */}
        <div style={{
          flex: "0 0 auto", width: "clamp(240px, 30vw, 380px)", borderRadius: 16,
          background: "rgba(168,85,247,0.03)",
          border: "1px solid rgba(168,85,247,0.1)",
          padding: "clamp(12px, 2vw, 20px)",
        }}>
          {[
            { name: "Sarah Chen", events: 5, label: "Regular" },
            { name: "Marcus Lindgren", events: 3, label: "Active" },
            { name: "Elena Rodriguez", events: 1, label: "New" },
            { name: "David Kim", events: 8, label: "VIP" },
            { name: "Julia Svensson", events: 2, label: "Active" },
          ].map((p, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
              borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.03)" : "none",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: `rgba(168,85,247,${0.08 + i * 0.04})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 600, color: "rgba(168,85,247,0.7)",
              }}>{p.name[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 500, color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                <div style={{ fontSize: "clamp(9px, 1vw, 11px)", color: "rgba(255,255,255,0.25)" }}>{p.events} events attended</div>
              </div>
              <span style={{
                fontSize: 9, padding: "2px 7px", borderRadius: 999, fontWeight: 600,
                background: p.label === "VIP" ? "rgba(251,191,36,0.15)" : p.label === "Regular" ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.05)",
                color: p.label === "VIP" ? "rgba(251,191,36,0.8)" : p.label === "Regular" ? "rgba(16,185,129,0.6)" : "rgba(255,255,255,0.3)",
              }}>{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 6 — Email campaigns
  {
    bg: "#05040a",
    render: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 6%", gap: "5%" }}>
        {/* Email mockup */}
        <div style={{
          flex: "0 0 auto", width: "clamp(220px, 26vw, 320px)", borderRadius: 16,
          background: "rgba(59,130,246,0.03)",
          border: "1px solid rgba(59,130,246,0.1)",
          padding: "clamp(14px, 2vw, 22px)",
        }}>
          <div style={{ fontSize: "clamp(10px, 1vw, 12px)", color: "rgba(255,255,255,0.2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>Campaign</div>
          <div style={{ height: 7, width: "80%", borderRadius: 4, background: "rgba(255,255,255,0.08)", marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[
              { label: "Sent", val: "156", color: "rgba(255,255,255,0.5)" },
              { label: "Opens", val: "52%", color: "rgba(59,130,246,0.7)" },
              { label: "Clicks", val: "24%", color: "rgba(16,185,129,0.7)" },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: "clamp(14px, 1.8vw, 20px)", fontWeight: 700, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 10, fontSize: "clamp(9px, 1vw, 11px)", color: "rgba(255,255,255,0.2)" }}>
            <div style={{ marginBottom: 4 }}>Segment: Attended 2+ events</div>
            <div>Tracking: per-recipient opens & clicks</div>
          </div>
        </div>
        <div style={{ flex: 1, maxWidth: 480 }}>
          <div style={{ fontSize: "clamp(12px, 1.4vw, 16px)", color: "rgba(59,130,246,0.7)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
            Email campaigns
          </div>
          <div style={{ fontSize: "clamp(24px, 3.5vw, 42px)", fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 10 }}>
            Reach the right people
          </div>
          <div style={{ fontSize: "clamp(13px, 1.5vw, 17px)", color: "rgba(255,255,255,0.35)", lineHeight: 1.6, marginBottom: 24, maxWidth: 420 }}>
            Your CRM data powers targeted campaigns. Segment by attendance history, engagement, or custom tags — then track every open and click.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Bullet color="rgba(59,130,246,0.5)">Segment audiences — regulars, VIPs, first-timers, no-shows</Bullet>
            <Bullet color="rgba(59,130,246,0.5)">Per-recipient tracking — who opened, who clicked, who converted</Bullet>
            <Bullet color="rgba(59,130,246,0.5)">UTM-tagged links — see campaign impact in event analytics</Bullet>
            <Bullet color="rgba(59,130,246,0.5)">VIP invite emails with personal tracking links</Bullet>
          </div>
        </div>
      </div>
    ),
  },

  // 7 — Analytics
  {
    bg: "#05040a",
    render: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 6%", gap: "5%" }}>
        <div style={{ flex: 1, maxWidth: 480 }}>
          <div style={{ fontSize: "clamp(12px, 1.4vw, 16px)", color: "rgba(251,191,36,0.7)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
            Analytics
          </div>
          <div style={{ fontSize: "clamp(24px, 3.5vw, 42px)", fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 10 }}>
            See where your guests<br />come from
          </div>
          <div style={{ fontSize: "clamp(13px, 1.5vw, 17px)", color: "rgba(255,255,255,0.35)", lineHeight: 1.6, marginBottom: 24, maxWidth: 420 }}>
            Every event page tracks traffic sources automatically. Know which Instagram story drove signups. See if your LinkedIn post converted. Compare channels and double down on what works.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Bullet color="rgba(251,191,36,0.5)">Source detection — Instagram, Facebook, LinkedIn, Google, direct, referral</Bullet>
            <Bullet color="rgba(251,191,36,0.5)">Daily source breakdown — stacked bars showing channel mix over time</Bullet>
            <Bullet color="rgba(251,191,36,0.5)">Full funnel — page views to RSVPs to actual arrivals</Bullet>
            <Bullet color="rgba(251,191,36,0.5)">Device split — know if your audience is mobile or desktop</Bullet>
          </div>
        </div>
        {/* Analytics mockup */}
        <div style={{
          flex: "0 0 auto", width: "clamp(240px, 28vw, 360px)", borderRadius: 16,
          background: "rgba(251,191,36,0.02)",
          border: "1px solid rgba(251,191,36,0.08)",
          padding: "clamp(14px, 2vw, 22px)",
        }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 100, marginBottom: 10 }}>
            {[
              { ig: 5, fb: 2, d: 3 }, { ig: 8, fb: 1, d: 4 }, { ig: 3, fb: 3, d: 2 },
              { ig: 12, fb: 2, d: 5 }, { ig: 6, fb: 4, d: 3 }, { ig: 15, fb: 3, d: 4 },
              { ig: 10, fb: 2, d: 6 }, { ig: 18, fb: 4, d: 5 }, { ig: 8, fb: 3, d: 4 },
              { ig: 14, fb: 2, d: 7 },
            ].map((bar, i) => {
              const total = bar.ig + bar.fb + bar.d;
              const maxH = 27; // max total
              const scale = 100 / maxH;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column-reverse", height: "100%" }}>
                  <div style={{ height: bar.d * scale, background: "rgba(255,255,255,0.15)", borderRadius: "0 0 2px 2px" }} />
                  <div style={{ height: bar.fb * scale, background: "rgba(59,130,246,0.5)" }} />
                  <div style={{ height: bar.ig * scale, background: "rgba(225,48,108,0.6)", borderRadius: "2px 2px 0 0" }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: 1, background: "rgba(225,48,108,0.6)" }} /> Instagram</span>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: 1, background: "rgba(59,130,246,0.5)" }} /> Facebook</span>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: 1, background: "rgba(255,255,255,0.15)" }} /> Direct</span>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", marginTop: 10, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: "clamp(9px, 1vw, 11px)" }}>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>142 views</span>
            <span style={{ color: "rgba(16,185,129,0.5)" }}>38 RSVPs</span>
            <span style={{ color: "rgba(251,191,36,0.5)" }}>27% conversion</span>
          </div>
        </div>
      </div>
    ),
  },

  // 8 — Team & roles
  {
    bg: "radial-gradient(ellipse at 50% 50%, rgba(192,192,192,0.04) 0%, transparent 60%), #05040a",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "0 8%" }}>
        <div style={{ fontSize: "clamp(12px, 1.4vw, 16px)", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
          Collaboration
        </div>
        <div style={{ fontSize: "clamp(24px, 3.5vw, 42px)", fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 28 }}>
          Your team, your rules
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(clamp(200px, 26vw, 300px), 1fr))", gap: 10, maxWidth: 960 }}>
          {[
            { role: "Owner", color: "251,191,36", desc: "Full control. Billing, settings, delete. The event is yours." },
            { role: "Admin", color: "168,85,247", desc: "Everything except billing. Manage guests, edit event, invite team." },
            { role: "Editor", color: "59,130,246", desc: "Edit event details and manage the guest list. No team access." },
            { role: "Reception", color: "16,185,129", desc: "Check-in only. Search guests, mark arrivals. Perfect for door staff." },
            { role: "Analytics", color: "245,158,11", desc: "View-only analytics. Share insights without exposing guest data." },
          ].map((r) => (
            <div key={r.role} style={{
              padding: "14px 18px", borderRadius: 14,
              background: `rgba(${r.color},0.03)`,
              border: `1px solid rgba(${r.color},0.1)`,
            }}>
              <div style={{ fontSize: "clamp(14px, 1.6vw, 17px)", fontWeight: 700, color: `rgba(${r.color},0.8)`, marginBottom: 4 }}>{r.role}</div>
              <div style={{ fontSize: "clamp(11px, 1.2vw, 14px)", color: "rgba(255,255,255,0.3)", lineHeight: 1.4 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 9 — Built for
  {
    bg: "#05040a",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "0 8%" }}>
        <div style={{ fontSize: "clamp(12px, 1.4vw, 16px)", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
          Built for
        </div>
        <div style={{ fontSize: "clamp(24px, 3.5vw, 42px)", fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 28 }}>
          Anyone who hosts.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(clamp(200px, 26vw, 300px), 1fr))", gap: 10, maxWidth: 960 }}>
          <FeatureCard title="Nightlife & clubs" desc="Capacity control, VIP lists, instant waitlist, door check-in with reception role." />
          <FeatureCard title="Private dinners" desc="Time-slot seatings, per-slot capacity, dietary tracking, intimate guest management." />
          <FeatureCard title="Brand activations" desc="Track reach per social channel, partner CTA clicks, audience insights." />
          <FeatureCard title="Community events" desc="Free RSVPs, waitlist overflow, email campaigns to your growing audience." />
          <FeatureCard title="Corporate events" desc="Multi-host collaboration, granular roles, paid ticketing, revenue tracking." />
          <FeatureCard title="Pop-ups & launches" desc="One-time pages with full analytics. See what worked after it's over." />
        </div>
      </div>
    ),
  },

  // 10 — CTA
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
        <a
          href="https://pullup.se"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "16px 48px", borderRadius: 999,
            background: "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)",
            color: "#111", fontSize: "clamp(14px, 1.8vw, 18px)", fontWeight: 700,
            letterSpacing: "0.05em", textTransform: "uppercase",
            textDecoration: "none", display: "inline-block",
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(192,192,192,0.3)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
        >
          pullup.se
        </a>
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

      {/* Click zones — pointer-events:none on slide content so links still work */}
      <div
        onClick={() => goTo(current - 1)}
        style={{ position: "absolute", top: 50, left: 0, width: "15%", bottom: 50, cursor: current > 0 ? "w-resize" : "default", zIndex: 5 }}
      />
      <div
        onClick={() => goTo(current + 1)}
        style={{ position: "absolute", top: 50, right: 0, width: "15%", bottom: 50, cursor: current < slides.length - 1 ? "e-resize" : "default", zIndex: 5 }}
      />

      {/* Progress dots + export */}
      <div style={{
        position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 10, zIndex: 50,
      }}>
        <div style={{ display: "flex", gap: 6 }}>
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
        <button
          className="presentation-no-print"
          onClick={() => {
            const printWin = window.open("", "_blank");
            if (!printWin) return;
            printWin.document.write(`<!DOCTYPE html><html><head><title>PullUp — Presentation</title><style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { background: #05040a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
              @page { size: landscape; margin: 0; }
              .slide { width: 100vw; height: 100vh; page-break-after: always; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; overflow: hidden; }
              .slide:last-child { page-break-after: avoid; }
            </style></head><body><div id="print-root"></div></body></html>`);
            printWin.document.close();
            const root = createRoot(printWin.document.getElementById("print-root"));
            root.render(
              slides.map((s, i) => (
                <div key={i} className="slide" style={{ background: s.bg, color: "#fff" }}>
                  {s.render()}
                </div>
              ))
            );
            setTimeout(() => { printWin.print(); }, 500);
          }}
          style={{
            padding: "4px 12px", borderRadius: 999,
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,0.2)",
            fontSize: "11px", fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
        >
          Export PDF
        </button>
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
