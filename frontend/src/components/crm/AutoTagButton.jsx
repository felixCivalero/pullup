import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";

// Pill button that walks a list of events sequentially, asking the backend
// to generate tags for each one. Designed to be dropped into any CRM-style
// page; per-event animation lives in the parent via the onEventTagged
// callback so it can highlight whatever row representation it uses.
//
// Props:
//   events           — Array<{ id, title, adminTags? }>
//   endpoint         — (eventId) => string, e.g. id => `/events/${id}/auto-tag`
//   onEventTagged    — ({ eventId, adminTags, generatedTags, addedCount }) => void
//                      Called after each successful response. Parent merges
//                      into its state and triggers any row-level animation.
//   onEventStart     — (eventId) => void  (optional, fires before request)
//   onAllDone        — ({ tagged, addedTotal }) => void  (optional)
//   label            — button text (default "Auto-tag with AI")
//   buttonStyle      — extra style merged into the button
//
// The button itself opens a small inline confirmation popover before
// starting. While running it morphs into a sticky progress strip with a
// cancel X.

export function AutoTagButton({
  events,
  endpoint,
  onEventTagged,
  onEventStart,
  onAllDone,
  label = "Auto-tag with AI",
  buttonStyle,
  className,
}) {
  const [stage, setStage] = useState("idle"); // idle | confirm | running | done
  const [includeTagged, setIncludeTagged] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, currentTitle: "", addedTotal: 0 });
  const cancelRef = useRef(false);

  useEffect(() => () => { cancelRef.current = true; }, []);

  const untaggedCount = events.filter((e) => !(e.adminTags && e.adminTags.length)).length;
  const targetCount = includeTagged ? events.length : untaggedCount;

  async function runTagging() {
    const targets = includeTagged
      ? events
      : events.filter((e) => !(e.adminTags && e.adminTags.length));
    if (targets.length === 0) {
      setStage("idle");
      return;
    }

    cancelRef.current = false;
    setStage("running");
    setProgress({ done: 0, total: targets.length, currentTitle: targets[0]?.title || "", addedTotal: 0 });

    let addedTotal = 0;
    let tagged = 0;
    for (let i = 0; i < targets.length; i += 1) {
      if (cancelRef.current) break;
      const ev = targets[i];
      setProgress((p) => ({ ...p, currentTitle: ev.title || "", done: i }));
      onEventStart?.(ev.id);
      try {
        const res = await authenticatedFetch(endpoint(ev.id), { method: "POST" });
        if (!res.ok) {
          console.error("[AutoTag] failed for event", ev.id, await res.text().catch(() => ""));
          continue;
        }
        const data = await res.json();
        if (cancelRef.current) break;
        addedTotal += data.addedCount || 0;
        tagged += 1;
        onEventTagged?.({
          eventId: ev.id,
          adminTags: data.adminTags || [],
          generatedTags: data.generatedTags || [],
          addedCount: data.addedCount || 0,
        });
        setProgress((p) => ({ ...p, done: i + 1, addedTotal }));
      } catch (err) {
        console.error("[AutoTag] error for event", ev.id, err);
      }
    }

    setStage("done");
    onAllDone?.({ tagged, addedTotal });
    // Auto-dismiss the success state after a beat
    setTimeout(() => {
      if (!cancelRef.current) setStage("idle");
    }, 3500);
  }

  function cancel() {
    cancelRef.current = true;
    setStage("idle");
  }

  if (stage === "running") {
    return (
      <div
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 14px",
          borderRadius: 999,
          border: "1px solid rgba(251,191,36,0.35)",
          background:
            "linear-gradient(90deg, rgba(251,191,36,0.18), rgba(251,191,36,0.08))",
          minWidth: 260,
          maxWidth: 480,
          ...buttonStyle,
        }}
      >
        <Sparkles size={14} style={{ color: "#fbbf24", flexShrink: 0, animation: "autotag-pulse 1.4s ease-in-out infinite" }} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#fbbf24",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Tagging {progress.done}/{progress.total}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.75)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {progress.currentTitle || "…"}
          </div>
        </div>
        <button
          type="button"
          onClick={cancel}
          aria-label="Cancel tagging"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 4,
            borderRadius: 6,
            border: "none",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.7)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <X size={12} />
        </button>
        <style>{`
          @keyframes autotag-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.55; transform: scale(0.85); }
          }
        `}</style>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderRadius: 999,
          border: "1px solid rgba(34,197,94,0.35)",
          background: "rgba(34,197,94,0.12)",
          color: "#4ade80",
          fontSize: 12,
          fontWeight: 600,
          ...buttonStyle,
        }}
      >
        <Sparkles size={14} />
        Tagged {progress.done} event{progress.done === 1 ? "" : "s"} · +{progress.addedTotal} tag{progress.addedTotal === 1 ? "" : "s"}
      </div>
    );
  }

  if (stage === "confirm") {
    return (
      <div
        className={className}
        style={{
          position: "relative",
          display: "inline-flex",
          flexDirection: "column",
          gap: 8,
          padding: "10px 14px",
          borderRadius: 14,
          border: "1px solid rgba(251,191,36,0.35)",
          background: "rgba(20,16,30,0.95)",
          boxShadow: "0 14px 40px rgba(0,0,0,0.55)",
          minWidth: 260,
          ...buttonStyle,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#fbbf24",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Sparkles size={12} /> AI auto-tag
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}>
          Will scan{" "}
          <span style={{ color: "#fff", fontWeight: 700 }}>
            {targetCount} event{targetCount === 1 ? "" : "s"}
          </span>{" "}
          and add tags. Manual edits are preserved.
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "rgba(255,255,255,0.6)",
            cursor: events.length === untaggedCount ? "default" : "pointer",
            opacity: events.length === untaggedCount ? 0.4 : 1,
          }}
        >
          <input
            type="checkbox"
            checked={includeTagged}
            disabled={events.length === untaggedCount}
            onChange={(e) => setIncludeTagged(e.target.checked)}
            style={{ margin: 0 }}
          />
          Re-scan already-tagged events too
        </label>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => setStage("idle")}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "transparent",
              color: "rgba(255,255,255,0.6)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={runTagging}
            disabled={targetCount === 0}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              background:
                targetCount === 0
                  ? "rgba(255,255,255,0.06)"
                  : "linear-gradient(135deg, rgba(251,191,36,0.85), rgba(251,191,36,0.55))",
              color: targetCount === 0 ? "rgba(255,255,255,0.4)" : "#1a1410",
              fontSize: 11,
              fontWeight: 700,
              cursor: targetCount === 0 ? "default" : "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Start
          </button>
        </div>
      </div>
    );
  }

  // idle
  return (
    <button
      type="button"
      className={className}
      onClick={() => setStage("confirm")}
      disabled={events.length === 0}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 14px",
        borderRadius: 999,
        border: "1px solid rgba(251,191,36,0.35)",
        background: "rgba(251,191,36,0.08)",
        color: "#fbbf24",
        fontSize: 12,
        fontWeight: 600,
        cursor: events.length === 0 ? "not-allowed" : "pointer",
        opacity: events.length === 0 ? 0.4 : 1,
        whiteSpace: "nowrap",
        ...buttonStyle,
      }}
    >
      <Sparkles size={13} />
      {label}
      {untaggedCount > 0 && events.length > 0 && (
        <span
          style={{
            marginLeft: 4,
            padding: "1px 6px",
            borderRadius: 999,
            background: "rgba(251,191,36,0.18)",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {untaggedCount}
        </span>
      )}
    </button>
  );
}

// CSS injected once, used by parents to flash a row when AI just tagged it.
// Apply via className="autotag-flash" — auto-removes after 1.2s.
export const AutoTagFlashStyle = (
  <style>{`
    @keyframes autotag-row-flash {
      0%   { background: rgba(251,191,36,0.0); box-shadow: inset 0 0 0 0 rgba(251,191,36,0.0); }
      15%  { background: rgba(251,191,36,0.18); box-shadow: inset 0 0 0 1px rgba(251,191,36,0.45); }
      100% { background: rgba(251,191,36,0.0); box-shadow: inset 0 0 0 0 rgba(251,191,36,0.0); }
    }
    .autotag-flash {
      animation: autotag-row-flash 1.4s ease-out;
    }
    @keyframes autotag-tag-in {
      0%   { opacity: 0; transform: translateY(4px) scale(0.92); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    .autotag-tag-new {
      animation: autotag-tag-in 0.45s ease-out both;
    }
  `}</style>
);
