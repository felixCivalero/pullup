import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ScrollText, Calendar, Tag, Mail, Globe, Check, X, ChevronDown, ImagePlus, Trash2 } from "lucide-react";
import { DashboardEventCard } from "./DashboardEventCard";
import { SubTabToggle } from "./HomeTabs";
import { SilverIcon } from "./ui/SilverIcon.jsx";
import { uploadBrandLogo, removeBrandLogo } from "../lib/imageUtils.js";

function ProfileSection({ user, setUser, onSave, showToast }) {
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef(null);

  const isComplete = !!(user?.brand?.trim() && user?.contactEmail?.trim());
  const savedComplete = isComplete && !dirty;
  const [expanded, setExpanded] = useState(!isComplete);

  function handleChange(field, value) {
    setUser({ ...user, [field]: value });
    setDirty(true);
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = "";

    setLogoUploading(true);
    try {
      const updated = await uploadBrandLogo(file);
      setUser((prev) => ({ ...prev, brandLogo: updated.brandLogo }));
      showToast("Logo uploaded", "success");
    } catch (err) {
      showToast(err.message || "Failed to upload logo", "error");
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleLogoRemove() {
    setLogoUploading(true);
    try {
      await removeBrandLogo();
      setUser((prev) => ({ ...prev, brandLogo: null }));
      showToast("Logo removed", "success");
    } catch (err) {
      showToast(err.message || "Failed to remove logo", "error");
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleSave() {
    if (!dirty) return;
    setSaving(true);
    try {
      await onSave(user);
      setDirty(false);
      showToast("Profile saved", "success");
    } catch {
      showToast("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  const labelStyle = {
    fontSize: "11px",
    fontWeight: 700,
    color: "rgba(255,255,255,0.5)",
    marginBottom: "8px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    display: "flex",
    alignItems: "center",
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(20, 16, 30, 0.6)",
    color: "#fff",
    fontSize: "14px",
    outline: "none",
    transition: "border-color 0.2s",
  };

  return (
    <div style={{ marginBottom: "24px" }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, margin: 0 }}>
              Profile
            </h3>
            <ChevronDown
              size={14}
              style={{
                opacity: 0.4,
                transition: "transform 0.2s ease",
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </div>
          {!dirty && (
            savedComplete ? (
              <span style={{ fontSize: "11px", color: "rgba(34,197,94,0.8)", display: "flex", alignItems: "center", gap: "4px" }}>
                <SilverIcon as={Check} size={12} style={{ color: "rgba(34,197,94,0.8)" }} /> Complete
              </span>
            ) : (
              <span style={{ fontSize: "11px", color: "rgba(239,68,68,0.8)", display: "flex", alignItems: "center", gap: "4px" }}>
                <SilverIcon as={X} size={12} style={{ color: "rgba(239,68,68,0.8)" }} /> Incomplete
              </span>
            )
          )}
        </div>
        <p style={{ fontSize: "13px", opacity: 0.5, margin: 0, lineHeight: 1.4 }}>
          {isComplete
            ? "Your details appear in all guest-facing emails."
            : "Fill in your brand name and contact email to start creating events."}
        </p>
      </div>

      {expanded && (<>
      <div
        style={{
          marginTop: "12px",
          padding: "20px",
          borderRadius: "14px",
          background: isComplete
            ? "rgba(255,255,255,0.02)"
            : "rgba(245, 158, 11, 0.04)",
          border: isComplete
            ? "1px solid rgba(255,255,255,0.06)"
            : "1px solid rgba(245, 158, 11, 0.15)",
        }}
      >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {/* Brand Name */}
        <label style={{ display: "block" }}>
          <div style={labelStyle}>
            <SilverIcon as={Tag} size={12} style={{ marginRight: "5px" }} />
            Brand Name {!user?.brand?.trim() && <span style={{ color: "#f59e0b", marginLeft: "4px" }}>*</span>}
          </div>
          <input
            type="text"
            value={user?.brand || ""}
            onChange={(e) => handleChange("brand", e.target.value)}
            placeholder="Your brand or company name"
            style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.25)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
          />
        </label>

        {/* Contact Email */}
        <label style={{ display: "block" }}>
          <div style={labelStyle}>
            <SilverIcon as={Mail} size={12} style={{ marginRight: "5px" }} />
            Contact Email {!user?.contactEmail?.trim() && <span style={{ color: "#f59e0b", marginLeft: "4px" }}>*</span>}
          </div>
          <input
            type="email"
            value={user?.contactEmail || ""}
            onChange={(e) => handleChange("contactEmail", e.target.value)}
            placeholder="hello@yourbrand.com"
            style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.25)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
          />
          <div style={{ marginTop: "4px", fontSize: "11px", opacity: 0.4 }}>
            Guests will see this in emails instead of PullUp.
          </div>
        </label>

        {/* Website (optional) */}
        <label style={{ display: "block" }}>
          <div style={labelStyle}>
            <SilverIcon as={Globe} size={12} style={{ marginRight: "5px" }} />
            Website <span style={{ opacity: 0.5, fontWeight: 400, marginLeft: "4px" }}>optional</span>
          </div>
          <input
            type="url"
            value={user?.brandWebsite || ""}
            onChange={(e) => handleChange("brandWebsite", e.target.value)}
            placeholder="https://yourbrand.com"
            style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.25)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
          />
        </label>

        {/* Brand Logo (optional) */}
        <div>
          <div style={labelStyle}>
            <SilverIcon as={ImagePlus} size={12} style={{ marginRight: "5px" }} />
            Brand Logo <span style={{ opacity: 0.5, fontWeight: 400, marginLeft: "4px" }}>optional</span>
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleLogoUpload}
            style={{ display: "none" }}
          />
          {user?.brandLogo ? (
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  overflow: "hidden",
                  flexShrink: 0,
                  background: "rgba(20, 16, 30, 0.6)",
                }}
              >
                <img
                  src={user.brandLogo}
                  alt="Brand logo"
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); logoInputRef.current?.click(); }}
                disabled={logoUploading}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "transparent",
                  color: "#fff",
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: logoUploading ? "default" : "pointer",
                  opacity: logoUploading ? 0.5 : 0.7,
                }}
              >
                {logoUploading ? "Uploading..." : "Replace"}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleLogoRemove(); }}
                disabled={logoUploading}
                style={{
                  padding: "6px",
                  borderRadius: "8px",
                  border: "1px solid rgba(239,68,68,0.2)",
                  background: "rgba(239,68,68,0.1)",
                  color: "#ef4444",
                  cursor: logoUploading ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: logoUploading ? 0.5 : 1,
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); logoInputRef.current?.click(); }}
              disabled={logoUploading}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "10px",
                border: "1px dashed rgba(255,255,255,0.15)",
                background: "rgba(20, 16, 30, 0.4)",
                color: "rgba(255,255,255,0.5)",
                fontSize: "13px",
                cursor: logoUploading ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "border-color 0.2s, background 0.2s",
              }}
              onMouseEnter={(e) => {
                if (!logoUploading) {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
                  e.currentTarget.style.background = "rgba(20, 16, 30, 0.6)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                e.currentTarget.style.background = "rgba(20, 16, 30, 0.4)";
              }}
            >
              <ImagePlus size={16} />
              {logoUploading ? "Uploading..." : "Upload logo"}
            </button>
          )}
          <div style={{ marginTop: "4px", fontSize: "11px", opacity: 0.4 }}>
            Max 200×200px. Used in emails and branding. Keep it simple.
          </div>
        </div>
      </div>

      {/* Save button */}
      {dirty && (
        <button
          onClick={(e) => { e.stopPropagation(); handleSave(); }}
          disabled={saving}
          style={{
            marginTop: "16px",
            padding: "10px 24px",
            borderRadius: "999px",
            border: "none",
            background: "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)",
            color: "#fff",
            fontWeight: 700,
            fontSize: "13px",
            cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.6 : 1,
            boxShadow: "0 4px 16px rgba(192, 192, 192, 0.3)",
            transition: "all 0.3s ease",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      )}
      </div>
      </>)}
    </div>
  );
}

