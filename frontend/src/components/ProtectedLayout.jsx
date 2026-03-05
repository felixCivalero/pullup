// frontend/src/components/ProtectedLayout.jsx
import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";

export function ProtectedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();

  // Redirect to landing page if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate("/");
    }
  }, [user, loading, navigate]);

  // On first authenticated load, link any existing newsletter subscriptions
  useEffect(() => {
    if (!loading && user) {
      authenticatedFetch("/auth/link-newsletter", {
        method: "POST",
      }).catch(() => {
        // Fire-and-forget; linking failure shouldn't block the app
      });
    }
  }, [loading, user]);

  function handleNav(path) {
    navigate(path);
  }

  const isCreatingEvent =
    location.pathname === "/create" || location.pathname === "/post";

  // Show loading state while checking auth
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ color: "#fff" }}>Loading...</div>
      </div>
    );
  }

  // Don't render if not authenticated (redirect will happen)
  if (!user) {
    return null;
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Top bar */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          // background:
          //   "linear-gradient(to bottom, rgba(5,4,10,0.95), rgba(5,4,10,0.6), transparent)",
          zIndex: 20,
          // borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <button
          onClick={() => handleNav("/events")}
          style={{
            background: "transparent",
            border: "none",
            color: "#fff",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          PullUp
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Profile avatar */}
          <button
            onClick={() => handleNav("/settings")}
            style={{
              width: 32,
              height: 32,
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(12,10,18,0.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              overflow: "hidden",
              padding: 0,
            }}
          >
            {user?.user_metadata?.picture || user?.user_metadata?.avatar_url ? (
              <img
                src={
                  user.user_metadata.picture || user.user_metadata.avatar_url
                }
                alt="Profile"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <span
                style={{
                  color: "#fff",
                  fontSize: "12px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}
              >
                {(user?.email || "?").slice(0, 2).toUpperCase()}
              </span>
            )}
          </button>
          <button
            onClick={() => handleNav(isCreatingEvent ? "/profile" : "/create")}
            style={{
              padding: "10px 18px",
              borderRadius: "999px",
              border: "none",
              background:
                "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "clamp(11px, 2.5vw, 12px)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "0 4px 12px rgba(192, 192, 192, 0.3)",
              whiteSpace: "nowrap",
              touchAction: "manipulation",
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "translateY(-1px)";
              e.target.style.boxShadow = "0 6px 16px rgba(192, 192, 192, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "0 4px 12px rgba(192, 192, 192, 0.3)";
            }}
          >
            {isCreatingEvent ? "Go to Profile" : "+ create event"}
          </button>
        </div>
      </header>

      {/* Page content */}
      {/* Pages themselves use .page-with-header to create spacing under the fixed header */}
      <main>
        <Outlet />
      </main>
    </div>
  );
}

const barStyle = {
  width: 14,
  height: 2,
  borderRadius: 999,
  background: "#fff",
};
