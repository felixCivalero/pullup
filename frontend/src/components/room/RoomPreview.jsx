// The unverified viewer's read-only look at an event room. A browser only
// holds a session by proving the inbox (magic link) or logging in, so "no
// session" == "unverified". Such a viewer sees the room's SHELL — cover, host
// greeting, what this is — with every social surface (photos, conversation,
// who's here) locked behind a verify step. The server never hands this view
// anything social; this component only paints the shell + the way in.
//
// The way in follows the truth of the funnel, never a cold login modal:
//   • Just RSVP'd (we carry their email) → the confirmation email already holds
//     the verify LINK. Tell them to open it; offer a resend.
//   • No known spot → you can't enter an event room without one, so send them
//     to the event page to RSVP (which mails them that link).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Images, MessageSquare, Users, ShieldCheck } from "lucide-react";
import { colors } from "../../theme/colors.js";
import { transformedImageUrl } from "../../lib/imageUtils.js";
import { publicFetch } from "../../lib/api.js";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const LOCK_ICON = { marginBottom: 6, opacity: 0.7 };
const firstName = (n) => (n || "").toString().trim().split(/\s+/)[0] || "";
const isVideo = (u) => typeof u === "string" && /\.(mp4|mov|webm)(\?|$)/i.test(u);

function LockedTile({ icon, label }) {
  return (
    <div style={{ padding: "18px 10px", borderRadius: 14, border: `1px solid ${colors.borderFaint}`, background: colors.surface, textAlign: "center", color: colors.textFaded, fontFamily: SF }}>
      {icon}
      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

const PILL = { padding: "11px 26px", borderRadius: 999, border: "none", background: colors.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: SF };

export default function RoomPreview({ event, eventId, justRsvped }) {
  const navigate = useNavigate();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const hasCover = !!event?.cover;
  const when = event?.startsAt
    ? new Date(event.startsAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : null;
  const hostName = event?.host?.name ? firstName(event.host.name) : "";
  const rsvpEmail = justRsvped?.email || null;

  // Resend the verify-and-enter link to the email they just RSVP'd with. The
  // link mints a fresh session and lands them back in THIS room — same proof
  // the confirmation email carries, on demand.
  const resendLink = async () => {
    if (!rsvpEmail || resending || resent) return;
    setResending(true);
    try {
      await publicFetch("/auth/request-link", {
        method: "POST",
        body: JSON.stringify({ email: rsvpEmail, name: justRsvped?.name || undefined, next: `/events/${eventId}/room`, mode: "login" }),
      });
      setResent(true);
    } catch { /* cooldown or transient — the confirmation email still has the link */ }
    setResending(false);
  };

  return (
    <div style={{ minHeight: "100vh", paddingTop: "calc(58px + env(safe-area-inset-top, 0px))", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px 60px" }}>
        {/* Cover banner — the room's face (matches the verified room header). */}
        <div style={{ marginBottom: 18, borderRadius: 18, overflow: "hidden", border: `1px solid ${colors.border}`, boxShadow: "0 1px 2px rgba(10,10,10,0.03), 0 10px 30px rgba(10,10,10,0.05)" }}>
          <div style={{ position: "relative", height: hasCover ? 196 : 132, background: hasCover ? "#1a1016" : "linear-gradient(135deg, #fde7f3 0%, #f4f4f5 55%, #e7f9f5 100%)" }}>
            {hasCover && (isVideo(event.cover)
              ? <video src={event.cover} muted autoPlay loop playsInline preload="metadata" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              : <img src={transformedImageUrl(event.cover, { width: 720 })} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />)}
            {hasCover && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 28%, rgba(0,0,0,0.34) 64%, rgba(0,0,0,0.66) 100%)" }} />}
            <div style={{ position: "absolute", left: 22, right: 22, bottom: 16 }}>
              <h1 style={{ fontSize: 27, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.02em", lineHeight: 1.1, fontFamily: SF, color: hasCover ? "#fff" : colors.text, textShadow: hasCover ? "0 1px 14px rgba(0,0,0,0.45)" : "none" }}>
                {event?.title || "The Room"}
              </h1>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: hasCover ? "rgba(255,255,255,0.92)" : colors.textMuted, textShadow: hasCover ? "0 1px 10px rgba(0,0,0,0.45)" : "none" }}>
                {[when, event?.location].filter(Boolean).join(" · ") || " "}
              </div>
            </div>
          </div>
        </div>

        {/* Host greeting — read-only, the room's hello. */}
        {event?.roomWelcome && (
          <div style={{ marginBottom: 18, padding: "14px 16px", borderRadius: 14, border: `1px solid ${colors.borderFaint}`, background: colors.surface, fontSize: 14.5, lineHeight: 1.55, color: colors.text, fontFamily: SF, whiteSpace: "pre-wrap" }}>
            {event.roomWelcome}
          </div>
        )}

        {/* THE verify step — worded to where they actually are in the funnel. */}
        <div style={{ padding: "22px 20px", borderRadius: 16, border: `1px solid ${colors.accentBorder}`, background: colors.accentSoft, textAlign: "center", fontFamily: SF }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 14px", borderRadius: 999, background: colors.accent, color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
            <ShieldCheck size={14} /> Verify to step in
          </div>

          {rsvpEmail ? (
            <>
              <p style={{ fontSize: 16, fontWeight: 800, color: colors.text, margin: "0 0 6px" }}>
                You're in{hostName ? ` — welcome to ${hostName}'s room` : ""}
              </p>
              <p style={{ fontSize: 13.5, color: colors.textMuted, lineHeight: 1.55, margin: "0 0 16px" }}>
                Verify your email to step inside — open the link we sent to {rsvpEmail} and tap it. That's it: verified, signed in, inside.
              </p>
              <button onClick={resendLink} disabled={resending || resent}
                style={{ ...PILL, background: resent ? colors.surfaceMuted : colors.accent, color: resent ? colors.textMuted : "#fff", cursor: resent ? "default" : "pointer", opacity: resending ? 0.6 : 1 }}>
                {resent ? "Link sent — check your inbox" : resending ? "Sending…" : "Resend the link"}
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 16, fontWeight: 800, color: colors.text, margin: "0 0 6px" }}>
                {hostName ? `${hostName}'s room` : "This room"} is for people with a spot
              </p>
              <p style={{ fontSize: 13.5, color: colors.textMuted, lineHeight: 1.55, margin: "0 0 16px" }}>
                RSVP to {event?.title || "this event"} and we'll email you the link to step in — that link is your verification.
              </p>
              <button onClick={() => navigate(event?.slug ? `/e/${event.slug}` : "/")} style={PILL}>
                RSVP to {event?.title ? (event.title.length > 22 ? "this event" : event.title) : "this event"}
              </button>
            </>
          )}
        </div>

        {/* Locked surfaces — a teaser of what verifying unlocks. */}
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <LockedTile icon={<Images size={16} style={LOCK_ICON} />} label="Photos" />
          <LockedTile icon={<MessageSquare size={16} style={LOCK_ICON} />} label="Conversation" />
          <LockedTile icon={<Users size={16} style={LOCK_ICON} />} label="Who's here" />
        </div>
      </div>
    </div>
  );
}
