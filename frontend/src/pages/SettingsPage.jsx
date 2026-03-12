import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { authenticatedFetch } from "../lib/api.js";
import { SettingsTab } from "../components/HomeSettingsTab.jsx";

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
          background:
            "radial-gradient(circle at 20% 50%, rgba(192, 192, 192, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232, 232, 232, 0.08) 0%, transparent 50%), #05040a",
        }}
      >
        <div className="responsive-container responsive-container-wide">
          <div
            className="responsive-card"
            style={{
              background: "rgba(12, 10, 18, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div style={{ fontSize: "18px", opacity: 0.8 }}>
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
        background:
          "radial-gradient(circle at 20% 50%, rgba(192, 192, 192, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232, 232, 232, 0.08) 0%, transparent 50%), #05040a",
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
            background: "rgba(12, 10, 18, 0.6)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <h1
            style={{
              fontSize: "clamp(22px, 5vw, 28px)",
              fontWeight: 700,
              marginBottom: "16px",
            }}
          >
            Settings
          </h1>
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

