import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";

import { ProfileHeader } from "../components/HomeProfileHeader";
import { TabButton } from "../components/HomeTabs";
import { EventsTab } from "../components/HomeEventsTab";
import { SettingsTab } from "../components/HomeSettingsTab";
import { IntegrationsTab } from "../components/HomeIntegrationsTab";
import { CrmTab } from "../components/HomeCrmTab";

import { authenticatedFetch } from "../lib/api.js";

function isNetworkError(error) {
  return (
    error instanceof TypeError ||
    error.message.includes("Failed to fetch") ||
    error.message.includes("NetworkError")
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { user: authUser } = useAuth();

  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [user, setUser] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Check for tab query parameter
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get("tab") || "events";
  }); // "events" | "settings" | "integrations" | "crm"
  const [eventFilter, setEventFilter] = useState("upcoming"); // "upcoming" | "past"
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Load profile from API
  useEffect(() => {
    async function loadProfile() {
      if (!authUser) {
        setProfileLoading(false);
        return;
      }

      try {
        const res = await authenticatedFetch("/host/profile");
        if (res.ok) {
          const profile = await res.json();

          // Migrate localStorage data if profile is empty and localStorage has data
          const stored = localStorage.getItem("pullup_user");
          if (stored && (!profile.name || !profile.brand)) {
            try {
              const parsed = JSON.parse(stored);
              // Merge localStorage data with profile
              const migratedProfile = {
                ...profile,
                name: profile.name || parsed.name || "",
                brand: profile.brand || parsed.brand || "",
                bio: profile.bio || parsed.bio || "",
                profilePicture:
                  profile.profilePicture || parsed.profilePicture || null,
                brandingLinks: profile.brandingLinks ||
                  parsed.brandingLinks || {
                    instagram: "",
                    x: "",
                    youtube: "",
                    tiktok: "",
                    linkedin: "",
                    website: "",
                  },
                emails: profile.emails || parsed.emails || [],
                mobileNumber: profile.mobileNumber || parsed.mobileNumber || "",
                thirdPartyAccounts:
                  profile.thirdPartyAccounts || parsed.thirdPartyAccounts || [],
              };

              // Save migrated data to Supabase
              const saveRes = await authenticatedFetch("/host/profile", {
                method: "PUT",
                body: JSON.stringify(migratedProfile),
              });

              if (saveRes.ok) {
                const saved = await saveRes.json();
                setUser(saved);
                // Clear localStorage after successful migration
                localStorage.removeItem("pullup_user");
              } else {
                setUser(profile);
              }
            } catch (migrationError) {
              console.error("Migration error:", migrationError);
              setUser(profile);
            }
          } else {
            setUser(profile);
          }
        } else {
          console.error("Failed to load profile");
          setUser(null);
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
        setUser(null);
      } finally {
        setProfileLoading(false);
      }
    }

    loadProfile();
  }, [authUser]);

  // Save profile to API when user updates (debounced)
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
        return true;
      } else {
        throw new Error("Failed to save profile");
      }
    } catch (error) {
      console.error("Failed to save profile:", error);
      throw error;
    }
  };

  // Sync activeTab with URL query parameter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get("tab");
    if (
      tabParam &&
      ["events", "settings", "integrations", "crm"].includes(tabParam)
    ) {
      setActiveTab(tabParam);
    }
  }, [location.search]);

  useEffect(() => {
    function handleMouseMove(e) {
      setMousePosition({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    async function loadEvents() {
      setNetworkError(false);
      try {
        const res = await authenticatedFetch("/events");
        if (!res.ok) throw new Error("Failed to load events");
        const data = await res.json();
        setEvents(data);
      } catch (err) {
        console.error("Failed to load events", err);
        if (isNetworkError(err)) setNetworkError(true);
        else showToast("Failed to load events", "error");
      } finally {
        setLoading(false);
      }
    }
    loadEvents();
  }, [showToast]);

  const allEvents = events || [];
  const stats = {
    hosted: allEvents.length,
    attended: 0,
  };

  if (loading || profileLoading || !user) {
    return (
      <div
        className="page-with-header"
        style={{
          minHeight: "100vh",
          position: "relative",
          background:
            "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
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
              Loading events…
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (networkError) {
    return (
      <div
        className="page-with-header"
        style={{
          minHeight: "100vh",
          position: "relative",
          background:
            "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
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
            <h2 style={{ marginBottom: "8px", fontSize: "24px" }}>
              Connection Error
            </h2>
            <p style={{ opacity: 0.7, marginBottom: "16px" }}>
              Unable to connect to the server. Please check your internet
              connection and try again.
            </p>
            <button onClick={() => window.location.reload()} style={primaryBtn}>
              Retry
            </button>
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
          "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
        paddingBottom: "40px",
      }}
    >
      {/* Cursor glow effect */}
      <div
        style={{
          position: "fixed",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 70%)",
          left: mousePosition.x - 300,
          top: mousePosition.y - 300,
          pointerEvents: "none",
          transition: "all 0.3s ease-out",
          zIndex: 1,
        }}
      />

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
          {/* Profile header */}
          <ProfileHeader
            user={user}
            stats={stats}
            setUser={setUser}
            onSave={handleSaveProfile}
            showToast={showToast}
          />

          {/* Main tabs */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 32,
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              paddingBottom: 16,
            }}
          >
            <TabButton
              label="Events"
              count={allEvents.length}
              active={activeTab === "events"}
              onClick={() => setActiveTab("events")}
            />
            <TabButton
              label="CRM"
              active={activeTab === "crm"}
              onClick={() => setActiveTab("crm")}
            />
            <TabButton
              label="Integrations"
              active={activeTab === "integrations"}
              onClick={() => setActiveTab("integrations")}
            />
            <TabButton
              label="Settings"
              active={activeTab === "settings"}
              onClick={() => setActiveTab("settings")}
            />
          </div>

          {/* Tab content */}
          {activeTab === "events" && (
            <EventsTab
              events={allEvents}
              eventFilter={eventFilter}
              setEventFilter={setEventFilter}
            />
          )}

          {activeTab === "settings" && (
            <SettingsTab
              user={user}
              setUser={setUser}
              onSave={handleSaveProfile}
              showToast={showToast}
            />
          )}

          {activeTab === "integrations" && <IntegrationsTab />}

          {activeTab === "crm" && <CrmTab />}
        </div>
      </div>
    </div>
  );
}

const primaryBtn = {
  padding: "12px 24px",
  borderRadius: "999px",
  border: "none",
  background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
  color: "#fff",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};
