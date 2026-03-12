import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";

import { EventsTab } from "../components/HomeEventsTab";

import { authenticatedFetch } from "../lib/api.js";
import { isNetworkError, handleNetworkError } from "../lib/errorHandler.js";

export function HomePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user: authUser } = useAuth();

  const [upcomingEvents, setUpcomingEvents] = useState(null);
  const [pastEvents, setPastEvents] = useState(null);
  const [loadingUpcoming, setLoadingUpcoming] = useState(true);
  const [loadingPast, setLoadingPast] = useState(false);
  const [pastLoaded, setPastLoaded] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [user, setUser] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

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

  useEffect(() => {
    function handleMouseMove(e) {
      setMousePosition({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    async function loadUpcomingEvents() {
      setNetworkError(false);
      setLoadingUpcoming(true);
      try {
        const res = await authenticatedFetch("/events?filter=upcoming");
        if (!res.ok) throw new Error("Failed to load events");
        const data = await res.json();
        setUpcomingEvents(data);
      } catch (err) {
        console.error("Failed to load events", err);
        if (isNetworkError(err)) {
          setNetworkError(true);
          handleNetworkError(err, showToast);
        } else {
          showToast("Failed to load events", "error");
        }
      } finally {
        setLoadingUpcoming(false);
      }
    }
    loadUpcomingEvents();
  }, [showToast]);

  // Lazy-load past events only when needed
  useEffect(() => {
    if (eventFilter !== "past") return;
    if (pastLoaded || loadingPast) return;

    async function loadPastEvents() {
      try {
        setLoadingPast(true);
        const res = await authenticatedFetch("/events?filter=past");
        if (!res.ok) throw new Error("Failed to load past events");
        const data = await res.json();
        setPastEvents(data);
        setPastLoaded(true);
      } catch (err) {
        console.error("Failed to load past events", err);
        showToast("Failed to load past events", "error");
      } finally {
        setLoadingPast(false);
      }
    }

    loadPastEvents();
  }, [eventFilter, pastLoaded, loadingPast, showToast]);

  if (loadingUpcoming || profileLoading || !user) {
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
          "radial-gradient(circle at 20% 50%, rgba(192, 192, 192, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232, 232, 232, 0.08) 0%, transparent 50%), #05040a",
        paddingBottom: "clamp(20px, 5vw, 40px)",
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
            "radial-gradient(circle, rgba(192, 192, 192, 0.08) 0%, transparent 70%)",
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
        <style>{`
          @media (max-width: 767px) {
            .responsive-container-wide {
              padding: 12px !important;
            }
            .responsive-container-wide .responsive-card {
              padding: 16px !important;
              border-radius: 16px !important;
            }
          }
        `}</style>

        <div
          className="responsive-card"
          style={{
            background: "rgba(12, 10, 18, 0.6)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {/* Events content */}
          <EventsTab
            upcomingEvents={upcomingEvents || []}
            pastEvents={pastEvents || []}
            eventFilter={eventFilter}
            setEventFilter={setEventFilter}
            loadingPast={loadingPast}
            user={user}
            setUser={setUser}
            onSaveProfile={handleSaveProfile}
            showToast={showToast}
          />
        </div>
      </div>
    </div>
  );
}

const primaryBtn = {
  padding: "12px 24px",
  borderRadius: "999px",
  border: "none",
  background: "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)",
  color: "#fff",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};
