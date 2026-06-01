// frontend/src/components/ProtectedLayout.jsx
import { useState, useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "./Toast";
import { authenticatedFetch } from "../lib/api.js";
import { EventNavProvider, useEventNav } from "../contexts/EventNavContext.jsx";
import { ChevronLeft, Settings } from "lucide-react";
import { SilverIcon } from "./ui/SilverIcon.jsx";
import { PullupEyes } from "./PullupEyes.jsx";
import { NotificationsBell } from "./NotificationsBell.jsx";
import { WhatsNewModal } from "./WhatsNewModal.jsx";
import { colors } from "../theme/colors.js";

function ProtectedLayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const { eventNav, clearEventNav } = useEventNav();
  const [isAdmin, setIsAdmin] = useState(false);
  // Tracks whether /host/profile has resolved yet, so the admin guard below
  // doesn't bounce a real admin while their profile is still loading.
  const [profileChecked, setProfileChecked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [profilePic, setProfilePic] = useState(null);
  const [profileComplete, setProfileComplete] = useState(true);
  const { showToast } = useToast();
  const drawerRef = useRef(null);

  // Detect event routes
  const eventRouteMatch = location.pathname.match(
    /^\/app\/events\/([^/]+)\/(manage|room|guests|analytics|edit)/
  );
  const isEventRoute = !!eventRouteMatch;
  const eventId = eventRouteMatch?.[1];
  const eventTab = eventRouteMatch?.[2]; // "room" | "guests" | "analytics" | "edit"

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
        if (p) {
          if (p.profilePicture) setProfilePic(p.profilePicture);
          if (p.isAdmin) setIsAdmin(true);
          setProfileComplete(!!(p.brand?.trim() && p.contactEmail?.trim()));
        }
        setProfileChecked(true);
      })
      .catch(() => setProfileChecked(true));
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

  // Redirect to landing page if not authenticated (except /create where auth is deferred)
  useEffect(() => {
    if (!loading && !user && location.pathname !== "/create") {
      navigate("/");
    }
  }, [user, loading, navigate, location.pathname]);

  // The email section is admin-only — it sends mail outside PullUp. The backend
  // already 403s every /admin/email API, but the SPA would still render the page
  // shell for a logged-in non-admin who navigates here directly. Once we've
  // confirmed they're not an admin, bounce them out so the email UI never mounts.
  useEffect(() => {
    if (profileChecked && !isAdmin && location.pathname.startsWith("/admin/email")) {
      showToast("Admin access required", "error");
      navigate("/room", { replace: true });
    }
  }, [profileChecked, isAdmin, location.pathname, navigate, showToast]);

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

  const [navConfirm, setNavConfirm] = useState(null); // { path } when pending

  function handleNav(path) {
    if (window.__pullupUnsavedMedia) {
      setNavConfirm({ path });
      return;
    }
    navigate(path);
    setMenuOpen(false);
  }

  function confirmNavLeave() {
    window.__pullupUnsavedMedia = false;
    const path = navConfirm.path;
    setNavConfirm(null);
    setMenuOpen(false);
    navigate(path);
  }

  const isCreatingEvent = location.pathname === "/create";
  const isAdminPage = location.pathname.startsWith("/admin");
  // The email section is the one admin surface that's strictly admin-only — it
  // sends mail outside PullUp. Other /admin pages stay accessible since they
  // can back data-driven features, so the guard is scoped to /admin/email only.
  const isEmailSection = location.pathname.startsWith("/admin/email");

  // Nav items for all users.
  //
  // The product is narrowing to a per-event relationship engine (see "The Room"
  // direction, 2026-05-31). The mass-oriented surfaces — global Analytics, CRM
  // lists, Content Planner — are intentionally pulled OUT of the nav so the app
  // visibly collapses to: your events, and the work inside each one. The pages
  // and their routes still exist (reachable by URL) — this is a deliberate
  // de-emphasis, not a deletion, so we can restore or migrate them as the new
  // shape settles.
  // The Room leads — it's the home of PullUp now (the global relationship
  // surface). Events are content that pours into it; Settings holds the rest.
  const navItems = [
    { label: "The Room", path: "/room" },
    { label: "Settings", path: "/settings" },
  ];

  // Admin-only nav items
  const adminNavItems = [
    { label: "CRM", path: "/admin/crm" },
    { label: "Email", path: "/admin/email" },
    { label: "Analytics", path: "/admin/analytics" },
  ];

  // Event tab items — analytics-only users see just the Analytics tab
  const isAnalyticsOnly = eventNav?.myRole === "analytics";
  const eventTabItems = eventId
    ? isAnalyticsOnly
      ? [
          { label: "Insights", path: `/app/events/${eventId}/analytics`, tab: "analytics" },
        ]
      : [
          // The Room moved GLOBAL (it's the home of PullUp, person-centric
          // across all events). The event keeps only what's event-scoped:
          // the guest list (logistics roster), analytics, and edit.
          {
            label: `Guests${eventNav?.guestsCount != null ? ` (${eventNav.guestsCount})` : ""}`,
            path: `/app/events/${eventId}/guests`,
            tab: "guests",
          },
          { label: "Insights", path: `/app/events/${eventId}/analytics`, tab: "analytics" },
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

  // The header "Live" button reflects the event's stage. A draft isn't public
  // yet, so it offers a preview; a published event is "Live", and once the
  // editor has unsaved edits it nudges the host to preview those changes.
  const liveBtn = (() => {
    const isDraft = eventNav?.status === "DRAFT";
    if (isDraft) return { label: "Show preview", dot: "rgba(255,255,255,0.4)" };
    if (eventNav?.dirty) return { label: "Live · preview changes", dot: "#f0d878" };
    return { label: "Live", dot: "#4ade80" };
  })();

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
        <div style={{ color: colors.text }}>Loading...</div>
      </div>
    );
  }

  // Don't render if not authenticated (redirect will happen) — except /create
  if (!user && location.pathname !== "/create") {
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
              ? "linear-gradient(90deg, transparent 0%, #d97706 20%, #b45309 50%, #d97706 80%, transparent 100%)"
              : "linear-gradient(90deg, transparent 0%, #ec178f 20%, #ec178f 50%, #ec178f 80%, transparent 100%)",
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
          padding: "0 16px 0 12px",
          zIndex: 20,
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: `1px solid ${colors.borderFaint}`,
        }}
      >
        {/* Left side */}
        {isEventRoute ? (
          <button
            onClick={() => handleNav("/room")}
            style={{
              background: "transparent",
              border: "none",
              color: colors.textMuted,
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
              e.currentTarget.style.color = colors.text;
              e.currentTarget.style.background = colors.surfaceMuted;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = colors.textMuted;
              e.currentTarget.style.background = "transparent";
            }}
          >
            <ChevronLeft size={16} />
            The Room
          </button>
        ) : (
          <button
            onClick={() => handleNav("/room")}
            aria-label="PullUp"
            style={{
              background: "transparent",
              border: "none",
              padding: "4px 8px",
              display: "flex",
              alignItems: "center",
              gap: "9px",
              cursor: "pointer",
            }}
          >
            {/* Small eyes = the event platform. They track the cursor here too,
                so the brand stays alive inside the app — paired with the pink
                star mark, as on the landing page. */}
            <PullupEyes
              variant="small"
              style={{ width: "34px", height: "30px", display: "block" }}
            />
            <img
              src="/pullup-logo.svg"
              alt="PullUp"
              style={{ height: "26px", width: "auto", display: "block" }}
            />
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
                    color: colors.text,
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
                    background: colors.border,
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
                    ? colors.accentSoft
                    : "transparent",
                  border: "none",
                  color: isEventTabActive(tab) ? colors.accent : colors.textSubtle,
                  fontSize: "13px",
                  fontWeight: isEventTabActive(tab) ? 600 : 500,
                  letterSpacing: "0.01em",
                  cursor: "pointer",
                  padding: "6px 14px",
                  borderRadius: "999px",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (!isEventTabActive(tab)) {
                    e.target.style.color = colors.text;
                    e.target.style.background = colors.surfaceMuted;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isEventTabActive(tab)) {
                    e.target.style.color = colors.textSubtle;
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
            {/* All main destinations as text; Settings lives in the gear icon
                (right side), so it's excluded here. Using a filter rather than
                a fixed slice so adding a nav item never silently drops CRM. */}
            {navItems.filter((i) => i.path !== "/settings").map(({ label, path }) => (
              <button
                key={path}
                onClick={() => handleNav(path)}
                style={{
                  background: isActive(path)
                    ? colors.accentSoft
                    : "transparent",
                  border: "none",
                  color: isActive(path) ? colors.accent : colors.textSubtle,
                  fontSize: "13px",
                  fontWeight: isActive(path) ? 600 : 500,
                  letterSpacing: "0.01em",
                  cursor: "pointer",
                  padding: "6px 14px",
                  borderRadius: "999px",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isActive(path)) {
                    e.target.style.color = colors.text;
                    e.target.style.background = colors.surfaceMuted;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive(path)) {
                    e.target.style.color = colors.textSubtle;
                    e.target.style.background = "transparent";
                  }
                }}
              >
                {label}
              </button>
            ))}

            {/* Admin section with amber divider */}
            {isAdmin && (
              <>
                <div
                  style={{
                    width: "1px",
                    height: "20px",
                    background: "rgba(180, 83, 9, 0.25)",
                    margin: "0 8px",
                  }}
                />
                {adminNavItems.map(({ label, path }) => (
                  <button
                    key={path}
                    onClick={() => handleNav(path)}
                    style={{
                      background: isActive(path)
                        ? "rgba(180, 83, 9, 0.10)"
                        : "transparent",
                      border: isActive(path)
                        ? "1px solid rgba(180, 83, 9, 0.25)"
                        : "1px solid transparent",
                      color: isActive(path)
                        ? "#b45309"
                        : "rgba(180, 83, 9, 0.6)",
                      fontSize: "13px",
                      fontWeight: isActive(path) ? 600 : 500,
                      letterSpacing: "0.01em",
                      cursor: "pointer",
                      padding: "6px 14px",
                      borderRadius: "999px",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive(path)) {
                        e.target.style.color = "#b45309";
                        e.target.style.background = "rgba(180, 83, 9, 0.06)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive(path)) {
                        e.target.style.color = "rgba(180, 83, 9, 0.6)";
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
                display: "flex",
                alignItems: "center",
                gap: "7px",
                padding: "6px 14px",
                borderRadius: "999px",
                border: `1px solid ${colors.borderStrong}`,
                background: "#fff",
                color: colors.text,
                fontWeight: 500,
                fontSize: "12px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colors.surfaceMuted;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#fff";
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: liveBtn.dot,
                  flexShrink: 0,
                }}
              />
              {liveBtn.label}
            </a>
          )}

          {/* Desktop: Notifications bell (ambient facts) — sits next to Settings */}
          {!isMobile && <NotificationsBell />}

          {/* Desktop: Settings icon */}
          {!isMobile && (
            <button
              onClick={() => handleNav("/settings")}
              style={{
                width: 32,
                height: 32,
                borderRadius: "999px",
                border: `1px solid ${colors.border}`,
                background: "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.surfaceMuted; }}
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
                border: `1px solid ${colors.border}`,
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
                  handleNav("/room");
                } else if (!profileComplete) {
                  showToast("Fill in your brand name and contact email first", "error");
                  if (location.pathname !== "/room") {
                    handleNav("/room");
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
                background: colors.accent,
                color: "#fff",
                fontWeight: 700,
                fontSize: "clamp(11px, 2.5vw, 12px)",
                letterSpacing: "0.02em",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: colors.accentShadow,
                whiteSpace: "nowrap",
                touchAction: "manipulation",
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = "translateY(-1px)";
                e.target.style.background = colors.accentHover;
                e.target.style.boxShadow = "0 8px 22px rgba(236, 23, 143, 0.34)";
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = "translateY(0)";
                e.target.style.background = colors.accent;
                e.target.style.boxShadow = colors.accentShadow;
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
              background: "#fff",
              boxShadow: "-12px 0 48px rgba(10, 10, 10, 0.16)",
              borderLeft:
                isAdmin && isAdminPage
                  ? "1px solid rgba(180, 83, 9, 0.20)"
                  : `1px solid ${colors.border}`,
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
                borderBottom: `1px solid ${colors.border}`,
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
                    border: `1px solid ${colors.border}`,
                    background: colors.surfaceMuted,
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
                        color: colors.text,
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
                      color: colors.text,
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
                        color: "#b45309",
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
                  background: colors.surfaceMuted,
                  color: colors.textMuted,
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
                        color: colors.text,
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
                          ? colors.accentSoft
                          : "transparent",
                        color: isEventTabActive(tab)
                          ? colors.accent
                          : colors.textMuted,
                        fontSize: "15px",
                        fontWeight: isEventTabActive(tab) ? 600 : 500,
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
                      background: colors.border,
                    }}
                  />

                  {/* Back to the Room */}
                  <button
                    onClick={() => handleNav("/room")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      width: "100%",
                      padding: "14px 16px",
                      borderRadius: "12px",
                      border: "none",
                      background: "transparent",
                      color: colors.textMuted,
                      fontSize: "15px",
                      fontWeight: 400,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                      touchAction: "manipulation",
                    }}
                  >
                    <ChevronLeft size={16} />
                    The Room
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
                        gap: "10px",
                        width: "100%",
                        padding: "14px 16px",
                        borderRadius: "12px",
                        color: colors.textMuted,
                        fontSize: "15px",
                        fontWeight: 500,
                        textDecoration: "none",
                        touchAction: "manipulation",
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: liveBtn.dot,
                          flexShrink: 0,
                        }}
                      />
                      {eventNav?.status === "DRAFT" ? "Show preview" : "View live"}
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
                          ? colors.accentSoft
                          : "transparent",
                        color: isActive(path)
                          ? colors.accent
                          : colors.textMuted,
                        fontSize: "15px",
                        fontWeight: isActive(path) ? 600 : 500,
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
                              "linear-gradient(90deg, rgba(180, 83, 9, 0.35), transparent)",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            letterSpacing: "0.15em",
                            textTransform: "uppercase",
                            color: "#b45309",
                          }}
                        >
                          Admin
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: "1px",
                            background:
                              "linear-gradient(90deg, transparent, rgba(180, 83, 9, 0.35))",
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
                              ? "rgba(180, 83, 9, 0.10)"
                              : "transparent",
                            color: isActive(path)
                              ? "#b45309"
                              : "rgba(180, 83, 9, 0.6)",
                            fontSize: "15px",
                            fontWeight: isActive(path) ? 600 : 500,
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

      {/* Page content. On the email section, hold rendering until we've
          confirmed admin status — never mount the email UI for a non-admin, and
          avoid a flash while /host/profile is still resolving. */}
      <main>
        {isEmailSection && (!profileChecked || !isAdmin) ? (
          <div
            style={{
              minHeight: "60vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: colors.textMuted,
            }}
          >
            {profileChecked ? null : "Loading..."}
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {/* First-login-after-redesign walkthrough (desktop-only, once per browser) */}
      <WhatsNewModal />

      {/* Unsaved media confirm dialog */}
      {navConfirm && (
        <>
          <div
            onClick={() => setNavConfirm(null)}
            style={{
              position: "fixed",
              top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(0, 0, 0, 0.6)",
              backdropFilter: "blur(8px)",
              zIndex: 10000,
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              background: "#fff",
              border: `1px solid ${colors.border}`,
              boxShadow: "0 24px 64px rgba(10, 10, 10, 0.22)",
              borderRadius: "20px",
              padding: "32px",
              maxWidth: "360px",
              width: "calc(100% - 48px)",
              zIndex: 10001,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "16px", display: "flex", justifyContent: "center" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: colors.text, marginBottom: "8px" }}>
              Unsaved media
            </div>
            <div style={{ fontSize: "13px", color: colors.textMuted, lineHeight: 1.5, marginBottom: "24px" }}>
              Your uploaded images and video haven't been saved yet. If you leave now, they'll be lost.
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => setNavConfirm(null)}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "999px",
                  border: `1px solid ${colors.borderStrong}`,
                  background: "#fff",
                  color: colors.text,
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Stay
              </button>
              <button
                onClick={confirmNavLeave}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "999px",
                  border: "none",
                  background: colors.dangerRgba,
                  color: colors.danger,
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Leave
              </button>
            </div>
          </div>
        </>
      )}
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
  background: "#0a0a0a",
};
