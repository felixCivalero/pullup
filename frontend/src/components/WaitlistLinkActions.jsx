// frontend/src/components/WaitlistLinkActions.jsx
// Actions for generating and managing waitlist payment links

import { useState } from "react";
import { Mail, ClipboardList, RefreshCw, Check } from "lucide-react";
import { useToast } from "./Toast";
import { authenticatedFetch } from "../lib/api.js";
import { WaitlistStatusBadge } from "./WaitlistStatusBadge.jsx";
import { colors } from "../theme/colors.js";

function getWaitlistLinkStatus(rsvp) {
  if (rsvp.bookingStatus !== "WAITLIST") {
    return rsvp.bookingStatus === "CONFIRMED"
      ? "CONFIRMED"
      : rsvp.bookingStatus;
  }

  if (rsvp.waitlistLinkUsedAt) {
    return "CONFIRMED";
  }

  if (
    rsvp.waitlistLinkExpiresAt &&
    new Date(rsvp.waitlistLinkExpiresAt) < new Date()
  ) {
    return "LINK_EXPIRED";
  }

  if (rsvp.waitlistLinkGeneratedAt) {
    return "LINK_SENT";
  }

  return "WAITLIST";
}

export function WaitlistLinkActions({ guest, event, onLinkGenerated }) {
  const [link, setLink] = useState(null);
  const [generating, setGenerating] = useState(false);
  const { showToast } = useToast();

  const linkStatus = getWaitlistLinkStatus(guest);

  async function handleGenerateLink() {
    setGenerating(true);
    try {
      const res = await authenticatedFetch(
        `/host/events/${event.id}/waitlist-link/${guest.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate link");
      }

      const data = await res.json();

      // Free events: guest is promoted immediately, no link needed
      if (data.promoted) {
        showToast("Guest confirmed and notified!", "success");
        if (onLinkGenerated) {
          onLinkGenerated(null, { promoted: true });
        }
        return;
      }

      // Paid events: link generated for payment
      setLink(data.link);
      showToast("Payment link sent to guest!", "success");
      if (onLinkGenerated) {
        onLinkGenerated(data.link);
      }

      // Copy to clipboard automatically
      navigator.clipboard.writeText(data.link);
      showToast("Link also copied to clipboard", "info");
    } catch (err) {
      showToast(err.message || "Failed to generate link", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyLink() {
    if (link) {
      await navigator.clipboard.writeText(link);
      showToast("Link copied!", "success");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* Status Badge */}
      <WaitlistStatusBadge rsvp={guest} />

      {/* Generate/Copy Button */}
      {linkStatus === "WAITLIST" && (
        <button
          onClick={handleGenerateLink}
          disabled={generating}
          style={{
            padding: "6px 12px",
            fontSize: "12px",
            background: colors.accentSoft,
            border: `1px solid ${colors.accentBorder}`,
            borderRadius: "999px",
            color: colors.accent,
            cursor: generating ? "not-allowed" : "pointer",
            opacity: generating ? 0.6 : 1,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {generating
            ? "Processing..."
            : event?.ticketType === "paid" && event?.ticketPrice
            ? <><Mail size={14} /> Send Payment Link</>
            : <><Check size={14} /> Confirm Guest</>}
        </button>
      )}

      {linkStatus === "LINK_SENT" && (
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            onClick={handleCopyLink}
            style={{
              padding: "4px 8px",
              fontSize: "11px",
              background: colors.secondarySoft,
              border: `1px solid ${colors.secondaryBorder}`,
              borderRadius: "999px",
              color: colors.secondary,
              cursor: "pointer",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <ClipboardList size={12} /> Copy
          </button>
          <button
            onClick={handleGenerateLink}
            disabled={generating}
            style={{
              padding: "4px 8px",
              fontSize: "11px",
              background: `${colors.warningRgba}`,
              border: `1px solid rgba(180, 83, 9, 0.3)`,
              borderRadius: "999px",
              color: colors.warning,
              cursor: generating ? "not-allowed" : "pointer",
              opacity: generating ? 0.6 : 1,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            {generating ? "..." : <><RefreshCw size={12} /> Regenerate</>}
          </button>
        </div>
      )}

      {linkStatus === "LINK_EXPIRED" && (
        <button
          onClick={handleGenerateLink}
          disabled={generating}
          style={{
            padding: "6px 12px",
            fontSize: "12px",
            background: `${colors.warningRgba}`,
            border: `1px solid rgba(180, 83, 9, 0.3)`,
            borderRadius: "999px",
            color: colors.warning,
            cursor: generating ? "not-allowed" : "pointer",
            opacity: generating ? 0.6 : 1,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {generating ? "Generating..." : <><RefreshCw size={12} /> Generate New Link</>}
        </button>
      )}

      {linkStatus === "CONFIRMED" && (
        <span style={{ fontSize: "11px", color: colors.textMuted, display: "flex", alignItems: "center", gap: "4px" }}>
          <Check size={12} style={{ color: colors.success }} /> Paid & Confirmed
        </span>
      )}
    </div>
  );
}
