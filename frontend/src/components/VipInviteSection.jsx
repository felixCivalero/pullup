import { useState, useEffect } from "react";
import { Link2, Trash2, Copy, Check, Eye, MousePointerClick } from "lucide-react";
import { SilverIcon } from "./ui/SilverIcon.jsx";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

export function VipInviteSection({ event, showToast, compact = false }) {
  const [email, setEmail] = useState("");
  const [maxPlusOnes, setMaxPlusOnes] = useState("3");
  const [freeEntry, setFreeEntry] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lastLink, setLastLink] = useState(null);
  const [invites, setInvites] = useState([]);
  const [stats, setStats] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  if (!event) return null;

  const isPaidEvent =
    event.ticketType === "paid" &&
    typeof event.ticketPrice === "number" &&
    event.ticketPrice > 0;

  useEffect(() => {
    let isMounted = true;
    if (!event?.id) return;

    (async () => {
      try {
        const res = await authenticatedFetch(
          `/host/events/${event.id}/vip-invites`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted) {
          setInvites(data.invites || []);
          if (data.stats) setStats(data.stats);
        }
      } catch (err) {
        console.error("Failed to load VIP invites", err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [event?.id]);

  async function handleGenerateVipInvite(e) {
    e?.preventDefault();
    if (!email.trim()) {
      showToast("Enter an email for the VIP invite.", "warning");
      return;
    }

    const maxPlusOnesInt = parseInt(maxPlusOnes || "0", 10);
    if (!Number.isFinite(maxPlusOnesInt) || maxPlusOnesInt < 0) {
      showToast("Max plus-ones must be 0 or more.", "warning");
      return;
    }

    const maxGuestsInt = maxPlusOnesInt + 1;

    setGenerating(true);
    try {
      const payload = {
        email: email.trim(),
        maxGuests: maxGuestsInt,
      };
      if (isPaidEvent) {
        payload.freeEntry = freeEntry;
      }

      const res = await authenticatedFetch(
        `/host/events/${event.id}/vip-invites`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create VIP invite");
      }

      const data = await res.json();
      showToast(
        `VIP link created and emailed to ${email.trim()}.`,
        "success",
      );

      if (data.link) {
        setLastLink(data.link);
        if (navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(data.link);
          } catch {
            // Ignore clipboard errors
          }
        }
      } else {
        setLastLink(null);
      }

      setEmail("");
      setMaxPlusOnes("3");
      setFreeEntry(false);

      try {
        const resInv = await authenticatedFetch(
          `/host/events/${event.id}/vip-invites`,
        );
        if (resInv.ok) {
          const dataInv = await resInv.json();
          setInvites(dataInv.invites || []);
          if (dataInv.stats) setStats(dataInv.stats);
        }
      } catch (reloadErr) {
        console.error("Failed to reload VIP invites after creation", reloadErr);
      }
    } catch (err) {
      console.error("Failed to create VIP invite", err);
      showToast(
        err.message || "Failed to create VIP invite. Please try again.",
        "error",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteInvite(inviteId) {
    try {
      const res = await authenticatedFetch(
        `/host/events/${event.id}/vip-invites/${inviteId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error("Failed to delete VIP invite");
      }
      setInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
      showToast("VIP invite removed.", "success");
    } catch (err) {
      console.error("Failed to delete VIP invite", err);
      showToast("Failed to remove VIP invite.", "error");
    }
  }

  async function handleCopyLink(link, inviteId) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(inviteId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast("Failed to copy link.", "error");
    }
  }

  const stepperBtnSize = compact ? "26px" : "32px";
  const stepperFontSize = compact ? "15px" : "18px";
  const counterFontSize = compact ? "15px" : "18px";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? "8px" : "10px",
        background: compact ? "transparent" : "rgba(12,10,18,0.6)",
        borderRadius: compact ? 0 : "16px",
        border: compact ? "none" : "1px solid rgba(255,255,255,0.06)",
        padding: compact ? 0 : "14px 16px",
      }}
    >
      {!compact && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              opacity: 0.85,
            }}
          >
            <SilverIcon as={Link2} size={16} />
            VIP Invites
          </div>
        </div>
      )}

      <form
        onSubmit={handleGenerateVipInvite}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: compact ? "6px" : "8px",
          alignItems: "center",
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="VIP guest email"
          style={{
            flex: "1 1 180px",
            minWidth: "0",
            padding: compact ? "6px 10px" : "8px 10px",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(15,23,42,0.9)",
            color: "#fff",
            fontSize: compact ? "12px" : "13px",
            outline: "none",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            minWidth: "0",
          }}
        >
          <div
            style={{
              fontSize: compact ? "10px" : "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              opacity: 0.8,
            }}
          >
            Plus-ones on their list
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: compact ? "6px" : "8px",
              background: "rgb(12 10 18 / 10%)",
              borderRadius: "999px",
              padding: compact ? "2px 4px" : "4px 6px",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                const current = parseInt(maxPlusOnes || "0", 10) || 0;
                const next = Math.max(0, current - 1);
                setMaxPlusOnes(String(next));
              }}
              style={{
                width: stepperBtnSize,
                height: stepperBtnSize,
                borderRadius: "10px",
                border: "none",
                background:
                  (parseInt(maxPlusOnes || "0", 10) || 0) <= 0
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(192,192,192,0.2)",
                color:
                  (parseInt(maxPlusOnes || "0", 10) || 0) <= 0
                    ? "rgba(255,255,255,0.3)"
                    : "#fff",
                fontSize: stepperFontSize,
                fontWeight: 600,
                cursor:
                  (parseInt(maxPlusOnes || "0", 10) || 0) <= 0
                    ? "not-allowed"
                    : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s ease",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              −
            </button>
            <div
              style={{
                minWidth: compact ? "24px" : "32px",
                textAlign: "center",
                fontSize: counterFontSize,
                fontWeight: 700,
                color: "#fff",
              }}
            >
              {parseInt(maxPlusOnes || "0", 10) || 0}
            </div>
            <button
              type="button"
              onClick={() => {
                const current = parseInt(maxPlusOnes || "0", 10) || 0;
                const next = Math.min(50, current + 1);
                setMaxPlusOnes(String(next));
              }}
              style={{
                width: stepperBtnSize,
                height: stepperBtnSize,
                borderRadius: "10px",
                border: "none",
                background: "rgba(192,192,192,0.2)",
                color: "#fff",
                fontSize: stepperFontSize,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s ease",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              +
            </button>
          </div>
        </div>
        {isPaidEvent && (
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: compact ? "11px" : "12px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={freeEntry}
              onChange={(e) => setFreeEntry(e.target.checked)}
              style={{ accentColor: "#e5e5e5" }}
            />
            <span>Free entry (comp)</span>
          </label>
        )}
        <button
          type="submit"
          disabled={generating}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: compact ? "6px 10px" : "8px 12px",
            borderRadius: "999px",
            border: "1px solid " + colors.goldRgba,
            backgroundImage: colors.gradientGold,
            boxShadow: colors.goldShadow,
            color: "#05040a",
            fontSize: compact ? "11px" : "12px",
            fontWeight: 600,
            cursor: generating ? "not-allowed" : "pointer",
            opacity: generating ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {generating ? "Creating..." : "Email link"}
        </button>
      </form>

      {/* Last created link */}
      {lastLink && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: compact ? "6px 8px" : "8px 12px",
            borderRadius: "10px",
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.2)",
            fontSize: compact ? "11px" : "12px",
          }}
        >
          <Check size={14} style={{ color: colors.gold, flexShrink: 0 }} />
          <span style={{ opacity: 0.7, flexShrink: 0 }}>Copied!</span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              opacity: 0.5,
              fontSize: compact ? "10px" : "11px",
            }}
          >
            {lastLink}
          </span>
        </div>
      )}

      {/* Stats summary */}
      {stats && stats.totalSent > 0 && (
        <div
          style={{
            display: "flex",
            gap: compact ? "10px" : "16px",
            padding: compact ? "6px 8px" : "8px 12px",
            borderRadius: "10px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
            fontSize: compact ? "11px" : "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "4px", opacity: 0.6 }}>
            <span style={{ fontWeight: 600 }}>{stats.totalSent}</span> sent
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <Eye size={12} style={{ opacity: 0.5 }} />
            <span style={{ fontWeight: 600 }}>{stats.openRate}%</span>
            <span style={{ opacity: 0.4 }}>opened</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <MousePointerClick size={12} style={{ opacity: 0.5 }} />
            <span style={{ fontWeight: 600 }}>{stats.clickRate}%</span>
            <span style={{ opacity: 0.4 }}>clicked</span>
          </div>
        </div>
      )}

      {/* Pending invites list */}
      {invites.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: compact ? "4px" : "6px" }}>
          <div
            style={{
              fontSize: compact ? "9px" : "10px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              opacity: 0.4,
              marginTop: compact ? "4px" : "6px",
            }}
          >
            Pending ({invites.length})
          </div>
          {invites.map((inv) => (
            <div
              key={inv.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: compact ? "5px 8px" : "6px 10px",
                borderRadius: "8px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.05)",
                fontSize: compact ? "11px" : "12px",
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  opacity: 0.8,
                }}
              >
                {inv.email}
              </span>
              {/* Tracking indicators */}
              {inv.clicked ? (
                <MousePointerClick size={12} style={{ color: colors.gold, flexShrink: 0 }} title="Clicked VIP link" />
              ) : inv.opened ? (
                <Eye size={12} style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} title="Opened email" />
              ) : null}
              <span style={{ opacity: 0.4, fontSize: compact ? "10px" : "11px", flexShrink: 0 }}>
                +{(inv.maxGuests || 1) - 1}
              </span>
              {inv.link && (
                <button
                  onClick={() => handleCopyLink(inv.link, inv.id)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                    color: copiedId === inv.id ? colors.gold : "rgba(255,255,255,0.4)",
                    transition: "color 0.2s ease",
                  }}
                  title="Copy VIP link"
                >
                  {copiedId === inv.id ? <Check size={13} /> : <Copy size={13} />}
                </button>
              )}
              <button
                onClick={() => handleDeleteInvite(inv.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px",
                  display: "flex",
                  alignItems: "center",
                  color: "rgba(255,255,255,0.3)",
                  transition: "color 0.2s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(239, 68, 68, 0.8)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}
                title="Remove invite"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