const createBtnStyle = {
  width: "100%",
  maxWidth: "280px",
  margin: "0 auto",
  padding: "14px 28px",
  borderRadius: "999px",
  border: "none",
  background: "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)",
  color: "#fff",
  fontWeight: 600,
  fontSize: "15px",
  cursor: "pointer",
  transition: "all 0.3s ease",
  boxShadow: "0 4px 16px rgba(192, 192, 192, 0.3)",
  touchAction: "manipulation",
};

export function EventsTab({
  upcomingEvents,
  pastEvents,
  eventFilter,
  setEventFilter,
  loadingPast,
  user,
  setUser,
  onSaveProfile,
  showToast,
}) {
  const navigate = useNavigate();
  const [createBlocked, setCreateBlocked] = useState(false);
  const safeUpcoming = upcomingEvents || [];
  const safePast = pastEvents || [];

  const filteredEvents = eventFilter === "past" ? safePast : safeUpcoming;
  const isLoading = eventFilter === "past" && loadingPast;
  const profileComplete = !!(user?.brand?.trim() && user?.contactEmail?.trim());

  function handleCreateClick() {
    if (profileComplete) {
      navigate("/create");
    } else {
      setCreateBlocked(true);
      showToast("Fill in your brand name and contact email first", "error");
      // Scroll to top so they see the profile section
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setCreateBlocked(false), 2000);
    }
  }

  return (
    <>
      {/* Profile Section */}
      <ProfileSection
        user={user}
        setUser={setUser}
        onSave={onSaveProfile}
        showToast={showToast}
      />

      {/* Shake animation for blocked create button */}
      {createBlocked && (
        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-6px); }
            40% { transform: translateX(6px); }
            60% { transform: translateX(-4px); }
            80% { transform: translateX(4px); }
          }
        `}</style>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 12px" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 600, margin: 0 }}>Events</h3>
        <SubTabToggle
          leftLabel="Coming"
          leftCount={safeUpcoming.length}
          rightLabel="Past"
          rightCount={safePast.length}
          active={eventFilter === "past" ? "right" : "left"}
          onChange={(key) => setEventFilter(key === "right" ? "past" : "upcoming")}
        />
      </div>

      {/* List / empty state */}
      {isLoading ? (
        <div
          style={{
            textAlign: "center",
            padding: "40px 20px",
            opacity: 0.7,
          }}
        >
          <div style={{ fontSize: "clamp(16px, 4vw, 18px)", fontWeight: 600 }}>
            Loading past events…
          </div>
        </div>
      ) : filteredEvents.length === 0 ? (
        <>
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              opacity: 0.6,
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>
              {eventFilter === "past" ? (
                <SilverIcon as={ScrollText} size={18} />
              ) : (
                <SilverIcon as={Calendar} size={18} />
              )}
            </div>
            <div
              style={{
                fontSize: "clamp(16px, 4vw, 18px)",
                fontWeight: 600,
                marginBottom: "8px",
              }}
            >
              No {eventFilter} events
            </div>
            <div
              style={{
                fontSize: "clamp(13px, 3vw, 14px)",
                opacity: 0.7,
                marginBottom: eventFilter === "upcoming" ? "24px" : "0",
              }}
            >
              {eventFilter === "upcoming" &&
                "You don't have any upcoming events yet."}
              {eventFilter === "past" && "Your past events will appear here."}
            </div>
            {eventFilter === "upcoming" && (
              <button
                onClick={handleCreateClick}
                style={{
                  ...createBtnStyle,
                  ...(createBlocked ? {
                    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                    boxShadow: "0 4px 16px rgba(239, 68, 68, 0.4)",
                    animation: "shake 0.4s ease",
                  } : {}),
                }}
                onMouseEnter={(e) => {
                  if (!createBlocked) {
                    e.target.style.transform = "translateY(-2px)";
                    e.target.style.boxShadow = "0 12px 30px rgba(192, 192, 192, 0.5)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!createBlocked) {
                    e.target.style.transform = "translateY(0)";
                    e.target.style.boxShadow = "0 4px 16px rgba(192, 192, 192, 0.3)";
                  }
                }}
              >
                Create Event
              </button>
            )}
          </div>
        </>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {filteredEvents.map((ev, index) => (
            <DashboardEventCard
              key={ev.id}
              event={ev}
              index={index}
              onPreview={`/e/${ev.slug}`}
              onManage={() => navigate(`/app/events/${ev.id}/manage`)}
            />
          ))}

          {/* Create button below event list */}
          {eventFilter === "upcoming" && (
            <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
              <button
                onClick={handleCreateClick}
                style={{
                  ...createBtnStyle,
                  maxWidth: "220px",
                  padding: "12px 24px",
                  fontSize: "14px",
                  ...(createBlocked ? {
                    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                    boxShadow: "0 4px 16px rgba(239, 68, 68, 0.4)",
                    animation: "shake 0.4s ease",
                  } : {}),
                }}
                onMouseEnter={(e) => {
                  if (!createBlocked) {
                    e.target.style.transform = "translateY(-2px)";
                    e.target.style.boxShadow = "0 12px 30px rgba(192, 192, 192, 0.5)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!createBlocked) {
                    e.target.style.transform = "translateY(0)";
                    e.target.style.boxShadow = "0 4px 16px rgba(192, 192, 192, 0.3)";
                  }
                }}
              >
                Create Event
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
