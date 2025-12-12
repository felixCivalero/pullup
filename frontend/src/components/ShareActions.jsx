// frontend/src/components/ShareActions.jsx
// Reusable share and copy link component
import { useState } from "react";
import { useToast } from "./Toast";

/**
 * ShareActions component
 * @param {Object} props
 * @param {string} props.url - Full URL to share/copy
 * @param {string} props.title - Title for share (optional)
 * @param {string} props.text - Share text (optional, will use title + url if not provided)
 * @param {string} props.imageUrl - Image URL to include in share (optional, for Web Share API)
 */
export function ShareActions({ url, title, text, imageUrl }) {
  const { showToast } = useToast();
  const [copying, setCopying] = useState(false);

  const handleShare = async () => {
    if (!navigator.share) {
      // Fallback to copy if Web Share API not available
      handleCopy();
      return;
    }

    try {
      const shareData = {
        title: title || "Check this out",
        text: text || url,
        url: url,
      };

      // Include image if provided and Web Share API supports files
      // Note: File sharing requires fetching the image first
      if (imageUrl && navigator.canShare) {
        try {
          // Try to fetch and share as file (for platforms that support it)
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const file = new File([blob], "event-image.jpg", { type: blob.type });

          // Check if we can share files
          if (navigator.canShare({ files: [file] })) {
            shareData.files = [file];
          }
        } catch (imgError) {
          // If image fetch fails, share without image
          console.log("Could not include image in share:", imgError);
        }
      }

      await navigator.share(shareData);
    } catch (err) {
      // User cancelled or error occurred
      if (err.name !== "AbortError") {
        console.error("Error sharing:", err);
        // Fallback to copy on error
        handleCopy();
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
        gap: "12px",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <button
        onClick={handleShare}
        disabled={copying}
        style={{
          padding: "10px 20px",
          borderRadius: "8px",
          border: "1px solid rgba(139, 92, 246, 0.3)",
          background: "rgba(139, 92, 246, 0.1)",
          color: "#a78bfa",
          fontWeight: 500,
          fontSize: "14px",
          cursor: copying ? "wait" : "pointer",
          transition: "all 0.2s ease",
          display: "flex",
          alignItems: "center",
          gap: "8px",
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
        <span>🔗</span>
        <span>Share</span>
      </button>

      <button
        onClick={handleCopy}
        disabled={copying}
        style={{
          padding: "10px 20px",
          borderRadius: "8px",
          border: "1px solid rgba(255,255,255,0.2)",
          background: "rgba(255,255,255,0.05)",
          color: "#fff",
          fontWeight: 500,
          fontSize: "14px",
          cursor: copying ? "wait" : "pointer",
          transition: "all 0.2s ease",
          display: "flex",
          alignItems: "center",
          gap: "8px",
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
        <span>📋</span>
        <span>{copying ? "Copying..." : "Copy link"}</span>
      </button>
    </div>
  );
}
