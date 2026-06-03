import { useState } from "react";
import { Share2, CalendarPlus, ExternalLink } from "lucide-react";
import { generateCalendarUrls, getEventShareUrl } from "../lib/urlUtils";
import { useToast } from "./Toast";
import { colors } from "../theme/colors.js";

// The quick CTAs at the top of every event Room — Share · Add to calendar · Live.
// Shown to everyone in the room (host + guest); pure utility, no permissions.
export function EventQuickActions({ slug, title, startsAt, endsAt, location, trailing = null }) {
  const { showToast } = useToast();
  const [calOpen, setCalOpen] = useState(false);
  if (!slug) return null;

  const shareUrl = getEventShareUrl(slug);
  const cal = startsAt ? generateCalendarUrls({ title, location, slug, startsAt, endsAt }) : {};

  async function share() {
    if (navigator.share) {
      try { await navigator.share({ url: shareUrl }); return; }
      catch (e) { if (e?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(shareUrl); showToast("Link copied!", "success"); }
    catch { showToast("Couldn't copy the link", "error"); }
  }

  const pill = {
    display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px",
    borderRadius: 999, border: `1px solid ${colors.border}`, background: "#fff",
    color: colors.text, fontSize: 13, fontWeight: 600, cursor: "pointer",
    textDecoration: "none", whiteSpace: "nowrap", fontFamily: "inherit",
  };
  const menuItem = {
    display: "block", padding: "9px 14px", fontSize: 13, color: colors.text,
    textDecoration: "none", whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" onClick={share} style={pill}>
        <Share2 size={15} /> Share
      </button>

      <div style={{ position: "relative" }}>
        <button type="button" onClick={() => setCalOpen((o) => !o)} style={pill} disabled={!startsAt}>
          <CalendarPlus size={15} /> Add to calendar
        </button>
        {calOpen && startsAt && (
          <>
            <div onClick={() => setCalOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 41,
              background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 12,
              boxShadow: "0 12px 30px rgba(0,0,0,0.12)", overflow: "hidden", minWidth: 160,
            }}>
              <a href={cal.google} target="_blank" rel="noreferrer" style={menuItem} onClick={() => setCalOpen(false)}>Google Calendar</a>
              <a href={cal.apple} download={`${(slug || "event")}.ics`} style={{ ...menuItem, borderTop: `1px solid ${colors.borderFaint || colors.border}` }} onClick={() => setCalOpen(false)}>Apple / iCal</a>
              <a href={cal.outlook} target="_blank" rel="noreferrer" style={{ ...menuItem, borderTop: `1px solid ${colors.borderFaint || colors.border}` }} onClick={() => setCalOpen(false)}>Outlook</a>
            </div>
          </>
        )}
      </div>

      <a href={`/e/${slug}`} target="_blank" rel="noreferrer" style={pill}>
        <ExternalLink size={15} /> Live
      </a>

      {/* Host-only extras (e.g. Room access) sit in the same row; a trailing node
          with width:100% will wrap to its own line below the pills. */}
      {trailing}
    </div>
  );
}
