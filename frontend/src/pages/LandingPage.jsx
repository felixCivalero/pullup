import { useNavigate } from "react-router-dom";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Calendar,
  Users,
  Mail,
  BarChart3,
  CheckCircle,
  ArrowRight,
  X,
  Sparkles,
  Search,
  MapPin,
  Play,
  Image,
  Share2,
  MousePointerClick,
  Send,
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

/* ─── showcase section data ─── */
const SHOWCASE_SECTIONS = [
  {
    id: "event-pages",
    headline: "Carousels. Video. The full story.",
    sub: "Your events aren't flyers — they're experiences. Build rich event pages with image carousels, embedded video, and everything your audience needs in one place.",
    accent: "#818cf8",
    accentBg: "rgba(129,140,248,0.08)",
    accentBorder: "rgba(129,140,248,0.20)",
    mockType: "event",
  },
  {
    id: "email-campaigns",
    headline: "Your event page becomes the email.",
    sub: "One click turns your event into a beautiful campaign. No templates, no drag-and-drop — your page is the design. Send it to the right people at the right time.",
    accent: "#fbbf24",
    accentBg: "rgba(251,191,36,0.08)",
    accentBorder: "rgba(251,191,36,0.20)",
    mockType: "email",
  },
  {
    id: "analytics",
    headline: "Every open. Every click. Every ticket.",
    sub: "Real-time analytics that show you exactly what's working. Track opens, clicks, ticket sales, and audience growth — all in one dashboard.",
    accent: "#34d399",
    accentBg: "rgba(52,211,153,0.08)",
    accentBorder: "rgba(52,211,153,0.20)",
    mockType: "analytics",
  },
  {
    id: "social",
    headline: "Your event becomes your content.",
    sub: "Every carousel and video you create doubles as ready-to-post stories and reels. One upload, everywhere — from event page to Instagram in one click.",
    accent: "#f472b6",
    accentBg: "rgba(244,114,182,0.08)",
    accentBorder: "rgba(244,114,182,0.20)",
    mockType: "social",
  },
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

const ROTATING_WORDS = ["people", "life", "culture", "art"];

const CAPITAL_CITIES = [
  "Abu Dhabi",
  "Abuja",
  "Accra",
  "Addis Ababa",
  "Algiers",
  "Amman",
  "Amsterdam",
  "Ankara",
  "Antananarivo",
  "Ashgabat",
  "Astana",
  "Asunción",
  "Athens",
  "Baghdad",
  "Baku",
  "Bamako",
  "Bangkok",
  "Beijing",
  "Beirut",
  "Belgrade",
  "Berlin",
  "Bern",
  "Bishkek",
  "Bogotá",
  "Brasília",
  "Bratislava",
  "Brussels",
  "Bucharest",
  "Budapest",
  "Buenos Aires",
  "Cairo",
  "Canberra",
  "Caracas",
  "Chisinau",
  "Copenhagen",
  "Dakar",
  "Damascus",
  "Dhaka",
  "Doha",
  "Dublin",
  "Dushanbe",
  "Freetown",
  "Georgetown",
  "Guatemala City",
  "Hanoi",
  "Harare",
  "Havana",
  "Helsinki",
  "Islamabad",
  "Jakarta",
  "Jerusalem",
  "Kabul",
  "Kampala",
  "Kathmandu",
  "Khartoum",
  "Kigali",
  "Kingston",
  "Kinshasa",
  "Kuala Lumpur",
  "Kuwait City",
  "Kyiv",
  "La Paz",
  "Lima",
  "Lisbon",
  "Ljubljana",
  "London",
  "Luanda",
  "Lusaka",
  "Luxembourg",
  "Madrid",
  "Managua",
  "Manila",
  "Maputo",
  "Mexico City",
  "Minsk",
  "Mogadishu",
  "Monaco",
  "Montevideo",
  "Moscow",
  "Muscat",
  "Nairobi",
  "Nassau",
  "New Delhi",
  "Niamey",
  "Nicosia",
  "Oslo",
  "Ottawa",
  "Panama City",
  "Paris",
  "Phnom Penh",
  "Podgorica",
  "Port-au-Prince",
  "Prague",
  "Pretoria",
  "Pyongyang",
  "Quito",
  "Rabat",
  "Reykjavik",
  "Riga",
  "Riyadh",
  "Rome",
  "San José",
  "San Salvador",
  "Santiago",
  "Santo Domingo",
  "São Tomé",
  "Sarajevo",
  "Seoul",
  "Singapore",
  "Skopje",
  "Sofia",
  "Stockholm",
  "Tallinn",
  "Tashkent",
  "Tbilisi",
  "Tegucigalpa",
  "Tehran",
  "Tirana",
  "Tokyo",
  "Tripoli",
  "Tunis",
  "Ulaanbaatar",
  "Valletta",
  "Vienna",
  "Vientiane",
  "Vilnius",
  "Warsaw",
  "Washington D.C.",
  "Wellington",
  "Windhoek",
  "Yaoundé",
  "Zagreb",
  "Zürich",
];

/* ─── mockup components ─── */
const mockCard = {
  borderRadius: 10,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};

function EventMockup({ accent }) {
  return (
    <div style={{ width: "100%", padding: "clamp(16px, 3vw, 28px)" }}>
      {/* Fake carousel */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 14,
          overflow: "hidden",
        }}
      >
        {[0, 1, 2].map((j) => (
          <div
            key={j}
            style={{
              flex: j === 0 ? "0 0 60%" : "0 0 28%",
              aspectRatio: "4/3",
              borderRadius: 12,
              background:
                j === 0
                  ? `linear-gradient(135deg, ${accent}22, ${accent}08)`
                  : "rgba(255,255,255,0.03)",
              border: `1px solid ${j === 0 ? accent + "30" : "rgba(255,255,255,0.06)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {j === 0 ? (
              <Image
                size={32}
                strokeWidth={1.2}
                style={{ color: accent, opacity: 0.5 }}
              />
            ) : j === 1 ? (
              <Play
                size={24}
                strokeWidth={1.2}
                style={{ color: "rgba(255,255,255,0.2)" }}
              />
            ) : (
              <Image
                size={20}
                strokeWidth={1.2}
                style={{ color: "rgba(255,255,255,0.15)" }}
              />
            )}
          </div>
        ))}
      </div>
      {/* Dots indicator */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 6,
          marginBottom: 16,
        }}
      >
        {[0, 1, 2, 3].map((d) => (
          <div
            key={d}
            style={{
              width: d === 0 ? 18 : 6,
              height: 6,
              borderRadius: 3,
              background: d === 0 ? accent : "rgba(255,255,255,0.15)",
              transition: "width 0.2s",
            }}
          />
        ))}
      </div>
      {/* Fake event info */}
      <div style={{ ...mockCard, padding: "14px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <Calendar size={14} style={{ color: accent, opacity: 0.7 }} />
          <div
            style={{
              height: 8,
              width: 80,
              borderRadius: 4,
              background: "rgba(255,255,255,0.12)",
            }}
          />
        </div>
        <div
          style={{
            height: 6,
            width: "90%",
            borderRadius: 3,
            background: "rgba(255,255,255,0.06)",
            marginBottom: 6,
          }}
        />
        <div
          style={{
            height: 6,
            width: "60%",
            borderRadius: 3,
            background: "rgba(255,255,255,0.04)",
          }}
        />
      </div>
    </div>
  );
}

function EmailMockup({ accent }) {
  return (
    <div style={{ width: "100%", padding: "clamp(16px, 3vw, 28px)" }}>
      {/* Email preview frame */}
      <div
        style={{
          ...mockCard,
          padding: 0,
          overflow: "hidden",
          borderColor: `${accent}25`,
        }}
      >
        {/* Email header bar */}
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <Mail size={13} style={{ color: accent, opacity: 0.7 }} />
          <div style={{ flex: 1 }}>
            <div
              style={{
                height: 6,
                width: 120,
                borderRadius: 3,
                background: "rgba(255,255,255,0.12)",
                marginBottom: 4,
              }}
            />
            <div
              style={{
                height: 4,
                width: 80,
                borderRadius: 2,
                background: "rgba(255,255,255,0.06)",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 9,
              color: "rgba(255,255,255,0.25)",
              whiteSpace: "nowrap",
            }}
          >
            just now
          </span>
        </div>

        {/* Email body — mini event card inside email */}
        <div style={{ padding: "14px 14px 10px" }}>
          {/* Hero image area in email */}
          <div
            style={{
              aspectRatio: "16/7",
              borderRadius: 8,
              background: `linear-gradient(135deg, ${accent}15, ${accent}05)`,
              border: `1px solid ${accent}20`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <Image
              size={24}
              strokeWidth={1}
              style={{ color: accent, opacity: 0.35 }}
            />
            {/* Overlay carousel dots */}
            <div
              style={{
                position: "absolute",
                bottom: 6,
                display: "flex",
                gap: 4,
              }}
            >
              {[0, 1, 2].map((d) => (
                <div
                  key={d}
                  style={{
                    width: d === 0 ? 12 : 4,
                    height: 4,
                    borderRadius: 2,
                    background: d === 0 ? accent : "rgba(255,255,255,0.2)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Event details in email */}
          <div style={{ marginBottom: 10 }}>
            <div
              style={{
                height: 8,
                width: "70%",
                borderRadius: 4,
                background: "rgba(255,255,255,0.14)",
                marginBottom: 6,
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <Calendar size={10} style={{ color: accent, opacity: 0.5 }} />
              <div
                style={{
                  height: 5,
                  width: 90,
                  borderRadius: 3,
                  background: "rgba(255,255,255,0.08)",
                }}
              />
            </div>
            <div
              style={{
                height: 5,
                width: "85%",
                borderRadius: 3,
                background: "rgba(255,255,255,0.05)",
                marginBottom: 4,
              }}
            />
            <div
              style={{
                height: 5,
                width: "55%",
                borderRadius: 3,
                background: "rgba(255,255,255,0.04)",
              }}
            />
          </div>

          {/* CTA button in email */}
          <div
            style={{
              padding: "7px 20px",
              borderRadius: 999,
              background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
              color: "#111",
              fontSize: 10,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Get tickets <ArrowRight size={10} />
          </div>
        </div>
      </div>

      {/* Send stats bar below */}
      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 8,
        }}
      >
        <div
          style={{
            ...mockCard,
            flex: 1,
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Send size={11} style={{ color: accent, opacity: 0.6 }} />
          <div>
            <div
              style={{
                fontSize: 8,
                color: "rgba(255,255,255,0.3)",
                marginBottom: 1,
              }}
            >
              Sent to
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>
              2,847
            </div>
          </div>
        </div>
        <div
          style={{
            ...mockCard,
            flex: 1,
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Users size={11} style={{ color: accent, opacity: 0.6 }} />
          <div>
            <div
              style={{
                fontSize: 8,
                color: "rgba(255,255,255,0.3)",
                marginBottom: 1,
              }}
            >
              Segment
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>
              Music lovers
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsMockup({ accent }) {
  const bars = [35, 52, 44, 68, 82, 60, 75, 90, 70, 85, 95, 78];
  return (
    <div style={{ width: "100%", padding: "clamp(16px, 3vw, 28px)" }}>
      {/* Top stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {[
          { label: "Opens", value: "2,847", change: "+12%" },
          { label: "Clicks", value: "1,203", change: "+8%" },
          { label: "Tickets", value: "384", change: "+24%" },
        ].map((stat) => (
          <div key={stat.label} style={{ ...mockCard, padding: "10px 12px" }}>
            <div
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.35)",
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {stat.label}
            </div>
            <div
              style={{
                fontSize: "clamp(14px, 2vw, 18px)",
                fontWeight: 700,
                color: "#fff",
                marginBottom: 2,
              }}
            >
              {stat.value}
            </div>
            <div style={{ fontSize: 10, color: accent, fontWeight: 600 }}>
              {stat.change}
            </div>
          </div>
        ))}
      </div>
      {/* Bar chart */}
      <div style={{ ...mockCard, padding: "14px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 12,
          }}
        >
          <BarChart3 size={12} style={{ color: accent, opacity: 0.7 }} />
          <span
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.4)",
              fontWeight: 600,
            }}
          >
            Opens over time
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 4,
            height: 60,
          }}
        >
          {bars.map((h, j) => (
            <div
              key={j}
              style={{
                flex: 1,
                height: `${h}%`,
                borderRadius: 3,
                background:
                  j === bars.length - 3
                    ? accent
                    : `linear-gradient(180deg, ${accent}40, ${accent}15)`,
                opacity: j === bars.length - 3 ? 1 : 0.6,
              }}
            />
          ))}
        </div>
      </div>
      {/* Click-through row */}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <div
          style={{
            ...mockCard,
            flex: 1,
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <MousePointerClick
            size={14}
            style={{ color: accent, opacity: 0.6 }}
          />
          <div>
            <div
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.3)",
                marginBottom: 2,
              }}
            >
              Click rate
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
              42.3%
            </div>
          </div>
        </div>
        <div
          style={{
            ...mockCard,
            flex: 1,
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Mail size={14} style={{ color: accent, opacity: 0.6 }} />
          <div>
            <div
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.3)",
                marginBottom: 2,
              }}
            >
              Delivered
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
              98.1%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SocialMockup({ accent }) {
  return (
    <div style={{ width: "100%", padding: "clamp(16px, 3vw, 28px)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Phone frame 1 — Story preview */}
        <div
          style={{
            aspectRatio: "9/16",
            borderRadius: 20,
            border: `1px solid ${accent}25`,
            background: `linear-gradient(180deg, ${accent}10, rgba(255,255,255,0.02))`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Story UI elements */}
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 0,
              right: 0,
              display: "flex",
              gap: 3,
              padding: "0 10px",
            }}
          >
            {[0, 1, 2].map((b) => (
              <div
                key={b}
                style={{
                  flex: 1,
                  height: 2,
                  borderRadius: 1,
                  background: b === 0 ? "#fff" : "rgba(255,255,255,0.2)",
                }}
              />
            ))}
          </div>
          <Image
            size={36}
            strokeWidth={1}
            style={{ color: accent, opacity: 0.4, marginBottom: 8 }}
          />
          <span
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.35)",
              textAlign: "center",
            }}
          >
            Your carousel
            <br />
            as a story
          </span>
          {/* Swipe up hint */}
          <div
            style={{
              position: "absolute",
              bottom: 12,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <div
              style={{
                width: 20,
                height: 3,
                borderRadius: 2,
                background: "rgba(255,255,255,0.3)",
              }}
            />
            <span
              style={{
                fontSize: 8,
                color: "rgba(255,255,255,0.25)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              swipe up
            </span>
          </div>
        </div>

        {/* Phone frame 2 — Reel preview */}
        <div
          style={{
            aspectRatio: "9/16",
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.02)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Play
            size={36}
            strokeWidth={1}
            style={{ color: accent, opacity: 0.4, marginBottom: 8 }}
          />
          <span
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.35)",
              textAlign: "center",
            }}
          >
            Your video
            <br />
            as a reel
          </span>
          {/* Social icons bar */}
          <div
            style={{
              position: "absolute",
              bottom: 12,
              right: 10,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignItems: "center",
            }}
          >
            <Share2 size={16} style={{ color: "rgba(255,255,255,0.3)" }} />
            <Mail size={16} style={{ color: "rgba(255,255,255,0.3)" }} />
          </div>
        </div>
      </div>
      {/* Share bar below phones */}
      <div
        style={{
          marginTop: 14,
          ...mockCard,
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Share2 size={14} style={{ color: accent, opacity: 0.7 }} />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          Share to
        </span>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          {["Instagram", "TikTok", "Stories"].map((p) => (
            <span
              key={p}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                background:
                  p === "Instagram" ? `${accent}18` : "rgba(255,255,255,0.04)",
                border: `1px solid ${p === "Instagram" ? accent + "30" : "rgba(255,255,255,0.08)"}`,
                fontSize: 10,
                color: p === "Instagram" ? accent : "rgba(255,255,255,0.35)",
                fontWeight: 500,
              }}
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
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

/* ─── showcase section with scroll reveal ─── */
function ShowcaseSection({ section, index, sp }) {
  const [ref, visible] = useReveal(0.12);
  const reversed = index % 2 === 1;

  const textFrom = reversed ? 30 : -30;
  const mockFrom = reversed ? -30 : 30;

  return (
    <section
      ref={ref}
      id={section.id}
      style={{
        ...sp,
        maxWidth: 1100,
        paddingTop:
          index === 0 ? "clamp(20px, 4vh, 40px)" : "clamp(40px, 6vh, 72px)",
        paddingBottom: "clamp(40px, 6vh, 72px)",
      }}
    >
      <div
        className="showcase-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "clamp(32px, 5vw, 64px)",
          alignItems: "center",
        }}
      >
        {/* ── Text side ── */}
        <div
          style={{
            order: reversed ? 2 : 1,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            transform: visible ? "translateX(0)" : `translateX(${textFrom}px)`,
            opacity: visible ? 1 : 0,
            transition:
              "transform 0.7s cubic-bezier(0.16,1,0.3,1), opacity 0.7s ease",
          }}
        >
          <h2
            style={{
              fontSize: "clamp(26px, 4vw, 40px)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            {section.headline}
          </h2>
          <p
            style={{
              fontSize: "clamp(14px, 1.5vw, 16px)",
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.5)",
              margin: 0,
              maxWidth: 420,
            }}
          >
            {section.sub}
          </p>
        </div>

        {/* ── Image / mockup side ── */}
        <div
          style={{
            order: reversed ? 1 : 2,
            position: "relative",
            transform: visible
              ? "translateX(0) translateY(0)"
              : `translateX(${mockFrom}px) translateY(16px)`,
            opacity: visible ? 1 : 0,
            transition:
              "transform 0.8s cubic-bezier(0.16,1,0.3,1) 0.15s, opacity 0.8s ease 0.15s",
          }}
        >
          {/* Glow behind mockup */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "80%",
              height: "80%",
              borderRadius: "50%",
              background: `radial-gradient(circle, ${section.accentBg} 0%, transparent 70%)`,
              pointerEvents: "none",
              filter: "blur(40px)",
              opacity: visible ? 1 : 0,
              transition: "opacity 1.2s ease 0.3s",
            }}
          />
          {/* Mockup container */}
          <div
            style={{
              position: "relative",
              aspectRatio: section.mockType === "social" ? "auto" : "4/3",
              borderRadius: 16,
              border: `1px solid ${section.accentBorder}`,
              background: "rgba(255,255,255,0.02)",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {section.mockType === "event" && (
              <EventMockup accent={section.accent} />
            )}
            {section.mockType === "email" && (
              <EmailMockup accent={section.accent} />
            )}
            {section.mockType === "analytics" && (
              <AnalyticsMockup accent={section.accent} />
            )}
            {section.mockType === "social" && (
              <SocialMockup accent={section.accent} />
            )}
          </div>
        </div>
      </div>
    </section>
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

  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState(null);
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [newsletterPopup, setNewsletterPopup] = useState(null);
  const [consentChecked, setConsentChecked] = useState(false);

  const [scrolled, setScrolled] = useState(false);

  const [selectedCities, setSelectedCities] = useState([]);
  const [citySearch, setCitySearch] = useState("");
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const cityDropdownRef = useRef(null);

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
    publicFetch("/t/pageview", {
      method: "POST",
      body: JSON.stringify({ page: "landing" }),
    }).catch(() => {});
  }, []);

  // Don't auto-redirect logged-in users — let them browse the landing page.
  // EXCEPT: if they just completed an OAuth flow (tokens in URL), send them
  // straight to the dashboard so they don't have to click Login again.
  useEffect(() => {
    if (!user) return;
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const justCompletedOAuth =
      hash.includes("access_token") ||
      hash.includes("refresh_token") ||
      search.includes("code=");
    if (justCompletedOAuth) {
      navigate("/events", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        cityDropdownRef.current &&
        !cityDropdownRef.current.contains(e.target)
      ) {
        setShowCityDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleCity = (city) => {
    setSelectedCities((prev) =>
      prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city],
    );
  };

  const filteredCities = CAPITAL_CITIES.filter(
    (c) =>
      c.toLowerCase().includes(citySearch.toLowerCase()) &&
      !selectedCities.includes(c),
  );

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
      await signInWithGoogle("/events");
    } catch {
      setFormError("Google sign-in failed. Please try again.");
      setSigningIn(false);
    }
  };

  /* ─── newsletter ─── */
  const handleNewsletterSubmit = async (e) => {
    e.preventDefault();
    if (newsletterSubmitting) return;
    setNewsletterStatus(null);
    setNewsletterPopup(null);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newsletterEmail.trim())) {
      setNewsletterStatus("Enter a valid email address.");
      return;
    }
    if (selectedCities.length === 0) {
      setNewsletterStatus("Pick at least one city.");
      return;
    }
    if (selectedInterests.length === 0) {
      setNewsletterStatus("Select at least one interest.");
      return;
    }
    if (!consentChecked) {
      setNewsletterStatus("You must agree to the terms.");
      return;
    }
    trackEvent("landing_newsletter_submit", {
      email_present: !!newsletterEmail,
      interests: selectedInterests,
    });
    try {
      setNewsletterSubmitting(true);
      const response = await authenticatedFetch("/newsletter", {
        method: "POST",
        body: JSON.stringify({
          email: newsletterEmail.trim(),
          source: "landing_newsletter",
          interests: selectedInterests,
          cities: selectedCities,
          consent: consentChecked,
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
        let message = "Couldn't sign you up. Try again soon.";
        if (code === "invalid_email") message = "Enter a valid email address.";
        else if (code === "rate_limited")
          message = "Too many attempts. Wait a moment.";
        else if (code === "suppressed")
          message = "We can't subscribe this address right now.";
        setNewsletterStatus(message);
        setNewsletterPopup({
          type: "error",
          title: "Couldn't sign you up",
          message,
        });
        return;
      }
      const status = payload?.status || "subscribed";
      let message = "You're in. Watch your inbox.";
      let title = "Subscribed";
      if (status === "already_subscribed") {
        title = "Already subscribed";
        message = "You're already in.";
      } else if (status === "resubscribed") {
        title = "Welcome back";
        message = "Welcome back. Invites incoming.";
      }
      setNewsletterStatus(message);
      setNewsletterPopup({ type: "success", title, message });
      setNewsletterEmail("");
      setSelectedInterests([]);
      setSelectedCities([]);
      setConsentChecked(false);
    } catch {
      const message = "Couldn't sign you up. Try again soon.";
      setNewsletterStatus(message);
      setNewsletterPopup({
        type: "error",
        title: "Couldn't sign you up",
        message,
      });
    } finally {
      setNewsletterSubmitting(false);
    }
  };

  const toggleInterest = (id) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
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

  const sp = {
    padding: "clamp(40px, 6vh, 72px) clamp(16px, 5vw, 40px)",
    maxWidth: 1100,
    margin: "0 auto",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: colors.background,
        color: "#fff",
        overflowX: "hidden",
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
        @media (max-width: 720px) {
          .showcase-grid { grid-template-columns: 1fr !important; }
          .showcase-grid > * { order: unset !important; }
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
          onClick={() => (user ? navigate("/events") : setShowAuth(true))}
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
          height: "calc(100dvh - 80px)",
          maxHeight: 720,
          minHeight: 400,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "72px clamp(20px, 5vw, 40px) 48px",
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
            The platform for people who make{" "}
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
            onClick={() => (user ? navigate("/events") : setShowAuth(true))}
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
            Start hosting <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* ─── SHOWCASE SECTIONS ─── */}
      {SHOWCASE_SECTIONS.map((section, i) => (
        <React.Fragment key={section.id}>
          <ShowcaseSection section={section} index={i} sp={sp} />
          {i === 1 && (
            <Reveal>
              <div
                style={{
                  textAlign: "center",
                  padding: "clamp(48px, 8vh, 80px) 20px",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      width: "clamp(32px, 8vw, 64px)",
                      height: 1,
                      background:
                        "linear-gradient(90deg, transparent, rgba(251,191,36,0.3))",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "clamp(16px, 3vw, 22px)",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    Yes it's free
                  </span>
                  <div
                    style={{
                      width: "clamp(32px, 8vw, 64px)",
                      height: 1,
                      background:
                        "linear-gradient(270deg, transparent, rgba(251,191,36,0.3))",
                    }}
                  />
                </div>
              </div>
            </Reveal>
          )}
        </React.Fragment>
      ))}

      {/* ─── FINAL CTA ─── */}
      <Reveal>
        <section
          style={{
            ...sp,
            textAlign: "center",
            paddingBottom: "clamp(48px, 8vh, 80px)",
          }}
        >
          <h2
            style={{
              fontSize: "clamp(24px, 5vw, 38px)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              marginBottom: 12,
            }}
          >
            You create the{" "}
            <span
              style={{
                background: colors.gradientPrimary,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              culture
            </span>
          </h2>

          <button
            onClick={() => (user ? navigate("/events") : setShowAuth(true))}
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
            Start hosting <ArrowRight size={18} />
          </button>
        </section>
      </Reveal>

      {/* ─── FOOTER ─── */}
      <footer
        style={{
          position: "relative",
          overflow: "hidden",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.01) 0%, rgba(255,255,255,0.03) 100%)",
          padding:
            "clamp(36px, 6vh, 56px) clamp(16px, 5vw, 40px) clamp(20px, 3vh, 32px)",
        }}
      >
        {/* Ambient gold glow */}
        <div
          style={{
            position: "absolute",
            top: "-40%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(600px, 90vw)",
            height: 300,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(192,192,192,0.06) 0%, rgba(192,192,192,0.02) 40%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div
          id="newsletter"
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 520,
            margin: "0 auto 24px",
            textAlign: "center",
          }}
        >
          {/* Mini rotating headline */}
          <div
            style={{
              fontSize: "clamp(22px, 3.5vw, 32px)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.3,
              margin: "0 0 10px",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.15em",
            }}
          >
            <span
              style={{
                background: colors.gradientPrimary,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Newsletter for
            </span>
            <span
              style={{
                display: "inline-block",
                WebkitPerspective: "400px",
                perspective: "400px",
                height: "1.25em",
                width: "3.6em",
                position: "relative",
              }}
            >
              <span
                style={{
                  display: "block",
                  height: "1.25em",
                  width: "100%",
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
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "1.25em",
                        padding: "0 0.3em",
                        boxSizing: "border-box",
                        WebkitBackfaceVisibility: "hidden",
                        backfaceVisibility: "hidden",
                        background:
                          "linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(/camo.png) center/cover",
                        boxShadow:
                          "inset 0 0 0 1px rgba(255,255,255,0.08), 0 2px 8px rgba(0,0,0,0.4)",
                        borderRadius: "0.12em",
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
                          color: "transparent",
                        }}
                      >
                        {word}
                      </span>
                    </span>
                  );
                })}
              </span>
            </span>
          </div>

          {/* Newsletter heading */}
          <p
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.45)",
              margin: "0 0 20px",
              lineHeight: 1.4,
            }}
          >
            Get{" "}
            <span
              style={{
                background: colors.gradientGold,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              weekly updates
            </span>{" "}
            with all{" "}
            <span
              style={{
                background: colors.gradientGold,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              culture in your city
            </span>
          </p>

          {/* ─── Form card ─── */}
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 16,
              padding: "20px 20px 18px",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.3)",
                margin: "0 0 8px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 600,
                textAlign: "left",
              }}
            >
              Your cities
            </p>

            {/* City picker */}
            <div
              ref={cityDropdownRef}
              style={{ position: "relative", marginBottom: 16 }}
            >
              {/* Selected city tags */}
              {selectedCities.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginBottom: 8,
                  }}
                >
                  {selectedCities.map((city) => (
                    <span
                      key={city}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 10px",
                        borderRadius: "999px",
                        background: "rgba(255,255,255,0.1)",
                        border: "1px solid rgba(255,255,255,0.2)",
                        color: "rgba(255,255,255,0.85)",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      <MapPin size={10} style={{ opacity: 0.7 }} />
                      {city}
                      <button
                        type="button"
                        onClick={() => toggleCity(city)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "rgba(255,255,255,0.4)",
                          cursor: "pointer",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Search input */}
              <div style={{ position: "relative" }}>
                <Search
                  size={14}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "rgba(255,255,255,0.3)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  type="text"
                  value={citySearch}
                  onChange={(e) => {
                    setCitySearch(e.target.value);
                    setShowCityDropdown(true);
                  }}
                  onFocus={() => setShowCityDropdown(true)}
                  placeholder="Add your city..."
                  style={{
                    ...inputStyle,
                    paddingLeft: 32,
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    padding: "10px 14px 10px 32px",
                    fontSize: 13,
                    borderRadius: 12,
                    width: "100%",
                  }}
                />
              </div>

              {/* Dropdown */}
              {showCityDropdown && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    maxHeight: 200,
                    overflowY: "auto",
                    marginTop: 4,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(10,8,18,0.97)",
                    backdropFilter: "blur(16px)",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
                    zIndex: 10,
                  }}
                >
                  {filteredCities.length === 0 ? (
                    <div
                      style={{
                        padding: "12px 16px",
                        fontSize: 12,
                        color: "rgba(255,255,255,0.3)",
                        textAlign: "center",
                      }}
                    >
                      {citySearch ? "No cities found" : "All cities selected"}
                    </div>
                  ) : (
                    filteredCities.slice(0, 50).map((city) => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => {
                          toggleCity(city);
                          setCitySearch("");
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          padding: "9px 14px",
                          background: "none",
                          border: "none",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          color: "rgba(255,255,255,0.7)",
                          fontSize: 13,
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            "rgba(255,255,255,0.06)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "none";
                        }}
                      >
                        <MapPin
                          size={12}
                          style={{ opacity: 0.5, flexShrink: 0 }}
                        />
                        {city}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <p
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.3)",
                margin: "0 0 8px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 600,
                textAlign: "left",
              }}
            >
              Interests
            </p>

            {/* Interest pills */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 16,
              }}
            >
              {INTEREST_OPTIONS.map((opt) => {
                const active = selectedInterests.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleInterest(opt.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "5px 12px",
                      borderRadius: "999px",
                      border: active
                        ? "1px solid rgba(255,255,255,0.25)"
                        : "1px solid rgba(255,255,255,0.08)",
                      background: active
                        ? "rgba(255,255,255,0.1)"
                        : "rgba(255,255,255,0.03)",
                      color: active
                        ? "rgba(255,255,255,0.9)"
                        : "rgba(255,255,255,0.4)",
                      fontSize: 12,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      fontWeight: 500,
                    }}
                  >
                    <CheckCircle
                      size={10}
                      style={{ opacity: active ? 1 : 0, flexShrink: 0 }}
                    />
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.06)",
                margin: "0 0 14px",
              }}
            />

            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 12,
                color: "rgba(255,255,255,0.4)",
                margin: "0 0 12px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                style={{ marginTop: 2, accentColor: "#fbbf24", flexShrink: 0 }}
              />
              <span>
                I agree to the{" "}
                <a
                  href="/terms"
                  target="_blank"
                  style={{
                    color: "rgba(255,255,255,0.6)",
                    textDecoration: "underline",
                  }}
                >
                  terms
                </a>{" "}
                and{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  style={{
                    color: "rgba(255,255,255,0.6)",
                    textDecoration: "underline",
                  }}
                >
                  privacy policy
                </a>
              </span>
            </label>

            {/* Email form */}
            <form
              onSubmit={handleNewsletterSubmit}
              style={{ display: "flex", gap: 8 }}
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
                  ...inputStyle,
                  flex: 1,
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  padding: "12px 14px",
                  fontSize: 13,
                  borderRadius: 12,
                }}
              />
              <button
                type="submit"
                disabled={newsletterSubmitting}
                style={{
                  padding: "12px 22px",
                  borderRadius: 12,
                  border: "none",
                  background: colors.gradientGold,
                  color: "#111",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: newsletterSubmitting ? "wait" : "pointer",
                  whiteSpace: "nowrap",
                  opacity: newsletterSubmitting ? 0.6 : 1,
                  transition: "opacity 0.15s",
                  boxShadow: "0 4px 16px rgba(245,158,11,0.2)",
                }}
              >
                {newsletterSubmitting ? "Joining..." : "Subscribe"}
              </button>
            </form>

            {newsletterStatus && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.45)",
                }}
              >
                {newsletterStatus}
              </div>
            )}
          </div>
          {/* end form card */}
        </div>

        <div
          style={{
            position: "relative",
            zIndex: 1,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            paddingTop: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "clamp(12px, 3vw, 24px)",
            flexWrap: "wrap",
            fontSize: 11,
            color: "rgba(255,255,255,0.2)",
          }}
        >
          <span>pullup &copy; {new Date().getFullYear()}</span>
          <span style={{ opacity: 0.3 }}>&middot;</span>
          <a
            href="/privacy"
            style={{ color: "rgba(255,255,255,0.25)", textDecoration: "none" }}
          >
            Privacy
          </a>
          <a
            href="/terms"
            style={{ color: "rgba(255,255,255,0.25)", textDecoration: "none" }}
          >
            Terms
          </a>
          <a
            href="/cookies"
            style={{ color: "rgba(255,255,255,0.25)", textDecoration: "none" }}
          >
            Cookies
          </a>
          <span style={{ opacity: 0.3 }}>&middot;</span>
          <a
            href="mailto:hello@pullup.se"
            style={{ color: "rgba(255,255,255,0.25)", textDecoration: "none" }}
          >
            hello@pullup.se
          </a>
        </div>
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
                }}
              >
                <input
                  type="checkbox"
                  checked={authConsent}
                  onChange={(e) => setAuthConsent(e.target.checked)}
                  style={{
                    accentColor: "#fbbf24",
                    flexShrink: 0,
                    width: 15,
                    height: 15,
                  }}
                />
                <span>
                  I agree to the{" "}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener"
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

      {/* ─── NEWSLETTER POPUP ─── */}
      {newsletterPopup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
            padding: 24,
          }}
          onClick={() => setNewsletterPopup(null)}
        >
          <div
            style={{
              maxWidth: 340,
              width: "100%",
              borderRadius: 20,
              background:
                "linear-gradient(145deg, rgba(11,10,20,0.98), rgba(17,15,30,0.98))",
              boxShadow: "0 24px 60px rgba(0,0,0,0.85)",
              border: "1px solid rgba(255,255,255,0.12)",
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 8,
                color:
                  newsletterPopup.type === "success"
                    ? "#fff"
                    : "rgba(255,180,180,0.96)",
              }}
            >
              {newsletterPopup.title}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.7)",
                marginBottom: 20,
                lineHeight: 1.5,
              }}
            >
              {newsletterPopup.message}
            </div>
            <button
              type="button"
              onClick={() => setNewsletterPopup(null)}
              style={{
                width: "100%",
                padding: "12px 0",
                borderRadius: "999px",
                border: "none",
                background: colors.gradientGold,
                color: "#111",
                fontSize: 13,
                fontWeight: 700,
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
