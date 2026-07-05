// Shared sticky CTA button for event pages — single source of truth
// Used by EventPage (live) and EventPreview (create/preview)
import { Button } from "./ui/Button";

/** Height reserved for the CTA bar (used to offset content) */
export const EVENT_CTA_HEIGHT = 72;

/** Compute the CTA label from page kind + ticket config */
export function getCtaLabel({ kind, ticketType, ticketPrice, ticketCurrency, isEventPast, isSoldOut, instantWaitlist, rsvpsPaused } = {}) {
  // Lapsed-host degradation: the page stays up, the form closes (all kinds).
  if (rsvpsPaused) return "Sign-ups are paused";
  // Non-event page kinds carry their own CTA (community → "Join", etc.).
  if (kind === "community") return "Join the community";
  if (kind === "product") return "Buy now";
  if (isEventPast) return "Event has ended";
  if (isSoldOut) return "Sold out";
  if (instantWaitlist) return "Register interest";
  if (ticketType === "paid") {
    return "Get Tickets";
  }
  return "Register";
}

/** Sticky gradient bar + CTA button at the bottom of an event view */
export function EventCTA({ onClick, disabled, label, maxWidth, fixed, bgColor }) {
  return (
    <div
      style={{
        position: fixed ? "fixed" : "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "16px 20px",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        background: "transparent",
        zIndex: 100,
        boxSizing: "border-box",
        width: "100%",
        ...(maxWidth ? { maxWidth } : {}),
      }}
    >
      <Button
        fullWidth
        size="lg"
        disabled={disabled}
        onClick={onClick}
      >
        {label}
      </Button>
    </div>
  );
}
