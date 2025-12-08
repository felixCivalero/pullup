import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/Toast";

import { ProfileHeader } from "../components/HomeProfileHeader";
import { TabButton } from "../components/HomeTabs";
import { EventsTab } from "../components/HomeEventsTab";
import { SettingsTab } from "../components/HomeSettingsTab";
import { PaymentsTab } from "../components/HomePaymentsTab";
import { CrmTab } from "../components/HomeCrmTab";

const API_BASE = "http://localhost:3001";

function isNetworkError(error) {
  return (
    error instanceof TypeError ||
    error.message.includes("Failed to fetch") ||
    error.message.includes("NetworkError")
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);

  const [activeTab, setActiveTab] = useState("events"); // "events" | "settings" | "payments" | "crm"
  const [eventFilter, setEventFilter] = useState("upcoming"); // "upcoming" | "past"
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Mock user – later replace with auth context
  const [user, setUser] = useState({
    name: "Felix civalero",
    username: "",
    email: "felix.civalero@gmail.com",
    bio: "",
    profilePicture: null,
    joinedDate: "August 2024",
  });

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
        const res = await fetch(`${API_BASE}/events`);
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

  if (loading) {
    return (
      <div className="page-with-header" style={pageBg}>
        <div className="responsive-container">
          <div className="responsive-card" style={cardShell({ center: true })}>
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
      <div className="page-with-header" style={pageBg}>
        <div className="responsive-container">
          <div className="responsive-card" style={cardShell({ center: true })}>
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
    <div className="page-with-header" style={pageBg}>
      {/* cursor glow */}
      <div
        style={{
          position: "fixed",
          width: 600,
          height: 600,
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
        className="responsive-container"
        style={{ position: "relative", zIndex: 2 }}
      >
        <div className="responsive-card" style={cardShell({ center: false })}>
          {/* Create Event */}
          <div style={{ paddingBottom: 32 }}>
            <button
              onClick={() => navigate("/create")}
              style={primaryBtnWide}
              onMouseEnter={(e) => {
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow =
                  "0 15px 40px rgba(139, 92, 246, 0.6)";
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow =
                  "0 10px 30px rgba(139, 92, 246, 0.4)";
              }}
            >
              + Create New Event
            </button>
          </div>

          {/* Profile header */}
          <ProfileHeader user={user} stats={stats} />

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
              label="Payments"
              active={activeTab === "payments"}
              onClick={() => setActiveTab("payments")}
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
            <SettingsTab user={user} setUser={setUser} showToast={showToast} />
          )}

          {activeTab === "payments" && <PaymentsTab />}

          {activeTab === "crm" && <CrmTab />}
        </div>
      </div>
    </div>
  );
}

const pageBg = {
  minHeight: "100vh",
  position: "relative",
  background:
    "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
};

function cardShell({ center }) {
  return {
    width: "100%",
    maxWidth: 900,
    margin: center ? "0 auto" : "0 auto",
    background: "rgba(12, 10, 18, 0.6)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.05)",
    textAlign: center ? "center" : "left",
  };
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

const primaryBtnWide = {
  ...primaryBtn,
  width: "100%",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};
