import { useState, useEffect } from "react";
import { Link2, Trash2, Copy, Check, Eye, MousePointerClick } from "lucide-react";
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
        background: compact ? "transparent" : colors.background,
        borderRadius: compact ? 0 : "16px",
        border: compact ? "none" : `1px solid ${colors.border}`,
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
              color: colors.gold,
            }}
          >
            <Link2 size={16} style={{ color: colors.gold }} />
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
            borderRadius: "12px",
            border: `1px solid ${colors.borderStrong}`,
            background: colors.background,
            color: colors.text,
            fontSize: compact ? "12px" : "13px",
            outline: "none",
            boxSizing: "border-box",
            transition: "all 0.3s ease",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = colors.accentBorder;
            e.target.style.boxShadow = `0 0 0 3px ${colors.accentSoft}`;
          }}
          onBlur={(e) => {
            e.target.style.borderColor = colors.borderStrong;
            e.target.style.boxShadow = "none";
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            minWidth: "0",
          }}
        >
          <div
            style={{
              fontSize: compact ? "11px" : "12px",
              color: colors.textSubtle,
              whiteSpace: "nowrap",
            }}
          >
            Plus-ones
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: compact ? "6px" : "8px",
              background: colors.surface,
              borderRadius: "999px",
              padding: compact ? "2px 4px" : "4px 6px",
              border: `1px solid ${colors.border}`,
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
                    ? colors.surfaceMuted
                    : colors.surfaceMuted,
                color:
                  (parseInt(maxPlusOnes || "0", 10) || 0) <= 0
                    ? colors.textFaded
                    : colors.text,
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
                color: colors.text,
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
                background: colors.surfaceMuted,
                color: colors.text,
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
              color: colors.textMuted,
            }}
          >
            <input
              type="checkbox"
              checked={freeEntry}
              onChange={(e) => setFreeEntry(e.target.checked)}
              style={{ accentColor: colors.accent }}
            />
            <span>Free entry (comp)</span>
          </label>
        )}
        <button
          type="submit"
          disabled={generating || !email.trim()}
          style={{
            padding: "8px 16px",
            borderRadius: "999px",
            border: "none",
            background:
              !email.trim() || generating
                ? colors.surfaceMuted
                : colors.accent,
            color: !email.trim() || generating ? colors.textFaded : "#fff",
            fontSize: "13px",
            fontWeight: 600,
            cursor: !email.trim() || generating ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s ease",
          }}
        >
          {generating ? "Sending..." : "Send invite"}
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
            background: colors.successRgba,
            border: `1px solid rgba(22, 163, 74, 0.2)`,
            fontSize: compact ? "11px" : "12px",
          }}
        >
          <Check size={14} style={{ color: colors.success, flexShrink: 0 }} />
          <span style={{ color: colors.textMuted, flexShrink: 0 }}>Copied!</span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: colors.textSubtle,
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
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            fontSize: compact ? "11px" : "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "4px", color: colors.textMuted }}>
            <span style={{ fontWeight: 600, color: colors.text }}>{stats.totalSent}</span> sent
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <Eye size={12} style={{ color: colors.textSubtle }} />
            <span style={{ fontWeight: 600, color: colors.text }}>{stats.openRate}%</span>
            <span style={{ color: colors.textFaded }}>opened</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <MousePointerClick size={12} style={{ color: colors.textSubtle }} />
            <span style={{ fontWeight: 600, color: colors.text }}>{stats.clickRate}%</span>
            <span style={{ color: colors.textFaded }}>clicked</span>
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
              color: colors.textFaded,
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
                background: colors.background,
                border: `1px solid ${colors.border}`,
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
                  color: colors.text,
                }}
              >
                {inv.email}
              </span>
              {/* Tracking indicators */}
              {inv.clicked ? (
                <MousePointerClick size={12} style={{ color: colors.secondary, flexShrink: 0 }} title="Clicked VIP link" />
              ) : inv.opened ? (
                <Eye size={12} style={{ color: colors.textSubtle, flexShrink: 0 }} title="Opened email" />
              ) : null}
              <span style={{ color: colors.textFaded, fontSize: compact ? "10px" : "11px", flexShrink: 0 }}>
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
                    color: copiedId === inv.id ? colors.success : colors.textFaded,
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
                  color: colors.textFaded,
                  transition: "color 0.2s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = colors.danger; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = colors.textFaded; }}
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
