import { useEffect, useState } from "react";
import { authenticatedFetch } from "../lib/api.js";
import { useToast } from "./Toast";
import { colors } from "../theme/colors.js";

/**
 * Take a PUBLISHED event back to DRAFT.
 *
 * The whole point of the popup is to warn the host BEFORE anything happens:
 * an unpublish hides the event from the public (the link 404s for anyone but
 * the host, including guests who registered) and, crucially, there may already
 * be people on the guest list. Nobody is deleted — RSVPs are kept — but the
 * host deserves to see that count before committing.
 *
 * Three exits:
 *   - Cancel               → nothing happens
 *   - Unpublish quietly     → status → DRAFT, no message (the "silent" case)
 *   - Unpublish & notify    → status → DRAFT + a host-authored broadcast to
 *                             everyone who RSVP'd (dual-rail WhatsApp → email),
 *                             so they can say why / share a new date.
 *
 * Backend already supports all of this — this component is pure wiring:
 *   PUT  /host/events/:id        { status: "DRAFT" }
 *   POST /host/room/broadcast     { personIds, text, subject }
 */
export default function UnpublishModal({ eventId, eventTitle, onClose, onUnpublished }) {
  const { showToast } = useToast();

  // Recipients are resolved on open from the event's own guest list.
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [personIds, setPersonIds] = useState([]);

  const titleLabel = (eventTitle || "this event").trim();
  const [message, setMessage] = useState(
    `Heads up — we've taken "${titleLabel}" down for now. We'll follow up with an update soon.`
  );

  // null = idle, "quiet" | "notify" while the matching button is working.
  const [busy, setBusy] = useState(null);
  const working = busy !== null;

  const count = personIds.length;
  const hasGuests = count > 0;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await authenticatedFetch(`/host/events/${eventId}/guests`);
        if (!res.ok) throw new Error("load failed");
        const data = await res.json();
        const guests = data.guests || [];
        // Everyone still on the list = going + waitlist; drop cancellations.
        // personId is people.id — exactly what /host/room/broadcast expects.
        const ids = [
          ...new Set(
            guests
              .filter(
                (g) =>
                  g.bookingStatus !== "CANCELLED" && g.status !== "cancelled"
              )
              .map((g) => g.personId)
              .filter(Boolean)
          ),
        ];
        if (alive) setPersonIds(ids);
      } catch {
        // A failed load must not trap the host — they can still unpublish
        // quietly; we just can't offer the notify path without recipients.
        if (alive) setLoadError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [eventId]);

  async function runUnpublish(notify) {
    if (working) return;
    setBusy(notify ? "notify" : "quiet");
    try {
      // 1) The actual unpublish. This is the primary action — if it fails,
      //    nothing else should happen.
      const res = await authenticatedFetch(`/host/events/${eventId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "DRAFT" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Could not unpublish event", "error");
        setBusy(null);
        return; // keep the modal open so the host can retry
      }

      // 2) Optional guest broadcast. The event is already a draft now; we do
      //    NOT attach eventId (its card would link to a page guests can no
      //    longer see). A send failure must not undo the unpublish — we just
      //    tell the host their message didn't go out.
      let notifyFailed = false;
      const text = message.trim();
      if (notify && count > 0 && text) {
        try {
          const bres = await authenticatedFetch("/host/room/broadcast", {
            method: "POST",
            body: JSON.stringify({
              personIds,
              text,
              subject: `Update about ${titleLabel}`,
            }),
          });
          if (!bres.ok) notifyFailed = true;
        } catch {
          notifyFailed = true;
        }
      }

      onUnpublished?.(); // parent flips the header pill back to "Show preview"

      if (notify && count > 0) {
        if (notifyFailed) {
          showToast(
            "Unpublished — but your message to guests couldn't be sent",
            "warning"
          );
        } else {
          showToast(
            `Unpublished — ${count} ${count === 1 ? "guest" : "guests"} notified`,
            "success"
          );
        }
      } else {
        showToast("Event unpublished — back to draft", "success");
      }
      onClose?.();
    } catch {
      showToast("Could not unpublish event", "error");
      setBusy(null);
    }
  }

  const overlay = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    zIndex: 1200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  };
  const card = {
    background: colors.background,
    border: `1px solid ${colors.border}`,
    borderRadius: "20px",
    padding: "26px 24px 20px",
    maxWidth: "380px",
    width: "100%",
    boxShadow: "0 8px 30px rgba(10,10,10,0.12)",
    textAlign: "left",
  };

  return (
    <div style={overlay} onClick={working ? undefined : onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            fontSize: "17px",
            fontWeight: 700,
            color: colors.text,
            marginBottom: "8px",
          }}
        >
          Unpublish this event?
        </div>
        <div
          style={{
            fontSize: "13.5px",
            lineHeight: 1.5,
            color: colors.textMuted,
            marginBottom: hasGuests ? "14px" : "22px",
          }}
        >
          It moves back to draft and disappears from public view — the link will
          show a “not found” page, including for anyone who registered.
        </div>

        {loading && (
          <div
            style={{
              fontSize: "13px",
              color: colors.textSubtle,
              marginBottom: "20px",
            }}
          >
            Checking who’s registered…
          </div>
        )}

        {!loading && hasGuests && (
          <>
            <div
              style={{
                fontSize: "13px",
                lineHeight: 1.5,
                color: colors.warning,
                background: colors.warningRgba,
                border: `1px solid rgba(180, 83, 9, 0.22)`,
                borderRadius: "12px",
                padding: "11px 13px",
                marginBottom: "16px",
              }}
            >
              <strong>
                {count} {count === 1 ? "person has" : "people have"} registered.
              </strong>{" "}
              They stay on your guest list — nothing is deleted, and you can
              republish anytime.
            </div>

            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 600,
                color: colors.textMuted,
                marginBottom: "6px",
              }}
            >
              Message to guests (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              disabled={working}
              placeholder="Let them know why — and a new date, if there is one."
              style={{
                width: "100%",
                boxSizing: "border-box",
                resize: "vertical",
                fontFamily: "inherit",
                fontSize: "13.5px",
                lineHeight: 1.5,
                color: colors.text,
                background: colors.surfaceMuted,
                border: `1px solid ${colors.border}`,
                borderRadius: "12px",
                padding: "11px 13px",
                marginBottom: "6px",
              }}
            />
            <div
              style={{
                fontSize: "11.5px",
                color: colors.textSubtle,
                marginBottom: "18px",
              }}
            >
              Sent via WhatsApp where possible, email otherwise. Only used if you
              choose “Unpublish &amp; notify”.
            </div>
          </>
        )}

        {!loading && loadError && (
          <div
            style={{
              fontSize: "12.5px",
              color: colors.textSubtle,
              marginBottom: "18px",
            }}
          >
            Couldn’t load the guest list — you can still unpublish.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {!loading && hasGuests && (
            <button
              type="button"
              disabled={working || !message.trim()}
              onClick={() => runUnpublish(true)}
              style={{
                width: "100%",
                padding: "13px",
                borderRadius: "12px",
                border: "none",
                background: colors.accent,
                color: "#fff",
                fontSize: "14.5px",
                fontWeight: 700,
                cursor: working || !message.trim() ? "not-allowed" : "pointer",
                opacity: working || !message.trim() ? 0.6 : 1,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {busy === "notify" ? "Unpublishing…" : "Unpublish & notify guests"}
            </button>
          )}

          <button
            type="button"
            disabled={working || loading}
            onClick={() => runUnpublish(false)}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: "12px",
              border: `1px solid ${colors.borderStrong}`,
              background: hasGuests ? "transparent" : colors.accent,
              color: hasGuests ? colors.text : "#fff",
              fontSize: "14.5px",
              fontWeight: hasGuests ? 600 : 700,
              cursor: working || loading ? "not-allowed" : "pointer",
              opacity: working || loading ? 0.6 : 1,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {busy === "quiet"
              ? "Unpublishing…"
              : hasGuests
                ? "Unpublish quietly"
                : "Unpublish"}
          </button>

          <button
            type="button"
            disabled={working}
            onClick={onClose}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: "12px",
              border: "none",
              background: "transparent",
              color: colors.textMuted,
              fontSize: "14px",
              fontWeight: 600,
              cursor: working ? "not-allowed" : "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
