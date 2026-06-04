import { useNavigate } from "react-router-dom";
import { colors } from "../theme/colors.js";
import { AuthGate } from "./auth/AuthGate.jsx";

// THE polite denial. One reusable screen that explains WHY a viewer can't get in
// and points them the right way — never a dead end. Driven by the `reason` from
// the permission gate (useEventAccess / resolveEventAccess). Reused anywhere a
// surface is gated; the event Room uses it for no-access-without-a-live-code.
export function AccessGate({ reason, event, eventId }) {
  const navigate = useNavigate();

  // No identity at all → the one door. Signing in re-resolves access.
  if (reason === "no_identity") {
    return <AuthGate redirectTo={`/events/${eventId}/room`} />;
  }

  const slug = event?.slug;
  const copy =
    {
      not_invited: {
        title: "This room's for people who RSVP'd.",
        body: "Grab a spot on the event page and you're in.",
        cta: slug ? { label: "See the event", to: `/e/${slug}` } : { label: "Your room", to: "/room" },
      },
      event_started_no_pullup: {
        title: "You RSVP'd — but you didn't pull up.",
        body: "The lobby was open to get ready. Once the event starts, pulling up at the door is the only way in — and that window's closed now.",
        cta: { label: "Back to your room", to: "/room" },
      },
    }[reason] || {
      title: "This room isn't open to you.",
      body: "If you think that's a mistake, check the event page.",
      cta: slug ? { label: "See the event", to: `/e/${slug}` } : { label: "Your room", to: "/room" },
    };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          textAlign: "center",
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 20,
          padding: "32px 26px",
        }}
      >
        {event?.title && (
          <div style={{ fontSize: 12, color: colors.textFaded, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            {event.title}
          </div>
        )}
        <h1 style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em", color: colors.text, margin: "0 0 10px", lineHeight: 1.2 }}>
          {copy.title}
        </h1>
        <p style={{ fontSize: 14.5, color: colors.textMuted, lineHeight: 1.55, margin: "0 0 20px" }}>{copy.body}</p>
        <button
          onClick={() => navigate(copy.cta.to)}
          style={{
            padding: "12px 22px",
            borderRadius: 999,
            border: "none",
            background: colors.accent,
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {copy.cta.label}
        </button>
      </div>
    </div>
  );
}
