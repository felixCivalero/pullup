// frontend/src/components/ShareActions.jsx
// URL-only share + copy. No text, no title, no files.
// This guarantees the OG card is the only thing that shows in chat apps.

import { useState, useEffect } from "react";
import { Link2, ClipboardList } from "lucide-react";
import { useToast } from "./Toast";
import { colors } from "../theme/colors.js";

export function ShareActions({ url }) {
  const { showToast } = useToast();
  const [copying, setCopying] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleShare = async () => {
    // If Web Share API isn't available, copy instead.
    if (!navigator.share) {
      await handleCopy();
      return;
    }

    try {
      // URL ONLY. No title. No text. No files.
      await navigator.share({ url });
    } catch (err) {
      // If user cancels, do nothing. If it's a real error, fall back to copy.
      if (err?.name !== "AbortError") {
        console.error("Error sharing:", err);
        await handleCopy();
      }
    }
  };

  const handleCopy = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied!", "success");
    } catch (err) {
      console.error("Failed to copy:", err);
      showToast("Failed to copy link", "error");
    } finally {
      setCopying(false);
    }
  };

  const pillStyle = {
    padding: isMobile ? "10px 14px" : "10px 20px",
    borderRadius: "999px",
    border: `1px solid ${colors.border}`,
    background: "#ffffff",
    color: colors.text,
    fontWeight: 600,
    fontSize: isMobile ? "13px" : "14px",
    cursor: copying ? "wait" : "pointer",
    transition: "all 0.2s ease",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    whiteSpace: "nowrap",
    minWidth: isMobile ? "auto" : "fit-content",
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        alignItems: "center",
        flexWrap: "nowrap",
      }}
    >
      <button
        onClick={handleShare}
        disabled={copying}
        style={pillStyle}
        onMouseEnter={(e) => {
          if (!copying) {
            e.currentTarget.style.borderColor = colors.accentBorder;
            e.currentTarget.style.color = colors.accent;
          }
        }}
        onMouseLeave={(e) => {
          if (!copying) {
            e.currentTarget.style.borderColor = colors.border;
            e.currentTarget.style.color = colors.text;
          }
        }}
      >
        <Link2 size={isMobile ? 16 : 18} strokeWidth={1.75} style={{ color: "inherit", flexShrink: 0 }} />
        {!isMobile && <span>Share</span>}
      </button>

      <button
        onClick={handleCopy}
        disabled={copying}
        style={pillStyle}
        onMouseEnter={(e) => {
          if (!copying) {
            e.currentTarget.style.borderColor = colors.accentBorder;
            e.currentTarget.style.color = colors.accent;
          }
        }}
        onMouseLeave={(e) => {
          if (!copying) {
            e.currentTarget.style.borderColor = colors.border;
            e.currentTarget.style.color = colors.text;
          }
        }}
      >
        <ClipboardList size={isMobile ? 16 : 18} strokeWidth={1.75} style={{ color: "inherit", flexShrink: 0 }} />
        {!isMobile && <span>{copying ? "Copying..." : "Copy link"}</span>}
      </button>
    </div>
  );
}
