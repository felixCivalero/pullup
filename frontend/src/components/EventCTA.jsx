// Shared sticky CTA button for event pages — single source of truth
// Used by EventPage (live) and EventPreview (create/preview)
import { Button } from "./ui/Button";

/** Height reserved for the CTA bar (used to offset content) */
export const EVENT_CTA_HEIGHT = 72;

/** Compute the "Pull up" label from ticket config */
export function getCtaLabel({ ticketType, ticketPrice, ticketCurrency, isEventPast, isSoldOut } = {}) {
  if (isEventPast) return "Event has ended";
  if (isSoldOut) return "Sold out";
  if (ticketType === "paid" && ticketPrice) {
    const currency = (ticketCurrency || "usd").toLowerCase();
    const symbol =
      currency === "sek" ? "kr"
        : currency === "eur" ? "\u20ac"
        : currency === "gbp" ? "\u00a3"
        : "$";
    const amount = (ticketPrice / 100).toFixed(2);
    return `Pull up \u2014 from ${symbol}${amount}`;
  }
  return "Pull up";
}

/** Sticky gradient bar + CTA button at the bottom of an event view */
export function EventCTA({ onClick, disabled, label, maxWidth, fixed }) {
  return (
    <div
      style={{
        position: fixed ? "fixed" : "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "12px 20px",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        background:
          "linear-gradient(to top, #05040a 0%, rgba(5, 4, 10, 0.98) 70%, transparent 100%)",
        backdropFilter: "blur(20px)",
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
