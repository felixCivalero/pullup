import { useState, useRef } from "react";
import { authenticatedFetch } from "../lib/api.js";

export function ProfileHeader({ user, stats, setUser, onSave, showToast }) {
  const [isHovering, setIsHovering] = useState(false);
  const fileInputRef = useRef(null);

  function handleImageClick() {
    fileInputRef.current?.click();
  }

  function compressImage(file, maxWidth = 400, maxHeight = 400, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Calculate new dimensions
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }

          // Create canvas and compress
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to base64 with compression
          const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(compressedDataUrl);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      showToast?.("Please select an image file", "error");
      return;
    }

    // Validate file size (max 5MB before compression)
    if (file.size > 5 * 1024 * 1024) {
      showToast?.("Image size must be less than 5MB", "error");
      return;
    }

    try {
      // Compress and resize image before uploading
      const compressedImageUrl = await compressImage(file);

      // Upload to API
      const res = await authenticatedFetch("/host/profile/picture", {
        method: "POST",
        body: JSON.stringify({ imageData: compressedImageUrl }),
      });

      if (res.ok) {
        const updated = await res.json();
        setUser(updated);
        showToast?.("Profile picture updated! ✨", "success");
      } else {
        throw new Error("Failed to upload image");
      }
    } catch (error) {
      console.error("Error processing image:", error);
      showToast?.("Failed to upload image. Please try again.", "error");
    }
  }

  async function handleDeletePicture() {
    try {
      // Update profile to remove picture
      if (onSave) {
        await onSave({ ...user, profilePicture: null });
        showToast?.("Profile picture removed", "success");
      } else {
        setUser({ ...user, profilePicture: null });
        showToast?.("Profile picture removed", "success");
      }
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error removing picture:", error);
      showToast?.("Failed to remove picture", "error");
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 24,
        marginBottom: 32,
        paddingBottom: 32,
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div
        style={{
          position: "relative",
          flexShrink: 0,
        }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: user.profilePicture
              ? "transparent"
              : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            border: "2px solid rgba(255,255,255,0.1)",
            cursor: "pointer",
            overflow: "hidden",
            transition: "all 0.3s ease",
            position: "relative",
          }}
          onClick={handleImageClick}
        >
          {user.profilePicture ? (
            <img
              src={user.profilePicture}
              alt="Profile"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              onError={(e) => {
                console.error(
                  "Failed to load profile image:",
                  user.profilePicture
                );
                // Fallback to emoji if image fails to load
                e.target.style.display = "none";
              }}
            />
          ) : (
            "😊"
          )}
          {isHovering && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0, 0, 0, 0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                fontSize: "20px",
              }}
            >
              ⬆️
            </div>
          )}
        </div>
        {isHovering && user.profilePicture && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeletePicture();
            }}
            style={{
              position: "absolute",
              bottom: "-8px",
              right: "-8px",
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: "rgba(239, 68, 68, 0.9)",
              border: "2px solid rgba(255,255,255,0.2)",
              color: "#fff",
              fontSize: "14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
            }}
            title="Delete picture"
          >
            ×
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
      </div>

      <div style={{ flex: 1 }}>
        <h1
          style={{
            fontSize: "clamp(28px, 5vw, 36px)",
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          {user.brand ? `${user.brand}` : "Your Brand"}
        </h1>
        {user.name && (
          <div
            style={{
              fontSize: "15px",
              opacity: 0.7,
              marginBottom: user.bio ? 12 : 0,
              fontWeight: 500,
            }}
          >
            Managed by {user.name}
          </div>
        )}
        {user.bio && (
          <div
            style={{
              fontSize: "14px",
              opacity: 0.8,
              lineHeight: "1.5",
              maxWidth: "600px",
            }}
          >
            {user.bio}
          </div>
        )}
      </div>
    </div>
  );
}
