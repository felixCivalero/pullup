// frontend/src/components/ProtectedLayout.jsx
import { useState, useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "./Toast";
import { authenticatedFetch } from "../lib/api.js";
import { EventNavProvider, useEventNav } from "../contexts/EventNavContext.jsx";
import { ChevronLeft, Settings } from "lucide-react";
import { SilverIcon } from "./ui/SilverIcon.jsx";

function ProtectedLayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const { eventNav, clearEventNav } = useEventNav();
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [profilePic, setProfilePic] = useState(null);
  const [profileComplete, setProfileComplete] = useState(true);
  const { showToast } = useToast();
  const drawerRef = useRef(null);

  // Detect event routes
  const eventRouteMatch = location.pathname.match(
    /^\/app\/events\/([^/]+)\/(manage|guests|analytics|edit)/
  );
  const isEventRoute = !!eventRouteMatch;
  const eventId = eventRouteMatch?.[1];
  const eventTab = eventRouteMatch?.[2]; // "manage" | "guests" | "edit"

  // Clear event nav when leaving event routes
  useEffect(() => {
    if (!isEventRoute) {
      clearEventNav();
    }
  }, [isEventRoute, clearEventNav]);

  // Responsive check
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Fetch host profile (picture, admin flag, completeness)
  function refreshProfile() {
    if (!user) return;
    authenticatedFetch("/host/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (!p) return;
        if (p.profilePicture) setProfilePic(p.profilePicture);
        if (p.isAdmin) setIsAdmin(true);
        setProfileComplete(!!(p.brand?.trim() && p.contactEmail?.trim()));
      })
      .catch(() => {});
  }

  useEffect(() => {
    refreshProfile();
  }, [user]);

  // Re-check when profile is saved anywhere in the app
  useEffect(() => {
    function onProfileUpdated() {
      refreshProfile();
    }
    window.addEventListener("profileUpdated", onProfileUpdated);
    return () => window.removeEventListener("profileUpdated", onProfileUpdated);
  }, [user]);

  const avatarSrc = profilePic || null;

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Lock body scroll when menu open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

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
      }).catch(() => {});
      authenticatedFetch("/auth/record-consent", {
        method: "POST",
      }).catch(() => {});
    }
  }, [loading, user]);

  function handleNav(path) {
    navigate(path);
    setMenuOpen(false);
  }

  const isCreatingEvent = location.pathname === "/create";
  const isAdminPage = location.pathname.startsWith("/admin");

  // Nav items for all users
  const navItems = [
    { label: "Events", path: "/events" },
    { label: "Analytics", path: "/analytics" },
    { label: "CRM", path: "/crm" },
    { label: "Settings", path: "/settings" },
  ];

  // Admin-only nav items
  const adminNavItems = [
    { label: "Discover", path: "/admin/discover" },
    { label: "Newsletter", path: "/admin" },
    { label: "Analytics", path: "/admin/analytics" },
    { label: "Sales", path: "/admin/sales" },
  ];

  // Event tab items — analytics-only users see just the Analytics tab
  const isAnalyticsOnly = eventNav?.myRole === "analytics";
  const eventTabItems = eventId
    ? isAnalyticsOnly
      ? [
          { label: "Analytics", path: `/app/events/${eventId}/analytics`, tab: "analytics" },
        ]
      : [
          { label: "Overview", path: `/app/events/${eventId}/manage`, tab: "manage" },
          {
            label: `Guests${eventNav?.guestsCount != null ? ` (${eventNav.guestsCount})` : ""}`,
            path: `/app/events/${eventId}/guests`,
            tab: "guests",
          },
          { label: "Analytics", path: `/app/events/${eventId}/analytics`, tab: "analytics" },
          { label: "Edit", path: `/app/events/${eventId}/edit`, tab: "edit" },
        ]
    : [];

  function isActive(path) {
    if (path === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(path);
  }

  function isEventTabActive(tab) {
    return eventTab === tab;
  }

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
      {/* Top accent line -- gold in admin mode, silver otherwise */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "2px",
          background:
            isAdmin && isAdminPage
              ? "linear-gradient(90deg, transparent 0%, #fbbf24 20%, #f59e0b 50%, #fbbf24 80%, transparent 100%)"
              : "linear-gradient(90deg, transparent 0%, #a8a8a8 20%, #e8e8e8 50%, #a8a8a8 80%, transparent 100%)",
          zIndex: 22,
          transition: "background 0.3s ease",
        }}
      />

      {/* Top bar */}
      <header
        style={{
          position: "fixed",
          top: 2,
          left: 0,
          right: 0,
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          zIndex: 20,
          background: "rgba(5, 4, 10, 0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        {/* Left side */}
        {isEventRoute ? (
          <button
            onClick={() => handleNav("/events")}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.6)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 10px 6px 4px",
              borderRadius: "999px",
              transition: "all 0.15s ease",
              fontSize: "13px",
              fontWeight: 500,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#fff";
              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,0.6)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <ChevronLeft size={16} />
            Events
          </button>
        ) : (
          <button
            onClick={() => handleNav("/events")}
            style={{
              background: "transparent",
              border: "none",
              color: isAdmin && isAdminPage ? "#fbbf24" : "#fff",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontSize: "12px",
              cursor: "pointer",
              transition: "color 0.3s ease",
              filter:
                isAdmin && isAdminPage
                  ? "drop-shadow(0 0 4px rgba(251, 191, 36, 0.5))"
                  : "none",
            }}
          >
            PullUp
          </button>
        )}

        {/* Center nav */}
        {!isMobile && isEventRoute ? (
          /* Event-specific navigation */
          <nav
            style={{
              display: "flex",
              alignItems: "center",
              gap: "2px",
              overflow: "hidden",
              minWidth: 0,
            }}
          >
            {/* Event title */}
            {eventNav?.title && (
              <>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#fff",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "180px",
                    padding: "0 8px",
                  }}
                >
                  {eventNav.title}
                </span>
                <div
                  style={{
                    width: "1px",
                    height: "20px",
                    background: "rgba(255,255,255,0.1)",
                    margin: "0 6px",
                    flexShrink: 0,
                  }}
                />
              </>
            )}
            {eventTabItems.map(({ label, path, tab }) => (
              <button
                key={tab}
                onClick={() => handleNav(path)}
                style={{
                  background: isEventTabActive(tab)
                    ? "rgba(255,255,255,0.08)"
                    : "transparent",
                  border: "none",
                  color: isEventTabActive(tab) ? "#fff" : "rgba(255,255,255,0.5)",
                  fontSize: "13px",
                  fontWeight: isEventTabActive(tab) ? 600 : 400,
                  letterSpacing: "0.03em",
                  cursor: "pointer",
                  padding: "6px 14px",
                  borderRadius: "999px",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (!isEventTabActive(tab)) {
                    e.target.style.color = "rgba(255,255,255,0.8)";
                    e.target.style.background = "rgba(255,255,255,0.04)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isEventTabActive(tab)) {
                    e.target.style.color = "rgba(255,255,255,0.5)";
                    e.target.style.background = "transparent";
                  }
                }}
              >
                {label}
              </button>
            ))}
          </nav>
        ) : !isMobile ? (
          /* Default navigation */
          <nav style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {navItems.slice(0, 3).map(({ label, path }) => (
              <button
                key={path}
                onClick={() => handleNav(path)}
                style={{
                  background: isActive(path)
                    ? "rgba(255,255,255,0.08)"
                    : "transparent",
                  border: "none",
                  color: isActive(path) ? "#fff" : "rgba(255,255,255,0.5)",
                  fontSize: "13px",
                  fontWeight: isActive(path) ? 600 : 400,
                  letterSpacing: "0.03em",
                  cursor: "pointer",
                  padding: "6px 14px",
                  borderRadius: "999px",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isActive(path)) {
                    e.target.style.color = "rgba(255,255,255,0.8)";
                    e.target.style.background = "rgba(255,255,255,0.04)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive(path)) {
                    e.target.style.color = "rgba(255,255,255,0.5)";
                    e.target.style.background = "transparent";
                  }
                }}
              >
                {label}
              </button>
            ))}

            {/* Admin section with gold divider */}
            {isAdmin && (
              <>
                <div
                  style={{
                    width: "1px",
                    height: "20px",
                    background: "rgba(251, 191, 36, 0.2)",
                    margin: "0 8px",
                  }}
                />
                {adminNavItems.map(({ label, path }) => (
                  <button
                    key={path}
                    onClick={() => handleNav(path)}
                    style={{
                      background: isActive(path)
                        ? "rgba(251, 191, 36, 0.12)"
                        : "transparent",
                      border: isActive(path)
                        ? "1px solid rgba(251, 191, 36, 0.2)"
                        : "1px solid transparent",
                      color: isActive(path)
                        ? "#fbbf24"
                        : "rgba(251, 191, 36, 0.45)",
                      fontSize: "13px",
                      fontWeight: isActive(path) ? 600 : 400,
                      letterSpacing: "0.03em",
                      cursor: "pointer",
                      padding: "6px 14px",
                      borderRadius: "999px",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive(path)) {
                        e.target.style.color = "rgba(251, 191, 36, 0.85)";
                        e.target.style.background = "rgba(251, 191, 36, 0.06)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive(path)) {
                        e.target.style.color = "rgba(251, 191, 36, 0.45)";
                        e.target.style.background = "transparent";
                      }
                    }}
                  >
                    {label}
                  </button>
                ))}
              </>
            )}
          </nav>
        ) : null}

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Event route: Live link */}
          {isEventRoute && eventNav?.slug && (
            <a
              href={`/e/${eventNav.slug}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                padding: "6px 14px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontWeight: 500,
                fontSize: "12px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              }}
            >
              Live
            </a>
          )}

          {/* Desktop: Settings icon */}
          {!isMobile && (
            <button
              onClick={() => handleNav("/settings")}
              style={{
                width: 32,
                height: 32,
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <SilverIcon as={Settings} size={16} />
            </button>
          )}

          {/* Mobile: Hamburger */}
          {isMobile && (
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              style={{
                width: 36,
                height: 36,
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "transparent",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <span style={barStyle} />
              <span style={barStyle} />
              <span style={{ ...barStyle, width: 10 }} />
            </button>
          )}

          {/* Create event button (hide on event routes to save space) */}
          {!isEventRoute && (
            <button
              onClick={() => {
                if (isCreatingEvent) {
                  handleNav("/events");
                } else if (!profileComplete) {
                  showToast("Fill in your brand name and contact email first", "error");
                  if (location.pathname !== "/events") {
                    navigate("/events");
                  } else {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                } else {
                  handleNav("/create");
                }
              }}
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
                e.target.style.boxShadow =
                  "0 6px 16px rgba(192, 192, 192, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow =
                  "0 4px 12px rgba(192, 192, 192, 0.3)";
              }}
            >
              {isCreatingEvent ? "Back" : "+ create"}
            </button>
          )}
        </div>
      </header>

      {/* Mobile slide-in drawer */}
      {isMobile && menuOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setMenuOpen(false)}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              zIndex: 998,
              animation: "menuFadeIn 0.2s ease",
            }}
          />
          {/* Drawer */}
          <div
            ref={drawerRef}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(300px, 80vw)",
              background: "rgba(12, 10, 18, 0.97)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderLeft:
                isAdmin && isAdminPage
                  ? "1px solid rgba(251, 191, 36, 0.15)"
                  : "1px solid rgba(255,255,255,0.06)",
              zIndex: 999,
              animation:
                "menuSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
            }}
          >
            {/* Drawer header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {/* Profile in drawer */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(12,10,18,0.9)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt="Profile"
                      referrerPolicy="no-referrer"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  ) : (
                    <span
                      style={{
                        color: "#fff",
                        fontSize: "14px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                      }}
                    >
                      {(user?.email || "?").slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: "#fff",
                      fontSize: "14px",
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {user?.user_metadata?.full_name ||
                      user?.user_metadata?.name ||
                      user?.email?.split("@")[0] ||
                      "User"}
                  </div>
                  {isAdmin && (
                    <div
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "#fbbf24",
                        marginTop: "2px",
                      }}
                    >
                      Admin
                    </div>
                  )}
                </div>
              </div>
              {/* Close */}
              <button
                onClick={() => setMenuOpen(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "999px",
                  border: "none",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.6)",
                  fontSize: "18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>

            {/* Nav items */}
            <nav style={{ padding: "12px 8px", flex: 1 }}>
              {isEventRoute ? (
                <>
                  {/* Event title in drawer */}
                  {eventNav?.title && (
                    <div
                      style={{
                        padding: "8px 16px 16px",
                        fontSize: "15px",
                        fontWeight: 700,
                        color: "#fff",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {eventNav.title}
                    </div>
                  )}

                  {/* Event tabs */}
                  {eventTabItems.map(({ label, path, tab }) => (
                    <button
                      key={tab}
                      onClick={() => handleNav(path)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        width: "100%",
                        padding: "14px 16px",
                        borderRadius: "12px",
                        border: "none",
                        background: isEventTabActive(tab)
                          ? "rgba(255,255,255,0.06)"
                          : "transparent",
                        color: isEventTabActive(tab)
                          ? "#fff"
                          : "rgba(255,255,255,0.6)",
                        fontSize: "15px",
                        fontWeight: isEventTabActive(tab) ? 600 : 400,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.15s ease",
                        touchAction: "manipulation",
                      }}
                    >
                      {label}
                    </button>
                  ))}

                  {/* Divider */}
                  <div
                    style={{
                      margin: "12px 16px 8px",
                      height: "1px",
                      background: "rgba(255,255,255,0.06)",
                    }}
                  />

                  {/* Back to events */}
                  <button
                    onClick={() => handleNav("/events")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      width: "100%",
                      padding: "14px 16px",
                      borderRadius: "12px",
                      border: "none",
                      background: "transparent",
                      color: "rgba(255,255,255,0.5)",
                      fontSize: "15px",
                      fontWeight: 400,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                      touchAction: "manipulation",
                    }}
                  >
                    <ChevronLeft size={16} />
                    All Events
                  </button>

                  {/* Live link */}
                  {eventNav?.slug && (
                    <a
                      href={`/e/${eventNav.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        width: "100%",
                        padding: "14px 16px",
                        borderRadius: "12px",
                        color: "rgba(255,255,255,0.5)",
                        fontSize: "15px",
                        fontWeight: 400,
                        textDecoration: "none",
                        touchAction: "manipulation",
                      }}
                    >
                      View Live
                    </a>
                  )}
                </>
              ) : (
                <>
                  {navItems.map(({ label, path }) => (
                    <button
                      key={path}
                      onClick={() => handleNav(path)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        width: "100%",
                        padding: "14px 16px",
                        borderRadius: "12px",
                        border: "none",
                        background: isActive(path)
                          ? "rgba(255,255,255,0.06)"
                          : "transparent",
                        color: isActive(path)
                          ? "#fff"
                          : "rgba(255,255,255,0.6)",
                        fontSize: "15px",
                        fontWeight: isActive(path) ? 600 : 400,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.15s ease",
                        touchAction: "manipulation",
                      }}
                    >
                      {label}
                    </button>
                  ))}

                  {/* Admin section */}
                  {isAdmin && (
                    <>
                      <div
                        style={{
                          margin: "12px 16px 8px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            flex: 1,
                            height: "1px",
                            background:
                              "linear-gradient(90deg, rgba(251, 191, 36, 0.3), transparent)",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 600,
                            letterSpacing: "0.15em",
                            textTransform: "uppercase",
                            color: "#fbbf24",
                            filter:
                              "drop-shadow(0 0 3px rgba(251, 191, 36, 0.4))",
                          }}
                        >
                          Admin
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: "1px",
                            background:
                              "linear-gradient(90deg, transparent, rgba(251, 191, 36, 0.3))",
                          }}
                        />
                      </div>

                      {adminNavItems.map(({ label, path }) => (
                        <button
                          key={path}
                          onClick={() => handleNav(path)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            width: "100%",
                            padding: "14px 16px",
                            borderRadius: "12px",
                            border: "none",
                            background: isActive(path)
                              ? "rgba(251, 191, 36, 0.08)"
                              : "transparent",
                            color: isActive(path)
                              ? "#fbbf24"
                              : "rgba(251, 191, 36, 0.45)",
                            fontSize: "15px",
                            fontWeight: isActive(path) ? 600 : 400,
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "all 0.15s ease",
                            touchAction: "manipulation",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </>
                  )}
                </>
              )}
            </nav>
          </div>

          <style>{`
            @keyframes menuFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes menuSlideIn {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
            }
          `}</style>
        </>
      )}

      {/* Page content */}
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export function ProtectedLayout() {
  return (
    <EventNavProvider>
      <ProtectedLayoutInner />
    </EventNavProvider>
  );
}

const barStyle = {
  width: 14,
  height: 2,
  borderRadius: 999,
  background: "#fff",
};
