// frontend/src/components/ShareActions.jsx
// URL-only share + copy. No text, no title, no files.
// This guarantees the OG card is the only thing that shows in chat apps.

import { useState, useEffect } from "react";
import { useToast } from "./Toast";

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
        style={{
          padding: isMobile ? "10px 14px" : "10px 20px",
          borderRadius: "10px",
          border: "1px solid rgba(139, 92, 246, 0.3)",
          background: "rgba(139, 92, 246, 0.1)",
          color: "#a78bfa",
          fontWeight: 600,
          fontSize: isMobile ? "13px" : "14px",
          cursor: copying ? "wait" : "pointer",
          transition: "all 0.2s ease",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          whiteSpace: "nowrap",
          minWidth: isMobile ? "auto" : "fit-content",
        }}
        onMouseEnter={(e) => {
          if (!copying) {
            e.target.style.background = "rgba(139, 92, 246, 0.2)";
            e.target.style.borderColor = "rgba(139, 92, 246, 0.5)";
          }
        }}
        onMouseLeave={(e) => {
          if (!copying) {
            e.target.style.background = "rgba(139, 92, 246, 0.1)";
            e.target.style.borderColor = "rgba(139, 92, 246, 0.3)";
          }
        }}
      >
        <span style={{ fontSize: isMobile ? "16px" : "18px" }}>🔗</span>
        {!isMobile && <span>Share</span>}
      </button>

      <button
        onClick={handleCopy}
        disabled={copying}
        style={{
          padding: isMobile ? "10px 14px" : "10px 20px",
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,0.2)",
          background: "rgba(255,255,255,0.05)",
          color: "#fff",
          fontWeight: 600,
          fontSize: isMobile ? "13px" : "14px",
          cursor: copying ? "wait" : "pointer",
          transition: "all 0.2s ease",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          whiteSpace: "nowrap",
          minWidth: isMobile ? "auto" : "fit-content",
        }}
        onMouseEnter={(e) => {
          if (!copying) {
            e.target.style.background = "rgba(255,255,255,0.1)";
            e.target.style.borderColor = "rgba(255,255,255,0.3)";
          }
        }}
        onMouseLeave={(e) => {
          if (!copying) {
            e.target.style.background = "rgba(255,255,255,0.05)";
            e.target.style.borderColor = "rgba(255,255,255,0.2)";
          }
        }}
      >
        <span style={{ fontSize: isMobile ? "16px" : "18px" }}>📋</span>
        {!isMobile && <span>{copying ? "Copying..." : "Copy link"}</span>}
      </button>
    </div>
  );
}
