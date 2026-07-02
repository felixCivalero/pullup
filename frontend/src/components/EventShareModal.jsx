// Share popup — two childishly clear targets: the event PAGE (the public
// invite, where people sign up) and the ROOM (where guests land once they're
// in). The per-channel chips keep the utm tracking so Insights still knows
// which channel drove the traffic. Used from the home poster wall AND the
// event Room's top toolbar — one share language everywhere.
import { useState, useEffect } from "react";
import { Check, Copy, Link2, Share2 } from "lucide-react";
import { useToast } from "./Toast";
import { colors } from "../theme/colors.js";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function useIsMobile(maxWidth = 640) {
  const [mobile, setMobile] = useState(
    typeof window !== "undefined" ? window.matchMedia(`(max-width: ${maxWidth}px)`).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const on = (e) => setMobile(e.matches);
    on(mq);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [maxWidth]);
  return mobile;
}

// One share target — a labelled link row with Copy (+ native share where the
// platform has it). Used twice: the event page and the room.
function ShareBlock({ id, title, sub, url, copied, onCopy, canNative, onNative, children }) {
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 16, padding: "14px 15px", background: colors.surface }}>
      <div style={{ fontSize: "14px", fontWeight: 800, color: colors.text }}>{title}</div>
      <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: 2, lineHeight: 1.45 }}>{sub}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: "12px", color: colors.textSubtle, background: colors.surfaceMuted, border: `1px solid ${colors.borderFaint}`, borderRadius: 10, padding: "9px 11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl", textAlign: "left" }}>{url.replace(/^https?:\/\//, "")}</span>
        <button onClick={() => onCopy(id, url)} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 15px", borderRadius: 999, border: "none", background: copied === id ? "#16a34a" : colors.accent, color: "#fff", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", fontFamily: SF, transition: "background 0.15s" }}>
          {copied === id ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
        </button>
        {canNative && (
          <button onClick={() => onNative(url)} title="Share…" style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 999, border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Share2 size={15} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function EventShareModal({ event, onClose }) {
  const isMobile = useIsMobile();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(null);
  const origin = window.location.origin;
  const pageUrl = `${origin}/e/${event.slug}`;
  const roomUrl = `${origin}/events/${event.id}/room`;
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";

  function copy(key, url) {
    navigator.clipboard.writeText(url);
    setCopied(key);
    showToast("Link copied!");
    setTimeout(() => setCopied(null), 1800);
  }
  function trackedUrl(source) {
    const u = new URL(pageUrl);
    u.searchParams.set("utm_source", source);
    u.searchParams.set("utm_medium", "social");
    u.searchParams.set("utm_campaign", event.slug || event.id);
    return u.toString();
  }
  async function native(url) {
    try { await navigator.share({ title: event.title, url }); } catch { /* user dismissed */ }
  }

  const CHANNELS = [
    { key: "instagram", label: "Instagram" }, { key: "tiktok", label: "TikTok" },
    { key: "facebook", label: "Facebook" }, { key: "twitter", label: "X" }, { key: "linkedin", label: "LinkedIn" },
  ];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(10,10,10,0.42)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 16 }}>
      <style>{`@keyframes shareModalUp { 0% { transform: translateY(100%); } 100% { transform: translateY(0); } } @keyframes shareModalDrop { 0% { opacity: 0; transform: translateY(-6px); } 100% { opacity: 1; transform: translateY(0); } }`}</style>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 470, background: colors.background, borderRadius: isMobile ? "20px 20px 0 0" : 20, border: `1px solid ${colors.border}`, boxShadow: "0 24px 70px rgba(10,10,10,0.28)", padding: "18px 18px 20px", fontFamily: SF, animation: isMobile ? "shareModalUp 0.2s ease-out" : "shareModalDrop 0.16s ease-out" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "15.5px", fontWeight: 800, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Share “{event.title}”</div>
          </div>
          <button onClick={onClose} style={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", border: "none", background: colors.surfaceMuted, color: colors.textMuted, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ShareBlock id="page" title="Event page" sub="The public invite — where people discover it and sign up." url={pageUrl} copied={copied} onCopy={copy} canNative={canNative} onNative={native}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {CHANNELS.map((ch) => (
                <button key={ch.key} onClick={() => copy(ch.key, trackedUrl(ch.key))} title={`Copy a tracked link for ${ch.label} — Insights will show what it drove`} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 999, border: `1px solid ${copied === ch.key ? "rgba(34,197,94,0.4)" : colors.border}`, background: copied === ch.key ? "rgba(34,197,94,0.1)" : colors.surface, cursor: "pointer", fontSize: "11.5px", fontWeight: 600, color: copied === ch.key ? "#16a34a" : colors.textMuted, fontFamily: SF }}>
                  {copied === ch.key ? <Check size={12} /> : <Link2 size={12} />}
                  {copied === ch.key ? "Copied" : `for ${ch.label}`}
                </button>
              ))}
            </div>
          </ShareBlock>
          <ShareBlock id="room" title="Room" sub="Where your guests hang out — send it to people who are already in." url={roomUrl} copied={copied} onCopy={copy} canNative={canNative} onNative={native} />
        </div>
      </div>
    </div>
  );
}

export default EventShareModal;
