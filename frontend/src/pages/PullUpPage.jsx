// PullUpPage — the threshold AND the persistent room (/p/:eventId).
//
// Access is keyed off the DURABLE PullUp record, never a fresh code. The
// rotating code's only job is to let you CREATE that record at the moment of
// proof (scan the host's live screen). Once it exists, you re-enter forever by
// identity alone — the bead persists, the room doesn't evaporate when the code
// rotates.
//
// Flow on identify (email):
//   • PullUp record exists  → you're in. Show the room. (re-entry, any time)
//   • no record, valid code → pull up now → record written → door opens.
//   • no record, no code    → locked. "Scan the host's live code to get in."
//
// The locked state shows the PROMISE (counts, never content).

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { publicFetch } from "../lib/api.js";
import RoomConversation from "../components/room/RoomConversation.jsx";

const INK = "#f5f4f7";
const MUTED = "rgba(245,244,247,0.55)";
const FAINT = "rgba(245,244,247,0.35)";
const PINK = "#ec178f";
const CARD = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.10)";

const wrap = {
  minHeight: "100dvh", background: "#08070d", color: INK,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
};
const card = { width: "100%", maxWidth: 460, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "28px 24px" };

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
  const hasCode = !!(w && s);

  const [teaser, setTeaser] = useState(null);
  // entry | working | inRoom | needScan | expired | error
  const [phase, setPhase] = useState("entry");
  const [email, setEmail] = useState(() => localStorage.getItem("pullup_email") || "");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [interior, setInterior] = useState(null);
  const [justPulledUp, setJustPulledUp] = useState(false);

  // Guest adapter for the topic-organised room conversation (publicFetch +
  // the email they pulled up with). Guests can't open topics — host holds the pen.
  const em = email.trim().toLowerCase();
  const guestApi = useMemo(() => ({
    loadChannels: () => publicFetch(`/p/${eventId}/channels?email=${encodeURIComponent(em)}`).then((r) => (r.ok ? r.json().then((d) => d.channels || []) : [])),
    loadMessages: (cid) => publicFetch(`/p/${eventId}/space?email=${encodeURIComponent(em)}&channelId=${cid}`).then((r) => (r.ok ? r.json().then((d) => d.messages || []) : [])),
    post: (cid, body) => publicFetch(`/p/${eventId}/space`, { method: "POST", body: JSON.stringify({ email: em, body, channelId: cid }) }).then((r) => (r.ok ? r.json().then((d) => d.messages || []) : [])),
    createTopic: null,
  }), [eventId, em]);

  useEffect(() => {
    let alive = true;
    publicFetch(`/p/${eventId}/teaser`).then((r) => (r.ok ? r.json() : null)).then((d) => alive && d && setTeaser(d)).catch(() => {});
    return () => { alive = false; };
  }, [eventId]);

  async function loadInterior(em) {
    const r = await publicFetch(`/p/${eventId}/interior?email=${encodeURIComponent(em)}`);
    if (r.ok) { setInterior(await r.json().catch(() => null)); return true; }
    return false;
  }

  async function enter(e) {
    e?.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em) { setError("Pop in the email you RSVP'd with."); return; }
    localStorage.setItem("pullup_email", em);
    setPhase("working");
    setError("");
    try {
      // 1) Already hold the bead? Then you're in — no code required, forever.
      if (await loadInterior(em)) { setJustPulledUp(false); setPhase("inRoom"); return; }

      // 2) Not in yet. A live code lets you pull up right now (covers late
      //    check-ins even just after the nominal end).
      if (hasCode) {
        const res = await publicFetch(`/p/${eventId}/pullup`, {
          method: "POST",
          body: JSON.stringify({ w: Number(w), s, email: em, name: name.trim() || undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          await loadInterior(em);
          setJustPulledUp(!data.alreadyPresent);
          setPhase("inRoom");
          return;
        }
        // Code didn't take. If the event's over, that's the end of the road.
        if (teaser?.ended) { setPhase("rejected"); return; }
        if (res.status === 410 || data.reason === "expired") { setPhase("expired"); return; }
        setError("Couldn't read that code. Scan the host's screen again.");
        setPhase("entry");
        return;
      }

      // 3) No record, no live code.
      //    Event already passed → you didn't pull up. There's nothing here.
      //    Still upcoming → go scan the host's live code.
      setPhase(teaser?.ended ? "rejected" : "needScan");
    } catch {
      setError("Something went wrong. Try again.");
      setPhase("entry");
    }
  }

  // ── In the room ─────────────────────────────────────────────────────────
  if (phase === "inRoom") {
    const others = interior?.coPresent?.length ?? Math.max((teaser?.peopleInside || 1) - 1, 0);
    const photos = interior?.photoCount ?? teaser?.photoCount ?? 0;
    return (
      <div style={wrap}>
        <div style={{ ...card, animation: "pu-open 600ms cubic-bezier(0.16,1,0.3,1)" }}>
          <style>{`@keyframes pu-open{0%{opacity:0;transform:translateY(10px) scale(0.98)}100%{opacity:1;transform:none}}`}</style>
          <div style={{ fontSize: 13, color: PINK, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {justPulledUp ? "You're in" : "Welcome back"}
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", margin: "8px 0 6px" }}>
            {justPulledUp ? "You pulled up." : "Your room."}
          </h1>
          <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.5, margin: "0 0 22px" }}>
            Only people who showed up are inside — and you're one of them.
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

          <div style={{ marginTop: 24, borderTop: `1px solid ${BORDER}`, paddingTop: 18 }}>
            <div style={{ fontSize: 11, color: FAINT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>The room · talk</div>
            <RoomConversation dark canCreateTopic={false} api={guestApi} />
          </div>
        </div>
      </div>
    );
  }

  // Event passed, never pulled up → the thesis, to your face. Harsh, but it
  // points at the next door instead of just slamming.
  if (phase === "rejected") {
    return (
      <div style={wrap}>
        <div style={{ ...card, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: FAINT, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>The deal</div>
          <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.02em", margin: "10px 0 10px", lineHeight: 1.2 }}>
            You didn't pull up — so there's nothing here.
          </h1>
          <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.55, margin: "0 0 6px" }}>
            The room only opens for people who showed up. An RSVP you didn't honor doesn't carry over.
          </p>
          <p style={{ fontSize: 15, color: PINK, fontWeight: 700, margin: "16px 0 0" }}>
            Catch the next one.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "expired") {
    return (
      <div style={wrap}>
        <div style={card}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>That code already turned over.</h1>
          <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.5, margin: "0 0 18px" }}>
            The QR refreshes every few seconds — that's what keeps it real, you have to be in the room. Scan the host's live screen again.
          </p>
          <button onClick={() => setPhase("entry")} style={ghostBtn}>Back</button>
        </div>
      </div>
    );
  }

  // ── Locked: the promise, never the contents ─────────────────────────────
  const needScan = phase === "needScan";
  return (
    <div style={wrap}>
      <form style={card} onSubmit={enter}>
        <div style={{ fontSize: 12, color: FAINT, textTransform: "uppercase", letterSpacing: "0.08em" }}>{hasCode ? "Pull up" : "The room"}</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", margin: "6px 0 4px" }}>
          {needScan ? "You haven't pulled up yet." : "You're at the door."}
        </h1>
        <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.5, margin: "0 0 20px" }}>
          {needScan
            ? "Pulling up is the only key. Scan the host's live code at the event to get in — a screenshot won't work."
            : "Pulling up is the only key. Step in and the room opens."}
        </p>

        {teaser && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "14px 16px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, marginBottom: 20, fontSize: 13.5, color: MUTED }}>
            <span><b style={{ color: INK }}>{teaser.peopleInside}</b> pulled up</span>
            {teaser.photoCount > 0 && <span>· <b style={{ color: INK }}>{teaser.photoCount}</b> photos inside</span>}
            {teaser.conversationLive && <span>· the room's live</span>}
          </div>
        )}

        {!needScan && (
          <>
            <input type="email" inputMode="email" autoComplete="email" placeholder="the email you RSVP'd with"
              value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            {hasCode && (
              <input type="text" autoComplete="name" placeholder="your name (if you're new here)"
                value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginTop: 10 }} />
            )}
            {error && <div style={{ color: "#ff7a9c", fontSize: 13, marginTop: 10 }}>{error}</div>}
            <button type="submit" disabled={phase === "working"} style={btnStyle}>
              {phase === "working" ? "Opening…" : hasCode ? "Pull up" : "Enter the room"}
            </button>
          </>
        )}

        <p style={{ fontSize: 11.5, color: FAINT, textAlign: "center", margin: "14px 0 0", lineHeight: 1.5 }}>
          The room only opens for people who actually showed up.
        </p>
      </form>
    </div>
  );
}


const inputStyle = { width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.04)", color: INK, fontSize: 15, outline: "none" };
const btnStyle = { width: "100%", marginTop: 16, padding: "14px", borderRadius: 12, border: "none", background: PINK, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" };
const ghostBtn = { padding: "10px 18px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "transparent", color: INK, fontSize: 14, fontWeight: 600, cursor: "pointer" };
