import { useState, useRef } from "react";
import { Smile } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { SilverIcon } from "./ui/SilverIcon.jsx";
import { colors } from "../theme/colors.js";
import {
  uploadProfileImage,
  validateImageFile,
  removeProfileImage as removeProfileImageUtil,
} from "../lib/imageUtils.js";

export function ProfileHeader({ user, stats, setUser, onSave, showToast }) {
  const [isHovering, setIsHovering] = useState(false);
  const fileInputRef = useRef(null);

  function handleImageClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      showToast?.(validation.error, "error");
      return;
    }

    try {
      const updated = await uploadProfileImage(file);
      setUser(updated);
      showToast?.("Profile picture updated!", "success");
    } catch (error) {
      console.error("Error processing image:", error);
      showToast?.(
        error.message || "Failed to upload image. Please try again.",
        "error"
      );
    }
  }

  async function handleDeletePicture() {
    try {
      if (onSave) {
        await removeProfileImageUtil(onSave, user);
        showToast?.("Profile picture removed", "success");
      } else {
        setUser({ ...user, profilePicture: null });
        showToast?.("Profile picture removed", "success");
      }
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
        gap: "clamp(12px, 3vw, 24px)",
        marginBottom: "clamp(16px, 4vw, 32px)",
        paddingBottom: "clamp(16px, 4vw, 32px)",
        borderBottom: `1px solid ${colors.border}`,
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
            width: "clamp(60px, 15vw, 80px)",
            height: "clamp(60px, 15vw, 80px)",
            borderRadius: "50%",
            background: user.profilePicture
              ? "transparent"
              : colors.surfaceMuted,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "clamp(28px, 7vw, 36px)",
            border: `2px solid ${colors.border}`,
            cursor: "pointer",
            overflow: "hidden",
            transition: "all 0.3s ease",
            position: "relative",
            flexShrink: 0,
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
                e.target.style.display = "none";
              }}
            />
          ) : (
            <SilverIcon as={Smile} size={24} />
          )}
          {isHovering && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(10,10,10,0.45)",
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
              background: colors.dangerRgba,
              border: `2px solid ${colors.border}`,
              color: colors.danger,
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

      <div style={{ flex: 1, minWidth: 0 }}>
        <h1
          style={{
            fontSize: "clamp(24px, 6vw, 36px)",
            fontWeight: 700,
            marginBottom: 8,
            lineHeight: "1.2",
            wordBreak: "break-word",
            color: colors.text,
          }}
        >
          {user.brand ? `${user.brand}` : "Your profile"}
        </h1>
        {user.name && (
          <div
            style={{
              fontSize: "clamp(13px, 3.5vw, 15px)",
              color: colors.textMuted,
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
              fontSize: "clamp(13px, 3.5vw, 14px)",
              color: colors.textMuted,
              lineHeight: "1.5",
              maxWidth: "600px",
              wordBreak: "break-word",
            }}
          >
            {user.bio}
          </div>
        )}
      </div>
    </div>
  );
}
