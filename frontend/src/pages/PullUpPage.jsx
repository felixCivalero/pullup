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
import { useAuth } from "../contexts/AuthContext.jsx";
import RoomConversation from "../components/room/RoomConversation.jsx";
import { EventQuickActions } from "../components/EventQuickActions.jsx";

const INK = "#0a0a0a";
const MUTED = "rgba(10,10,10,0.60)";
const FAINT = "rgba(10,10,10,0.40)";
const PINK = "#ec178f";
const CARD = "#ffffff";
const BORDER = "rgba(10,10,10,0.10)";

const wrap = {
  minHeight: "100dvh", background: "#fafafa", color: INK,
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

export default function PullUpPage({ eventId: eventIdProp } = {}) {
  const routeParams = useParams();
  // Embedded inside the event Room (/events/:id/room) we get the id as a prop;
  // standalone we'd read it from the route. Prop wins.
  const eventId = eventIdProp || routeParams.eventId;
  const { user, requestMagicLink } = useAuth();
  const [params] = useSearchParams();
  const w = params.get("w");
  const s = params.get("s");
  const hasCode = !!(w && s);
  const [verifySent, setVerifySent] = useState(false);

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

  // Session-first: a logged-in (verified) guest skips the email box entirely —
  // we walk them into the room with their real identity the moment auth resolves.
  useEffect(() => {
    if (user?.email && phase === "entry") {
      enter(null, user.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  // Send a verify/claim link to the email they're in the room with, so they can
  // get back in from any device. Best-effort; we just flip to "check your inbox".
  async function sendVerifyLink() {
    const em = (email || user?.email || "").trim().toLowerCase();
    if (!em) return;
    try {
      await requestMagicLink(em, { next: window.location.pathname + window.location.search });
      setVerifySent(true);
    } catch {
      setVerifySent(true); // don't reveal failures; the cooldown/no-enumeration path still "succeeds"
    }
  }

  async function loadInterior(em) {
    const r = await publicFetch(`/p/${eventId}/interior?email=${encodeURIComponent(em)}`);
    if (r.ok) { setInterior(await r.json().catch(() => null)); return { ok: true }; }
    const d = await r.json().catch(() => ({}));
    return { ok: false, reason: d?.reason || "locked" };
  }

  async function enter(e, overrideEmail) {
    e?.preventDefault();
    const em = (overrideEmail || email).trim().toLowerCase();
    if (!em) { setError("Pop in the email you RSVP'd with."); return; }
    if (overrideEmail && em !== email) setEmail(em);
    localStorage.setItem("pullup_email", em);
    setPhase("working");
    setError("");
    try {
      // 1) Already have access? Either you hold the bead (pulled up — in forever)
      //    or you RSVP'd and the doors haven't opened yet (the pre-event lobby).
      const first = await loadInterior(em);
      if (first.ok) { setJustPulledUp(false); setPhase("inRoom"); return; }

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

      // 3) No record, no live code. Where they land depends on WHY they're out:
      //    - RSVP'd but the doors already opened and they never pulled up →
      //      the lobby closed without them; stuck at the host's profile.
      //    - Event ended, never in their orbit → the rejection door.
      //    - Still upcoming → go scan the host's live code (or RSVP first).
      if (first.reason === "event_started_no_pullup") { setPhase("missed"); return; }
      setPhase(teaser?.ended ? "rejected" : "needScan");
    } catch {
      setError("Something went wrong. Try again.");
      setPhase("entry");
    }
  }

  // ── In the room ─────────────────────────────────────────────────────────
  if (phase === "inRoom") {
    // Lobby = pre-event RSVP access (doors not open yet). Waitlist = the lower-key
    // peek while hoping for a spot. Pulled-up = earned.
    const lobby = interior?.access === "lobby";
    const waitlist = interior?.access === "waitlist";
    const preEvent = lobby || waitlist;
    const others = interior?.coPresent?.length ?? Math.max((teaser?.peopleInside || 1) - 1, 0);
    const coming = interior?.coming ?? teaser?.coming ?? 0;
    const photos = interior?.photoCount ?? teaser?.photoCount ?? 0;
    return (
      <div style={wrap}>
        <div style={{ ...card, animation: "pu-open 600ms cubic-bezier(0.16,1,0.3,1)" }}>
          <style>{`@keyframes pu-open{0%{opacity:0;transform:translateY(10px) scale(0.98)}100%{opacity:1;transform:none}}`}</style>

          {/* Claim/verify banner — they're in provisionally (by the email they
              RSVP'd with). Verifying drops a real session so they own the
              account and can return from any device. Never a gate, always
              optional; vanishes once they're a verified session. */}
          {!user && (
            <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 12, background: "rgba(236,23,143,0.06)", border: "1px solid rgba(236,23,143,0.22)" }}>
              {verifySent ? (
                <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
                  <b style={{ color: INK }}>Check your inbox.</b> Tap the link to verify it's you — then you're in from any device.
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.45, flex: 1, minWidth: 160 }}>
                    <b style={{ color: INK }}>Verify your account</b> to lock it to you and get back in from any device.
                  </div>
                  <button onClick={sendVerifyLink} style={{ padding: "8px 16px", borderRadius: 999, border: "none", background: PINK, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                    Verify
                  </button>
                </div>
              )}
            </div>
          )}

          <div style={{ fontSize: 13, color: PINK, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {waitlist ? "You're on the waitlist" : lobby ? "You're in early" : justPulledUp ? "You're in" : "Welcome back"}
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", margin: "8px 0 6px" }}>
            {waitlist ? "You're on the list." : lobby ? "The room's open." : justPulledUp ? "You pulled up." : "Your room."}
          </h1>
          <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.5, margin: "0 0 22px" }}>
            {waitlist
              ? "You're on the waitlist — here's a peek while you wait. If a spot opens, the host moves you in and the full room unlocks."
              : lobby
              ? "You RSVP'd, so you're in to get ready. When the event starts, pull up at the door — that's the only key once it's live."
              : "Only people who showed up are inside — and you're one of them."}
          </p>

          {/* Quick CTAs — share / add to calendar / see the live page. */}
          <div style={{ marginBottom: 18 }}>
            <EventQuickActions
              slug={teaser?.slug}
              title={teaser?.title}
              startsAt={teaser?.startsAt}
              endsAt={teaser?.endsAt}
              location={teaser?.location}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-around", padding: "18px 0", borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
            {preEvent
              ? <Stat value={coming} label="coming" />
              : <Stat value={others} label={others === 1 ? "person here" : "people here"} />}
            <Stat value={photos} label={photos === 1 ? "photo" : "photos"} />
          </div>

          {interior?.coPresent?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, color: FAINT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Who else pulled up</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {interior.coPresent.slice(0, 12).map((p) => (
                  <span key={p.id} style={{ fontSize: 13, padding: "5px 11px", borderRadius: 999, background: "#f4f4f5", border: `1px solid ${BORDER}` }}>
                    {p.name || "Someone"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {interior?.photos?.length > 0 && (
            <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
              {interior.photos.slice(0, 6).map((ph) => (
                <div key={ph.id} style={{ aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: "#f4f4f5" }}>
                  {ph.url && <img src={ph.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 24, borderTop: `1px solid ${BORDER}`, paddingTop: 18 }}>
            <div style={{ fontSize: 11, color: FAINT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>The room · talk</div>
            <RoomConversation canCreateTopic={false} canPost={interior?.permissions?.post !== false} api={guestApi} />
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

  // RSVP'd, but the doors opened and you never pulled up. The lobby closed
  // without you — your RSVP got you in to prep, not in to the live room. You're
  // back at the host's profile, where this event reads as one you said yes to
  // but didn't show for.
  if (phase === "missed") {
    return (
      <div style={wrap}>
        <div style={{ ...card, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: FAINT, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>The doors opened</div>
          <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.02em", margin: "10px 0 10px", lineHeight: 1.2 }}>
            You RSVP'd — but you didn't pull up.
          </h1>
          <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.55, margin: "0 0 6px" }}>
            The lobby was open to get ready. Once the event starts, pulling up at the door is the only way in — and that window's closed now.
          </p>
          {teaser?.hostId && (
            <a href={`/r/${teaser.hostId}`} style={{ ...ghostBtn, display: "inline-block", marginTop: 18, textDecoration: "none" }}>
              Back to the profile
            </a>
          )}
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
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "14px 16px", borderRadius: 14, background: "#fafafa", border: `1px solid ${BORDER}`, marginBottom: 20, fontSize: 13.5, color: MUTED }}>
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


const inputStyle = { width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${BORDER}`, background: "#fff", color: INK, fontSize: 15, outline: "none" };
const btnStyle = { width: "100%", marginTop: 16, padding: "14px", borderRadius: 12, border: "none", background: PINK, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" };
const ghostBtn = { padding: "10px 18px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "transparent", color: INK, fontSize: 14, fontWeight: 600, cursor: "pointer" };
