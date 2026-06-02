// PullUpPage — the threshold. A guest scanned the host's live rotating QR and
// landed here (/p/:eventId?w=&s=). This is NOT a "✓ registered" receipt: it's a
// door. The locked state shows the PROMISE (counts, never content); the scan
// confirm carries the welcome; the interior reveals itself IN PLACE. You're in,
// here's the room you just earned.
//
// Identity: we resolve by the email they RSVP'd with (mint a node for true
// walk-ins). Session-first one-tap is a future enhancement.

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { publicFetch } from "../lib/api.js";

const INK = "#f5f4f7";
const MUTED = "rgba(245,244,247,0.55)";
const FAINT = "rgba(245,244,247,0.35)";
const PINK = "#ec178f";
const CARD = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.10)";

const wrap = {
  minHeight: "100dvh",
  background: "#08070d",
  color: INK,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
};
const card = {
  width: "100%",
  maxWidth: 440,
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 20,
  padding: "28px 24px",
};

function Stat({ value, label }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>{value}</div>
      <div style={{ fontSize: 11, color: FAINT, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function PullUpPage() {
  const { eventId } = useParams();
  const [params] = useSearchParams();
  const w = params.get("w");
  const s = params.get("s");

  const [teaser, setTeaser] = useState(null);
  const [phase, setPhase] = useState("locked"); // locked | verifying | unlocked | expired | error
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [interior, setInterior] = useState(null);

  // Load the teaser (counts only — the promise, never the contents).
  useEffect(() => {
    let alive = true;
    publicFetch(`/p/${eventId}/teaser`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d && setTeaser(d))
      .catch(() => {});
    return () => { alive = false; };
  }, [eventId]);

  async function pullUp(e) {
    e?.preventDefault();
    if (!email.trim()) { setError("Pop in the email you RSVP'd with."); return; }
    if (!w || !s) { setPhase("expired"); return; }
    setPhase("verifying");
    setError("");
    try {
      const res = await publicFetch(`/p/${eventId}/pullup`, {
        method: "POST",
        body: JSON.stringify({ w: Number(w), s, email: email.trim(), name: name.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        // Door opens — fetch the interior we just earned.
        const intRes = await publicFetch(`/p/${eventId}/interior?email=${encodeURIComponent(email.trim())}`);
        const intData = intRes.ok ? await intRes.json().catch(() => null) : null;
        setInterior(intData);
        setPhase("unlocked");
      } else if (res.status === 410 || data.reason === "expired") {
        setPhase("expired");
      } else if (data.reason === "needs_identify") {
        setError("Pop in the email you RSVP'd with.");
        setPhase("locked");
      } else {
        setError("Couldn't read that code. Scan the host's screen again.");
        setPhase("locked");
      }
    } catch {
      setError("Something went wrong. Try the scan again.");
      setPhase("locked");
    }
  }

  // ── The room, opened ──────────────────────────────────────────────────
  if (phase === "unlocked") {
    const others = interior?.coPresent?.length ?? Math.max((teaser?.peopleInside || 1) - 1, 0);
    const photos = interior?.photoCount ?? teaser?.photoCount ?? 0;
    return (
      <div style={wrap}>
        <div style={{ ...card, animation: "pu-open 600ms cubic-bezier(0.16,1,0.3,1)" }}>
          <style>{`@keyframes pu-open{0%{opacity:0;transform:translateY(10px) scale(0.98)}100%{opacity:1;transform:none}}`}</style>
          <div style={{ fontSize: 13, color: PINK, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>You're in</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", margin: "8px 0 6px" }}>
            You pulled up.
          </h1>
          <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.5, margin: "0 0 22px" }}>
            This is the room you just earned — only people who showed up are inside.
          </p>

          <div style={{ display: "flex", justifyContent: "space-around", padding: "18px 0", borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
            <Stat value={others} label={others === 1 ? "person here" : "people here"} />
            <Stat value={photos} label={photos === 1 ? "photo" : "photos"} />
          </div>

          {interior?.coPresent?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, color: FAINT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Who else pulled up</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {interior.coPresent.slice(0, 12).map((p) => (
                  <span key={p.id} style={{ fontSize: 13, padding: "5px 11px", borderRadius: 999, background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}` }}>
                    {p.name || "Someone"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {interior?.photos?.length > 0 && (
            <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
              {interior.photos.slice(0, 6).map((ph) => (
                <div key={ph.id} style={{ aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,0.05)" }}>
                  {ph.url && <img src={ph.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === "expired") {
    return (
      <div style={wrap}>
        <div style={card}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>That code's already turned over.</h1>
          <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.5, margin: 0 }}>
            The QR refreshes every few seconds — that's what keeps it real, you have to be in the room. Scan the host's live screen again.
          </p>
        </div>
      </div>
    );
  }

  // ── Locked: the promise, never the contents ─────────────────────────────
  return (
    <div style={wrap}>
      <form style={card} onSubmit={pullUp}>
        <div style={{ fontSize: 12, color: FAINT, textTransform: "uppercase", letterSpacing: "0.08em" }}>Pull up</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", margin: "6px 0 4px" }}>You're at the door.</h1>
        <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.5, margin: "0 0 20px" }}>
          Pulling up is the only key. Step in and the room opens.
        </p>

        {teaser && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "14px 16px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, marginBottom: 20, fontSize: 13.5, color: MUTED }}>
            <span><b style={{ color: INK }}>{teaser.peopleInside}</b> pulled up</span>
            {teaser.photoCount > 0 && <span>· <b style={{ color: INK }}>{teaser.photoCount}</b> photos inside</span>}
            {teaser.conversationLive && <span>· the room's live</span>}
          </div>
        )}

        <input
          type="email" inputMode="email" autoComplete="email" placeholder="the email you RSVP'd with"
          value={email} onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="text" autoComplete="name" placeholder="your name (if you're new here)"
          value={name} onChange={(e) => setName(e.target.value)}
          style={{ ...inputStyle, marginTop: 10 }}
        />
        {error && <div style={{ color: "#ff7a9c", fontSize: 13, marginTop: 10 }}>{error}</div>}

        <button type="submit" disabled={phase === "verifying"} style={btnStyle}>
          {phase === "verifying" ? "Opening…" : "Pull up"}
        </button>
        <p style={{ fontSize: 11.5, color: FAINT, textAlign: "center", margin: "14px 0 0", lineHeight: 1.5 }}>
          The room only opens for people who actually showed up.
        </p>
      </form>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "13px 14px",
  borderRadius: 12,
  border: `1px solid ${BORDER}`,
  background: "rgba(255,255,255,0.04)",
  color: INK,
  fontSize: 15,
  outline: "none",
};
const btnStyle = {
  width: "100%",
  marginTop: 16,
  padding: "14px",
  borderRadius: 12,
  border: "none",
  background: PINK,
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};
