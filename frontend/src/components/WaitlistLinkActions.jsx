// frontend/src/components/WaitlistLinkActions.jsx
// Actions for generating and managing waitlist payment links

import { useState } from "react";
import { useToast } from "./Toast";
import { authenticatedFetch } from "../lib/api.js";
import { WaitlistStatusBadge } from "./WaitlistStatusBadge.jsx";

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
        { method: "POST" }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate link");
      }

      const data = await res.json();
      // data: { link, token, expiresAt, email }

      setLink(data.link);
      showToast("Payment link generated!", "success");
      if (onLinkGenerated) {
        onLinkGenerated(data.link);
      }

      // Copy to clipboard automatically
      navigator.clipboard.writeText(data.link);
      showToast("Link copied to clipboard!", "info");
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
            background: "rgba(59, 130, 246, 0.2)",
            border: "1px solid rgba(59, 130, 246, 0.5)",
            borderRadius: "6px",
            color: "#3b82f6",
            cursor: generating ? "not-allowed" : "pointer",
            opacity: generating ? 0.6 : 1,
          }}
        >
          {generating ? "Generating..." : "📧 Generate Link"}
        </button>
      )}

      {linkStatus === "LINK_SENT" && (
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            onClick={handleCopyLink}
            style={{
              padding: "4px 8px",
              fontSize: "11px",
              background: "rgba(59, 130, 246, 0.1)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: "4px",
              color: "#3b82f6",
              cursor: "pointer",
            }}
          >
            📋 Copy
          </button>
          <button
            onClick={handleGenerateLink}
            disabled={generating}
            style={{
              padding: "4px 8px",
              fontSize: "11px",
              background: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: "4px",
              color: "#f59e0b",
              cursor: generating ? "not-allowed" : "pointer",
              opacity: generating ? 0.6 : 1,
            }}
          >
            {generating ? "..." : "🔄 Regenerate"}
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
            background: "rgba(245, 158, 11, 0.2)",
            border: "1px solid rgba(245, 158, 11, 0.5)",
            borderRadius: "6px",
            color: "#f59e0b",
            cursor: generating ? "not-allowed" : "pointer",
            opacity: generating ? 0.6 : 1,
          }}
        >
          {generating ? "Generating..." : "🔄 Generate New Link"}
        </button>
      )}

      {linkStatus === "CONFIRMED" && (
        <span style={{ fontSize: "11px", opacity: 0.7 }}>
          ✅ Paid & Confirmed
        </span>
      )}
    </div>
  );
}
