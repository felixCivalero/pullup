// frontend/src/components/WaitlistStatusBadge.jsx
// Status badge for waitlist payment links

function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date - now;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `in ${diffDays} day${diffDays > 1 ? "s" : ""}`;
  } else if (diffHours > 0) {
    return `in ${diffHours} hour${diffHours > 1 ? "s" : ""}`;
  } else if (diffMs > 0) {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return `in ${diffMins} minute${diffMins > 1 ? "s" : ""}`;
  } else {
    return "expired";
  }
}

function getWaitlistLinkStatus(rsvp) {
  if (rsvp.bookingStatus !== "WAITLIST") {
    return rsvp.bookingStatus === "CONFIRMED"
      ? "CONFIRMED"
      : rsvp.bookingStatus;
  }

  if (rsvp.waitlistLinkUsedAt) {
    return "CONFIRMED"; // Paid via link
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

  return "WAITLIST"; // No link generated yet
}

export function WaitlistStatusBadge({ rsvp }) {
  const status = getWaitlistLinkStatus(rsvp);

  const config = {
    WAITLIST: {
      label: "Waitlist",
      icon: "⏳",
      color: "#9ca3af",
      bgColor: "rgba(156, 163, 175, 0.1)",
    },
    LINK_SENT: {
      label: "Link Sent",
      icon: "📧",
      color: "#3b82f6",
      bgColor: "rgba(59, 130, 246, 0.1)",
    },
    LINK_EXPIRED: {
      label: "Link Expired",
      icon: "⏰",
      color: "#f59e0b",
      bgColor: "rgba(245, 158, 11, 0.1)",
    },
    CONFIRMED: {
      label: "Paid & Confirmed",
      icon: "✅",
      color: "#10b981",
      bgColor: "rgba(16, 185, 129, 0.1)",
    },
  };

  const style = config[status] || config.WAITLIST;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 8px",
          borderRadius: "6px",
          fontSize: "12px",
          fontWeight: 500,
          color: style.color,
          background: style.bgColor,
          border: `1px solid ${style.color}40`,
        }}
      >
        {style.icon} {style.label}
      </span>
      {status === "LINK_SENT" && rsvp.waitlistLinkExpiresAt && (
        <span style={{ fontSize: "10px", opacity: 0.7 }}>
          Expires {formatRelativeTime(rsvp.waitlistLinkExpiresAt)}
        </span>
      )}
      {status === "LINK_EXPIRED" && rsvp.waitlistLinkExpiresAt && (
        <span style={{ fontSize: "10px", opacity: 0.7 }}>
          Expired {formatRelativeTime(rsvp.waitlistLinkExpiresAt)}
        </span>
      )}
    </div>
  );
}
