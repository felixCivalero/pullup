import { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { colors } from "../theme/colors.js";

function Bullet({ color, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <div style={{ width: 6, height: 6, borderRadius: 3, background: color, marginTop: 8, flexShrink: 0 }} />
      <span style={{ fontSize: "clamp(13px, 1.5vw, 17px)", color: colors.textMuted, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

function FeatureCard({ title, desc }) {
  return (
    <div style={{
      padding: "14px 18px", borderRadius: 14,
      background: "#fff",
      border: `1px solid ${colors.border}`,
      boxShadow: "0 2px 12px rgba(10,10,10,0.05)",
    }}>
      <div style={{ fontSize: "clamp(13px, 1.5vw, 16px)", fontWeight: 600, color: colors.text, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: "clamp(11px, 1.2vw, 14px)", color: colors.textMuted, lineHeight: 1.4 }}>{desc}</div>
    </div>
  );
}

const slides = [
  // 1 — Title
  {
    bg: "#fafafa",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
        <div style={{
          fontSize: "clamp(60px, 10vw, 120px)", fontWeight: 800, letterSpacing: "-3px",
          color: colors.text,
          lineHeight: 1,
        }}>
          PULLUP
        </div>
        <div style={{
          fontSize: "clamp(16px, 2.5vw, 28px)", fontWeight: 400, color: colors.textMuted,
          marginTop: "16px", letterSpacing: "0.15em", textTransform: "uppercase",
        }}>
          The event platform
        </div>
        <div style={{
          width: 60, height: 2, borderRadius: 1, marginTop: 32,
          background: colors.gold,
        }} />
      </div>
    ),
  },

  // 2 — Content-first event pages
  {
    bg: "#ffffff",
    render: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 6%", gap: "5%" }}>
        <div style={{ flex: 1, maxWidth: 520 }}>
          <div style={{ fontSize: "clamp(12px, 1.4vw, 16px)", color: colors.gold, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
            Event pages
          </div>
          <div style={{ fontSize: "clamp(26px, 3.5vw, 44px)", fontWeight: 700, color: colors.text, lineHeight: 1.15, marginBottom: 20 }}>
            Content first. <br />
            <span style={{ color: colors.textMuted }}>Not template first.</span>
          </div>
          <div style={{ fontSize: "clamp(13px, 1.5vw, 17px)", color: colors.textSubtle, lineHeight: 1.6, marginBottom: 24, maxWidth: 460 }}>
            Every event page is built around your content. Photos, video, text sections — arranged exactly how you want. No rigid templates. Your event, your story.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Bullet color={colors.gold}>Drag-and-drop sections — media, text, details in any order</Bullet>
            <Bullet color={colors.gold}>Full-bleed photo and video galleries</Bullet>
            <Bullet color={colors.gold}>Custom title styling — fonts, alignment, overlay controls</Bullet>
            <Bullet color={colors.gold}>Mobile-optimized out of the box</Bullet>
          </div>
        </div>
        {/* Phone mockup */}
        <div style={{
          flex: "0 0 auto", width: "clamp(180px, 22vw, 260px)", aspectRatio: "9/19", borderRadius: "clamp(20px, 3vw, 36px)",
          background: "#fff",
          border: `1px solid ${colors.border}`,
          boxShadow: "0 8px 32px rgba(10,10,10,0.08)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          <div style={{ height: "45%", background: colors.surfaceMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "60%", height: "60%", borderRadius: 8, background: colors.surface, border: `1px solid ${colors.border}` }} />
          </div>
          <div style={{ padding: "0 12%", flex: 1, paddingTop: 12 }}>
            <div style={{ height: 8, width: "70%", borderRadius: 4, background: colors.surfaceMuted, marginBottom: 6 }} />
            <div style={{ height: 6, width: "50%", borderRadius: 3, background: colors.surface, marginBottom: 16 }} />
            <div style={{ height: 5, width: "100%", borderRadius: 3, background: colors.surface, marginBottom: 4 }} />
            <div style={{ height: 5, width: "90%", borderRadius: 3, background: colors.surface, marginBottom: 4 }} />
            <div style={{ height: 5, width: "60%", borderRadius: 3, background: colors.surface, marginBottom: 16 }} />
            <div style={{ height: 28, borderRadius: 8, background: "rgba(180,83,9,0.12)" }} />
          </div>
        </div>
      </div>
    ),
  },

  // 3 — Event creation deep dive
  {
    bg: "#fafafa",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "0 8%" }}>
        <div style={{ fontSize: "clamp(12px, 1.4vw, 16px)", color: colors.success, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
          Create
        </div>
        <div style={{ fontSize: "clamp(24px, 3.5vw, 42px)", fontWeight: 700, color: colors.text, lineHeight: 1.2, marginBottom: 28 }}>
          Everything you need. Nothing you don't.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(clamp(200px, 28vw, 320px), 1fr))", gap: 10, maxWidth: 1000 }}>
          <FeatureCard title="Smart capacity" desc="Set list and dinner capacity separately. Automatic waitlist when full — guests get notified when spots open." />
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
    bg: "#ffffff",
    render: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 6%", gap: "5%" }}>
        {/* Check-in mockup */}
        <div style={{
          flex: "0 0 auto", width: "clamp(200px, 24vw, 300px)", borderRadius: 20,
          background: "rgba(22,163,74,0.04)",
          border: "1px solid rgba(22,163,74,0.18)",
          boxShadow: "0 4px 20px rgba(10,10,10,0.08)",
          padding: "clamp(16px, 2.5vw, 28px)",
        }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: "clamp(14px, 1.6vw, 18px)", fontWeight: 700, color: colors.text }}>Sarah Chen</div>
            <div style={{ fontSize: "clamp(11px, 1.1vw, 13px)", color: colors.textMuted, marginTop: 2 }}>3 guests expected</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: colors.surfaceMuted, border: `1px solid ${colors.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: colors.text, fontSize: 20, fontWeight: 600 }}>-</div>
            <div style={{ fontSize: "clamp(28px, 3.5vw, 36px)", fontWeight: 700, color: colors.text }}>2<span style={{ fontSize: "0.5em", color: colors.textMuted }}>/3</span></div>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: colors.surfaceMuted, border: `1px solid ${colors.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: colors.text, fontSize: 20, fontWeight: 600 }}>+</div>
          </div>
          <div style={{ height: 36, borderRadius: 10, background: colors.success, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "clamp(12px, 1.3vw, 14px)", fontWeight: 700 }}>
            Check in 2/3
          </div>
        </div>
        <div style={{ flex: 1, maxWidth: 480 }}>
          <div style={{ fontSize: "clamp(12px, 1.4vw, 16px)", color: colors.success, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
            At the door
          </div>
          <div style={{ fontSize: "clamp(24px, 3.5vw, 42px)", fontWeight: 700, color: colors.text, lineHeight: 1.2, marginBottom: 20 }}>
            Check-in that<br />just works
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Bullet color={colors.success}>Search guests instantly — tap to check in</Bullet>
            <Bullet color={colors.success}>Track party sizes — know exactly who arrived out of how many</Bullet>
            <Bullet color={colors.success}>Made a mistake? Tap to undo — adjust the count down</Bullet>
            <Bullet color={colors.success}>Reception role — give door staff check-in access without editing power</Bullet>
            <Bullet color={colors.success}>Works on any phone — no app install needed</Bullet>
          </div>
        </div>
      </div>
    ),
  },

  // 5 — CRM
  {
    bg: "#fafafa",
    render: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 6%", gap: "5%" }}>
        <div style={{ flex: 1, maxWidth: 480 }}>
          <div style={{ fontSize: "clamp(12px, 1.4vw, 16px)", color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
            CRM
          </div>
          <div style={{ fontSize: "clamp(24px, 3.5vw, 42px)", fontWeight: 700, color: colors.text, lineHeight: 1.2, marginBottom: 10 }}>
            Your audience,<br />across every event
          </div>
          <div style={{ fontSize: "clamp(13px, 1.5vw, 17px)", color: colors.textSubtle, lineHeight: 1.6, marginBottom: 24, maxWidth: 420 }}>
            Every RSVP builds your contact database automatically. See who comes back, who brings friends, and who engages.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Bullet color="#7c3aed">Unified guest profiles — attendance history across all events</Bullet>
            <Bullet color="#7c3aed">See total events attended, party sizes, no-show rate per person</Bullet>
            <Bullet color="#7c3aed">Tag and segment your audience for targeted outreach</Bullet>
            <Bullet color="#7c3aed">Every new event grows your database — zero extra work</Bullet>
          </div>
        </div>
        {/* CRM mockup */}
        <div style={{
          flex: "0 0 auto", width: "clamp(240px, 30vw, 380px)", borderRadius: 16,
          background: "#fff",
          border: `1px solid ${colors.border}`,
          boxShadow: "0 4px 20px rgba(10,10,10,0.08)",
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
              borderBottom: i < 4 ? `1px solid ${colors.border}` : "none",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: `rgba(124,58,237,${0.08 + i * 0.04})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 600, color: "#7c3aed",
              }}>{p.name[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 500, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                <div style={{ fontSize: "clamp(9px, 1vw, 11px)", color: colors.textMuted }}>{p.events} events attended</div>
              </div>
              <span style={{
                fontSize: 9, padding: "2px 7px", borderRadius: 999, fontWeight: 600,
                background: p.label === "VIP" ? "rgba(180,83,9,0.10)" : p.label === "Regular" ? "rgba(22,163,74,0.10)" : colors.surfaceMuted,
                color: p.label === "VIP" ? colors.gold : p.label === "Regular" ? colors.success : colors.textMuted,
                border: p.label === "VIP" ? "1px solid rgba(180,83,9,0.20)" : p.label === "Regular" ? "1px solid rgba(22,163,74,0.20)" : `1px solid ${colors.border}`,
              }}>{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 6 — Email campaigns
  {
    bg: "#ffffff",
    render: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 6%", gap: "5%" }}>
        {/* Email mockup */}
        <div style={{
          flex: "0 0 auto", width: "clamp(220px, 26vw, 320px)", borderRadius: 16,
          background: "#fafafa",
          border: `1px solid ${colors.border}`,
          boxShadow: "0 4px 20px rgba(10,10,10,0.08)",
          padding: "clamp(14px, 2vw, 22px)",
        }}>
          <div style={{ fontSize: "clamp(10px, 1vw, 12px)", color: colors.textFaded, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>Campaign</div>
          <div style={{ height: 7, width: "80%", borderRadius: 4, background: colors.surfaceMuted, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[
              { label: "Sent", val: "156", color: colors.textMuted },
              { label: "Opens", val: "52%", color: "#2563eb" },
              { label: "Clicks", val: "24%", color: colors.success },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: "clamp(14px, 1.8vw, 20px)", fontWeight: 700, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 9, color: colors.textFaded }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 10, fontSize: "clamp(9px, 1vw, 11px)", color: colors.textFaded }}>
            <div style={{ marginBottom: 4 }}>Segment: Attended 2+ events</div>
            <div>Tracking: per-recipient opens & clicks</div>
          </div>
        </div>
        <div style={{ flex: 1, maxWidth: 480 }}>
          <div style={{ fontSize: "clamp(12px, 1.4vw, 16px)", color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
            Email campaigns
          </div>
          <div style={{ fontSize: "clamp(24px, 3.5vw, 42px)", fontWeight: 700, color: colors.text, lineHeight: 1.2, marginBottom: 10 }}>
            Reach the right people
          </div>
          <div style={{ fontSize: "clamp(13px, 1.5vw, 17px)", color: colors.textSubtle, lineHeight: 1.6, marginBottom: 24, maxWidth: 420 }}>
            Your CRM data powers targeted campaigns. Segment by attendance history, engagement, or custom tags — then track every open and click.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Bullet color="#2563eb">Segment audiences — regulars, VIPs, first-timers, no-shows</Bullet>
            <Bullet color="#2563eb">Per-recipient tracking — who opened, who clicked, who converted</Bullet>
            <Bullet color="#2563eb">UTM-tagged links — see campaign impact in event analytics</Bullet>
            <Bullet color="#2563eb">VIP invite emails with personal tracking links</Bullet>
          </div>
        </div>
      </div>
    ),
  },

  // 7 — Analytics
  {
    bg: "#fafafa",
    render: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 6%", gap: "5%" }}>
        <div style={{ flex: 1, maxWidth: 480 }}>
          <div style={{ fontSize: "clamp(12px, 1.4vw, 16px)", color: colors.gold, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
            Analytics
          </div>
          <div style={{ fontSize: "clamp(24px, 3.5vw, 42px)", fontWeight: 700, color: colors.text, lineHeight: 1.2, marginBottom: 10 }}>
            See where your guests<br />come from
          </div>
          <div style={{ fontSize: "clamp(13px, 1.5vw, 17px)", color: colors.textSubtle, lineHeight: 1.6, marginBottom: 24, maxWidth: 420 }}>
            Every event page tracks traffic sources automatically. Know which Instagram story drove signups. See if your LinkedIn post converted. Compare channels and double down on what works.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Bullet color={colors.gold}>Source detection — Instagram, Facebook, LinkedIn, Google, direct, referral</Bullet>
            <Bullet color={colors.gold}>Daily source breakdown — stacked bars showing channel mix over time</Bullet>
            <Bullet color={colors.gold}>Full funnel — page views to RSVPs to actual arrivals</Bullet>
            <Bullet color={colors.gold}>Device split — know if your audience is mobile or desktop</Bullet>
          </div>
        </div>
        {/* Analytics mockup */}
        <div style={{
          flex: "0 0 auto", width: "clamp(240px, 28vw, 360px)", borderRadius: 16,
          background: "#fff",
          border: `1px solid ${colors.border}`,
          boxShadow: "0 4px 20px rgba(10,10,10,0.08)",
          padding: "clamp(14px, 2vw, 22px)",
        }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 100, marginBottom: 10 }}>
            {[
              { ig: 5, fb: 2, d: 3 }, { ig: 8, fb: 1, d: 4 }, { ig: 3, fb: 3, d: 2 },
              { ig: 12, fb: 2, d: 5 }, { ig: 6, fb: 4, d: 3 }, { ig: 15, fb: 3, d: 4 },
              { ig: 10, fb: 2, d: 6 }, { ig: 18, fb: 4, d: 5 }, { ig: 8, fb: 3, d: 4 },
              { ig: 14, fb: 2, d: 7 },
            ].map((bar, i) => {
              const maxH = 27;
              const scale = 100 / maxH;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column-reverse", height: "100%" }}>
                  <div style={{ height: bar.d * scale, background: colors.surfaceMuted, borderRadius: "0 0 2px 2px" }} />
                  <div style={{ height: bar.fb * scale, background: "rgba(37,99,235,0.35)" }} />
                  <div style={{ height: bar.ig * scale, background: "rgba(236,23,143,0.55)", borderRadius: "2px 2px 0 0" }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 9, color: colors.textFaded }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: 1, background: "rgba(236,23,143,0.55)" }} /> Instagram</span>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: 1, background: "rgba(37,99,235,0.35)" }} /> Facebook</span>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: 1, background: colors.surfaceMuted }} /> Direct</span>
          </div>
          <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 10, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: "clamp(9px, 1vw, 11px)" }}>
            <span style={{ color: colors.textMuted }}>142 views</span>
            <span style={{ color: colors.success }}>38 RSVPs</span>
            <span style={{ color: colors.gold }}>27% conversion</span>
          </div>
        </div>
      </div>
    ),
  },

  // 8 — Team & roles
  {
    bg: "#ffffff",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "0 8%" }}>
        <div style={{ fontSize: "clamp(12px, 1.4vw, 16px)", color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
          Collaboration
        </div>
        <div style={{ fontSize: "clamp(24px, 3.5vw, 42px)", fontWeight: 700, color: colors.text, lineHeight: 1.2, marginBottom: 28 }}>
          Your team, your rules
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(clamp(200px, 26vw, 300px), 1fr))", gap: 10, maxWidth: 960 }}>
          {[
            { role: "Owner", colorHex: "#b45309", desc: "Full control. Billing, settings, delete. The event is yours." },
            { role: "Admin", colorHex: "#7c3aed", desc: "Everything except billing. Manage guests, edit event, invite team." },
            { role: "Editor", colorHex: "#2563eb", desc: "Edit event details and manage the guest list. No team access." },
            { role: "Reception", colorHex: "#16a34a", desc: "Check-in only. Search guests, mark arrivals. Perfect for door staff." },
            { role: "Analytics", colorHex: "#b45309", desc: "View-only analytics. Share insights without exposing guest data." },
          ].map((r) => (
            <div key={r.role} style={{
              padding: "14px 18px", borderRadius: 14,
              background: "#fff",
              border: `1px solid ${colors.border}`,
              boxShadow: "0 2px 8px rgba(10,10,10,0.04)",
            }}>
              <div style={{ fontSize: "clamp(14px, 1.6vw, 17px)", fontWeight: 700, color: r.colorHex, marginBottom: 4 }}>{r.role}</div>
              <div style={{ fontSize: "clamp(11px, 1.2vw, 14px)", color: colors.textMuted, lineHeight: 1.4 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 9 — Built for
  {
    bg: "#fafafa",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "0 8%" }}>
        <div style={{ fontSize: "clamp(12px, 1.4vw, 16px)", color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, fontWeight: 600 }}>
          Built for
        </div>
        <div style={{ fontSize: "clamp(24px, 3.5vw, 42px)", fontWeight: 700, color: colors.text, lineHeight: 1.2, marginBottom: 28 }}>
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
    bg: "#ffffff",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
        <div style={{
          fontSize: "clamp(36px, 6vw, 72px)", fontWeight: 800, lineHeight: 1.1,
          color: colors.text,
          marginBottom: 16,
        }}>
          Ready to pull up?
        </div>
        <div style={{
          fontSize: "clamp(16px, 2vw, 22px)", color: colors.textMuted, marginBottom: 40, maxWidth: 500,
        }}>
          Start creating events for free. No credit card required.
        </div>
        <a
          href="https://pullup.se"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "16px 48px", borderRadius: 999,
            background: colors.gold,
            color: "#fff", fontSize: "clamp(14px, 1.8vw, 18px)", fontWeight: 700,
            letterSpacing: "0.05em", textTransform: "uppercase",
            textDecoration: "none", display: "inline-block",
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(180,83,9,0.25)"; }}
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
      color: colors.text,
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
                background: i === current ? colors.gold : colors.border,
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
              body { background: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
              @page { size: landscape; margin: 0; }
              .slide { width: 100vw; height: 100vh; page-break-after: always; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; overflow: hidden; }
              .slide:last-child { page-break-after: avoid; }
            </style></head><body><div id="print-root"></div></body></html>`);
            printWin.document.close();
            const root = createRoot(printWin.document.getElementById("print-root"));
            root.render(
              slides.map((s, i) => (
                <div key={i} className="slide" style={{ background: s.bg, color: "#0a0a0a" }}>
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
            color: colors.textFaded,
            fontSize: "11px", fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = colors.textMuted; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = colors.textFaded; }}
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
