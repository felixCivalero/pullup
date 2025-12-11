// frontend/src/components/ProtectedLayout.jsx
import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function ProtectedLayout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, signOut } = useAuth();

  // Redirect to landing page if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate("/");
    }
  }, [user, loading, navigate]);

  function handleNav(path) {
    setOpen(false);
    navigate(path);
  }

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const isHome = location.pathname === "/home";

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
          onClick={() => handleNav("/home")}
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
          PullUp {isHome ? "· Home" : ""}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* User info */}
          {user && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {user.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt={user.user_metadata?.full_name || user.email}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background:
                      "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "12px",
                  }}
                >
                  {(user.user_metadata?.full_name ||
                    user.email ||
                    "U")[0].toUpperCase()}
                </div>
              )}
              <span style={{ fontSize: "12px", opacity: 0.8 }}>
                {user.user_metadata?.full_name || user.email?.split("@")[0]}
              </span>
            </div>
          )}

          <button
            onClick={() => handleNav("/create")}
            style={{
              padding: "8px 16px",
              borderRadius: "999px",
              border: "none",
              background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "12px",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "0 4px 12px rgba(139, 92, 246, 0.3)",
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "translateY(-1px)";
              e.target.style.boxShadow = "0 6px 16px rgba(139, 92, 246, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "0 4px 12px rgba(139, 92, 246, 0.3)";
            }}
          >
            + create event
          </button>

          {/* Logout button */}
          <button
            onClick={handleSignOut}
            style={{
              padding: "8px 12px",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              fontWeight: 500,
              fontSize: "11px",
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "rgba(255,255,255,0.1)";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "rgba(255,255,255,0.05)";
            }}
          >
            Sign out
          </button>
        </div>

        {/* Hamburger */}
        {/* <button
          onClick={() => setOpen((o) => !o)}
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
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={barStyle} />
            <span style={barStyle} />
            <span style={barStyle} />
          </div>
        </button> */}

        {/* Dropdown menu */}
        {/* {open && (
          <div
            style={{
              position: "absolute",
              top: 52,
              right: 12,
              background: "#0C0A12",
              borderRadius: "14px",
              boxShadow: "0 16px 40px rgba(0,0,0,0.7)",
              padding: "8px",
              minWidth: "160px",
              zIndex: 30,
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <MenuItem onClick={() => handleNav("/home")}>Home</MenuItem>
            <MenuItem onClick={() => handleNav("/create")}>
              Create PullUp
            </MenuItem>

          </div>
        )}
         */}
      </header>

      {/* Page content */}
      {/* Pages themselves use .page-with-header to create spacing under the fixed header */}
      <main>
        <Outlet />
      </main>
    </div>
  );
}

function MenuItem({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        padding: "8px 10px",
        borderRadius: "10px",
        border: "none",
        background: "transparent",
        color: "#fff",
        fontSize: "14px",
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

const barStyle = {
  width: 14,
  height: 2,
  borderRadius: 999,
  background: "#fff",
};
