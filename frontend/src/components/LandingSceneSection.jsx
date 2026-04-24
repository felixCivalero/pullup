import React from "react";

const EVENTS = [
  {
    title: "Vernissage: Colors of May",
    meta: "Stockholm · Fri",
    image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&q=70",
  },
  {
    title: "Rooftop listening session",
    meta: "Stockholm · Sat",
    image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&q=70",
  },
  {
    title: "Late dinner, Södermalm",
    meta: "Stockholm · Sun",
    image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=70",
  },
  {
    title: "Film screening + Q&A",
    meta: "Göteborg · Thu",
    image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&q=70",
  },
  {
    title: "Winter swim + sauna",
    meta: "Malmö · Sat",
    image: "https://images.unsplash.com/photo-1540962351504-03099e0a754b?w=800&q=70",
  },
  {
    title: "Studio opening",
    meta: "Stockholm · Fri",
    image: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&q=70",
  },
];

function Card({ event }) {
  return (
    <div
      className="landing-scene-card"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          aspectRatio: "16 / 10",
          background: `url(${event.image}) center/cover no-repeat, rgba(255,255,255,0.04)`,
        }}
      />
      <div style={{ padding: "12px 14px 14px" }}>
        <div
          style={{
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {event.title}
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.55)",
            fontSize: 13,
            marginTop: 4,
          }}
        >
          {event.meta}
        </div>
      </div>
    </div>
  );
}

export default function LandingSceneSection({ onSignupClick }) {
  return (
    <section
      id="live-on-pullup"
      style={{
        padding: "80px 24px 96px",
        maxWidth: 1160,
        margin: "0 auto",
      }}
    >
      {/* margin: 0 -24px below must match the section's horizontal padding (24px) so cards bleed to the viewport edge */}
      <style>{`
        @media (max-width: 720px) {
          .landing-scene-grid {
            display: flex !important;
            grid-template-columns: unset !important;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            gap: 12px;
            padding: 0 16px;
            margin: 0 -24px;
            scrollbar-width: none;
          }
          .landing-scene-grid::-webkit-scrollbar { display: none; }
          .landing-scene-grid > * {
            flex: 0 0 80%;
            scroll-snap-align: center;
          }
        }
      `}</style>
      <div
        style={{
          textAlign: "center",
          marginBottom: 36,
          color: "rgba(255,255,255,0.55)",
          fontSize: 13,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        ─── Live on PullUp ───
      </div>

      <div
        className="landing-scene-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
        }}
      >
        {EVENTS.map((e) => (
          <Card key={e.title} event={e} />
        ))}
      </div>

      <div style={{ textAlign: "center", marginTop: 48 }}>
        <button
          type="button"
          onClick={onSignupClick}
          style={{
            background: "#f4c24a",
            color: "#111",
            border: "none",
            padding: "16px 28px",
            fontSize: 16,
            fontWeight: 600,
            borderRadius: 999,
            cursor: "pointer",
            letterSpacing: "-0.01em",
          }}
        >
          Create your account →
        </button>
      </div>
    </section>
  );
}
