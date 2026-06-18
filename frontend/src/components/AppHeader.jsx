// AppHeader — the default in-app top bar (logo, nav, admin nav, notifications,
// settings, create). Extracted out of ProtectedLayout so it can be rendered by
// surfaces that live OUTSIDE the protected shell but still need the app chrome —
// notably the owner standing in their own person room (/r/:me), which is a
// public route (so a shared /r/:stranger link stays clean) yet must feel like
// home when it's you.
//
// This is the NON-event header only. Event routes keep their bespoke header
// inline in ProtectedLayout (it's tightly coupled to the event nav context).
//
// Mobile surfacing mirrors ProtectedLayout's default-app header (commit
// bca179f5): the bell + settings are DIRECT icon badges and admin is a compact
// gold popover — no hamburger drawer. The person room IS the profile, so the
// header never needs to carry an avatar/account drawer.
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { Settings } from "lucide-react";
import { SilverIcon } from "./ui/SilverIcon.jsx";
import { NotificationsBell } from "./NotificationsBell.jsx";
import { AuthGate } from "./auth/AuthGate.jsx";
import { PageTypePicker } from "./PageTypePicker.jsx";
import { colors } from "../theme/colors.js";

export function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false); // mobile admin popover
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [profileComplete, setProfileComplete] = useState(true);
  const [onboardOpen, setOnboardOpen] = useState(false); // create gate → onboarding door
  const [createPickerOpen, setCreatePickerOpen] = useState(false); // "+ create" → page-type picker
  const [navConfirm, setNavConfirm] = useState(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  function refreshProfile() {
    if (!user) return;
    authenticatedFetch("/host/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (p) {
          if (p.isAdmin) setIsAdmin(true);
          // Host-ready = name + contact email (auto-set at signup), not "brand".
          setProfileComplete(!!(p.name?.trim() && p.contactEmail?.trim()));
        }
      })
      .catch(() => {});
  }
  useEffect(() => { refreshProfile(); }, [user]);
  useEffect(() => {
    function onProfileUpdated() { refreshProfile(); }
    window.addEventListener("profileUpdated", onProfileUpdated);
    return () => window.removeEventListener("profileUpdated", onProfileUpdated);
  }, [user]);

  // Close the admin popover whenever the route changes.
  useEffect(() => { setAdminMenuOpen(false); }, [location.pathname]);

  function handleNav(path) {
    if (window.__pullupUnsavedMedia) { setNavConfirm({ path }); return; }
    setAdminMenuOpen(false);
    navigate(path);
  }
  function confirmNavLeave() {
    window.__pullupUnsavedMedia = false;
    const path = navConfirm.path;
    setNavConfirm(null);
    navigate(path);
  }

  // The Room is reached by tapping the PullUp logo, so it's not a nav pill.
  const navItems = [
    { label: "Settings", path: "/settings" },
  ];
  const adminNavItems = [
    { label: "CRM", path: "/admin/crm" },
    { label: "Matches", path: "/admin/matches" },
    { label: "Analytics", path: "/admin/analytics" },
  ];

  // The Room is the home surface; on a person room (/r/:id) it's still "the
  // Room", so treat /r/ as the Room tab being active.
  function isActive(path) {
    if (path === "/room") return location.pathname.startsWith("/room") || location.pathname.startsWith("/r/");
    return location.pathname.startsWith(path);
  }

  return (
    <>
      {/* Top accent line — sits just under the status bar in standalone. */}
      <div style={{ position: "fixed", top: "env(safe-area-inset-top, 0px)", left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, transparent 0%, #ec178f 20%, #ec178f 50%, #ec178f 80%, transparent 100%)", zIndex: 22 }} />

      <header style={{ position: "fixed", top: 0, left: 0, right: 0, height: "56px", boxSizing: "content-box", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(2px + env(safe-area-inset-top, 0px)) 16px 0 12px", zIndex: 20, background: "rgba(255, 255, 255, 0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: `1px solid ${colors.borderFaint}` }}>
        {/* Logo */}
        <button onClick={() => handleNav("/room")} aria-label="PullUp" style={{ background: "transparent", border: "none", padding: "4px 8px", display: "flex", alignItems: "center", gap: "9px", cursor: "pointer" }}>
          <img src="/pullup-textlogo.svg" alt="PullUp" style={{ height: "22px", width: "auto", display: "block" }} />
        </button>

        {/* Center nav (desktop) */}
        {!isMobile && (
          <nav style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {navItems.filter((i) => i.path !== "/settings").map(({ label, path }) => (
              <button key={path} onClick={() => handleNav(path)} style={{ background: isActive(path) ? colors.accentSoft : "transparent", border: "none", color: isActive(path) ? colors.accent : colors.textSubtle, fontSize: "13px", fontWeight: isActive(path) ? 600 : 500, letterSpacing: "0.01em", cursor: "pointer", padding: "6px 14px", borderRadius: "999px", transition: "all 0.15s ease" }}
                onMouseEnter={(e) => { if (!isActive(path)) { e.target.style.color = colors.text; e.target.style.background = colors.surfaceMuted; } }}
                onMouseLeave={(e) => { if (!isActive(path)) { e.target.style.color = colors.textSubtle; e.target.style.background = "transparent"; } }}>
                {label}
              </button>
            ))}
            {isAdmin && (
              <>
                <div style={{ width: "1px", height: "20px", background: "rgba(180, 83, 9, 0.25)", margin: "0 8px" }} />
                {adminNavItems.map(({ label, path }) => (
                  <button key={path} onClick={() => handleNav(path)} style={{ background: isActive(path) ? "rgba(180, 83, 9, 0.10)" : "transparent", border: isActive(path) ? "1px solid rgba(180, 83, 9, 0.25)" : "1px solid transparent", color: isActive(path) ? "#b45309" : "rgba(180, 83, 9, 0.6)", fontSize: "13px", fontWeight: isActive(path) ? 600 : 500, letterSpacing: "0.01em", cursor: "pointer", padding: "6px 14px", borderRadius: "999px", transition: "all 0.15s ease" }}
                    onMouseEnter={(e) => { if (!isActive(path)) { e.target.style.color = "#b45309"; e.target.style.background = "rgba(180, 83, 9, 0.06)"; } }}
                    onMouseLeave={(e) => { if (!isActive(path)) { e.target.style.color = "rgba(180, 83, 9, 0.6)"; e.target.style.background = "transparent"; } }}>
                    {label}
                  </button>
                ))}
              </>
            )}
          </nav>
        )}

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Notifications + Settings as DIRECT icons — same on desktop and
              mobile, so the person room never needs a drawer to reach them. */}
          <NotificationsBell />
          <button
            onClick={() => handleNav("/settings")}
            aria-label="Settings"
            aria-current={isActive("/settings") ? "page" : undefined}
            style={{
              width: isMobile ? 36 : 32, height: isMobile ? 36 : 32, borderRadius: "999px",
              border: `1px solid ${isActive("/settings") ? colors.accent : colors.border}`,
              background: isActive("/settings") ? colors.accent : "transparent",
              boxShadow: isActive("/settings") ? colors.accentShadow : "none",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
              transition: "background 0.2s, border-color 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => { if (!isActive("/settings")) e.currentTarget.style.background = colors.surfaceMuted; }}
            onMouseLeave={(e) => { if (!isActive("/settings")) e.currentTarget.style.background = "transparent"; }}
          >
            {isActive("/settings")
              ? <Settings size={isMobile ? 17 : 16} color="#ffffff" style={{ animation: "settings-gear-spin 9s linear infinite" }} />
              : <SilverIcon as={Settings} size={isMobile ? 17 : 16} />}
          </button>

          {/* Mobile admin badge → a compact gold popover with the admin surfaces
              (CRM / Email / Analytics). Desktop shows them inline in the center
              nav above. */}
          {isMobile && isAdmin && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setAdminMenuOpen((o) => !o)}
                aria-label="Admin menu"
                aria-expanded={adminMenuOpen}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: "999px", border: `1px solid ${adminMenuOpen ? "rgba(180,83,9,0.45)" : "rgba(180,83,9,0.28)"}`, background: adminMenuOpen ? "rgba(180,83,9,0.14)" : "rgba(180,83,9,0.08)", color: "#b45309", fontFamily: "inherit", fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
              >
                Admin
              </button>
              {adminMenuOpen && (
                <>
                  <div onClick={() => setAdminMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 18 }} />
                  <div style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, zIndex: 19, minWidth: 180, background: "#fff", border: "1px solid rgba(180,83,9,0.18)", borderRadius: "16px", boxShadow: "0 18px 48px rgba(10,10,10,0.18)", padding: "6px", display: "flex", flexDirection: "column", gap: "2px" }}>
                    {adminNavItems.map(({ label, path }) => (
                      <button key={path} onClick={() => handleNav(path)} style={{ display: "flex", alignItems: "center", width: "100%", padding: "11px 14px", borderRadius: "11px", border: "none", background: isActive(path) ? "rgba(180,83,9,0.10)" : "transparent", color: isActive(path) ? "#b45309" : "rgba(180,83,9,0.72)", fontFamily: "inherit", fontSize: "14px", fontWeight: isActive(path) ? 700 : 600, cursor: "pointer", textAlign: "left", touchAction: "manipulation" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <button onClick={() => { if (!profileComplete) { setOnboardOpen(true); } else { setCreatePickerOpen(true); } }} style={{ padding: "10px 18px", borderRadius: "999px", border: "none", background: colors.accent, color: "#fff", fontWeight: 700, fontSize: "clamp(11px, 2.5vw, 12px)", letterSpacing: "0.02em", cursor: "pointer", transition: "all 0.2s ease", boxShadow: colors.accentShadow, whiteSpace: "nowrap", touchAction: "manipulation" }}
            onMouseEnter={(e) => { e.target.style.transform = "translateY(-1px)"; e.target.style.background = colors.accentHover; e.target.style.boxShadow = "0 8px 22px rgba(236, 23, 143, 0.34)"; }}
            onMouseLeave={(e) => { e.target.style.transform = "translateY(0)"; e.target.style.background = colors.accent; e.target.style.boxShadow = colors.accentShadow; }}>
            + create
          </button>
        </div>
      </header>

      {/* Become-a-host gate: the one door, opened when a not-yet-ready user taps
          "+ create". Collects profile + verifies via the auth step, then lands
          them in the editor. */}
      {onboardOpen && (
        <AuthGate
          initialMode="onboarding"
          onDismiss={() => setOnboardOpen(false)}
          onAuthed={() => { setOnboardOpen(false); navigate("/create"); }}
        />
      )}

      {/* "+ create" → choose what to make (Event / Community / Product-soon). */}
      {createPickerOpen && (
        <PageTypePicker
          onClose={() => setCreatePickerOpen(false)}
          onPick={(kindId) => {
            setCreatePickerOpen(false);
            if (kindId === "community") navigate("/community");
            else if (kindId === "product") navigate("/create?kind=product");
            else navigate("/create");
          }}
        />
      )}

      {/* Unsaved-media confirm dialog */}
      {navConfirm && (
        <>
          <div onClick={() => setNavConfirm(null)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(8px)", zIndex: 10000 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "#fff", border: `1px solid ${colors.border}`, boxShadow: "0 24px 64px rgba(10, 10, 10, 0.22)", borderRadius: "20px", padding: "32px", maxWidth: "360px", width: "calc(100% - 48px)", zIndex: 10001, textAlign: "center" }}>
            <div style={{ fontSize: "16px", fontWeight: 700, color: colors.text, marginBottom: "8px" }}>Unsaved media</div>
            <div style={{ fontSize: "13px", color: colors.textMuted, lineHeight: 1.5, marginBottom: "24px" }}>Your uploaded images and video haven't been saved yet. If you leave now, they'll be lost.</div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setNavConfirm(null)} style={{ flex: 1, padding: "12px", borderRadius: "999px", border: `1px solid ${colors.borderStrong}`, background: "#fff", color: colors.text, fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>Stay</button>
              <button onClick={confirmNavLeave} style={{ flex: 1, padding: "12px", borderRadius: "999px", border: "none", background: colors.dangerRgba, color: colors.danger, fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>Leave</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default AppHeader;
