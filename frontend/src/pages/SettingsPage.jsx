import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { authenticatedFetch } from "../lib/api.js";
import { SettingsTab } from "../components/HomeSettingsTab.jsx";
import { colors } from "../theme/colors.js";

export function SettingsPage() {
  const { user: authUser } = useAuth();
  const { showToast } = useToast();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      if (!authUser) {
        setLoading(false);
        return;
      }

      try {
        const res = await authenticatedFetch("/host/profile");
        if (res.ok) {
          const profile = await res.json();
          setUser(profile);
        } else {
          console.error("Failed to load profile");
          setUser(null);
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [authUser]);

  const handleSaveProfile = async (updates) => {
    if (!authUser) return;

    try {
      const res = await authenticatedFetch("/host/profile", {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        setUser(updated);
        window.dispatchEvent(new Event("profileUpdated"));
        return true;
      } else {
        throw new Error("Failed to save profile");
      }
    } catch (error) {
      console.error("Failed to save profile:", error);
      throw error;
    }
  };

  if (loading || !user) {
    return (
      <div
        className="page-with-header"
        style={{
          minHeight: "100vh",
          position: "relative",
          background: colors.background,
        }}
      >
        <div className="responsive-container responsive-container-wide">
          <div
            className="responsive-card"
            style={{
              background: colors.backgroundCard,
              border: `1px solid ${colors.border}`,
              boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
            }}
          >
            <div style={{ fontSize: "18px", color: colors.textMuted }}>
              Loading settings…
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="page-with-header"
      style={{
        minHeight: "100vh",
        position: "relative",
        background: colors.background,
        paddingBottom: "clamp(20px, 5vw, 40px)",
      }}
    >
      <div
        className="responsive-container responsive-container-wide"
        style={{ position: "relative", zIndex: 2 }}
      >
        <div
          className="responsive-card"
          style={{
            background: colors.backgroundCard,
            border: `1px solid ${colors.border}`,
            boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
          }}
        >
          <h1
            style={{
              fontSize: "clamp(22px, 5vw, 28px)",
              fontWeight: 700,
              marginBottom: "4px",
              color: colors.text,
            }}
          >
            Settings
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: colors.textMuted,
              marginBottom: "24px",
            }}
          >
            Manage your profile, your channels, and your account — everything that makes the Room yours.
          </p>
          <SettingsTab
            user={user}
            setUser={setUser}
            onSave={handleSaveProfile}
            showToast={showToast}
          />
        </div>
      </div>
    </div>
  );
}
