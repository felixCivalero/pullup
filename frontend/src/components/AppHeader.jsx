// AppHeader — the default in-app top bar (logo, nav, admin nav, notifications,
// settings, create). Extracted out of ProtectedLayout so it can be rendered by
// surfaces that live OUTSIDE the protected shell but still need the app chrome —
// notably the owner standing in their own person room (/r/:me), which is a
// public route (so a shared /r/:stranger link stays clean) yet must feel like
// home when it's you.
//
// This is the NON-event header only. Event routes keep their bespoke header
// inline in ProtectedLayout (it's tightly coupled to the event nav context).
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "./Toast";
import { authenticatedFetch } from "../lib/api.js";
import { Settings } from "lucide-react";
import { SilverIcon } from "./ui/SilverIcon.jsx";
import { NotificationsBell } from "./NotificationsBell.jsx";
import { AuthGate } from "./auth/AuthGate.jsx";
import { colors } from "../theme/colors.js";

const barStyle = { width: 14, height: 2, borderRadius: 999, background: "#0a0a0a" };

export function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [profilePic, setProfilePic] = useState(null);
  const [profileComplete, setProfileComplete] = useState(true);
  const [onboardOpen, setOnboardOpen] = useState(false); // create gate → onboarding door
  const [navConfirm, setNavConfirm] = useState(null);
  const drawerRef = useRef(null);

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
          if (p.profilePicture) setProfilePic(p.profilePicture);
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

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const avatarSrc = profilePic || null;

  function handleNav(path) {
    if (window.__pullupUnsavedMedia) { setNavConfirm({ path }); return; }
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

  const navItems = [
    { label: "The Room", path: "/room" },
    { label: "Settings", path: "/settings" },
  ];
  const adminNavItems = [
    { label: "CRM", path: "/admin/crm" },
    { label: "Email", path: "/admin/email" },
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
      {/* Top accent line */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, transparent 0%, #ec178f 20%, #ec178f 50%, #ec178f 80%, transparent 100%)", zIndex: 22 }} />

      <header style={{ position: "fixed", top: 2, left: 0, right: 0, height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px 0 12px", zIndex: 20, background: "rgba(255, 255, 255, 0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: `1px solid ${colors.borderFaint}` }}>
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
          {!isMobile && <NotificationsBell />}
          {!isMobile && (
            <button onClick={() => handleNav("/settings")} style={{ width: 32, height: 32, borderRadius: "999px", border: `1px solid ${colors.border}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, transition: "background 0.2s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.surfaceMuted; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <SilverIcon as={Settings} size={16} />
            </button>
          )}
          {isMobile && (
            <button onClick={() => setMenuOpen(true)} aria-label="Open menu" style={{ width: 36, height: 36, borderRadius: "999px", border: `1px solid ${colors.border}`, background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", cursor: "pointer", padding: 0 }}>
              <span style={barStyle} />
              <span style={barStyle} />
              <span style={{ ...barStyle, width: 10 }} />
            </button>
          )}
          <button onClick={() => { if (!profileComplete) { setOnboardOpen(true); } else { handleNav("/create"); } }} style={{ padding: "10px 18px", borderRadius: "999px", border: "none", background: colors.accent, color: "#fff", fontWeight: 700, fontSize: "clamp(11px, 2.5vw, 12px)", letterSpacing: "0.02em", cursor: "pointer", transition: "all 0.2s ease", boxShadow: colors.accentShadow, whiteSpace: "nowrap", touchAction: "manipulation" }}
            onMouseEnter={(e) => { e.target.style.transform = "translateY(-1px)"; e.target.style.background = colors.accentHover; e.target.style.boxShadow = "0 8px 22px rgba(236, 23, 143, 0.34)"; }}
            onMouseLeave={(e) => { e.target.style.transform = "translateY(0)"; e.target.style.background = colors.accent; e.target.style.boxShadow = colors.accentShadow; }}>
            + create
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {isMobile && menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.5)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", zIndex: 998, animation: "menuFadeIn 0.2s ease" }} />
          <div ref={drawerRef} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(300px, 80vw)", background: "#fff", boxShadow: "-12px 0 48px rgba(10, 10, 10, 0.16)", borderLeft: `1px solid ${colors.border}`, zIndex: 999, animation: "menuSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: 40, height: 40, borderRadius: "999px", border: `1px solid ${colors.border}`, background: colors.surfaceMuted, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="Profile" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }} />
                  ) : (
                    <span style={{ color: colors.text, fontSize: "14px", fontWeight: 600, textTransform: "uppercase" }}>{(user?.email || "?").slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: colors.text, fontSize: "14px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "User"}
                  </div>
                  {isAdmin && <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#b45309", marginTop: "2px" }}>Admin</div>}
                </div>
              </div>
              <button onClick={() => setMenuOpen(false)} style={{ width: 32, height: 32, borderRadius: "999px", border: "none", background: colors.surfaceMuted, color: colors.textMuted, fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
            </div>
            <nav style={{ padding: "12px 8px", flex: 1 }}>
              {navItems.map(({ label, path }) => (
                <button key={path} onClick={() => handleNav(path)} style={{ display: "flex", alignItems: "center", width: "100%", padding: "14px 16px", borderRadius: "12px", border: "none", background: isActive(path) ? colors.accentSoft : "transparent", color: isActive(path) ? colors.accent : colors.textMuted, fontSize: "15px", fontWeight: isActive(path) ? 600 : 500, cursor: "pointer", textAlign: "left", transition: "all 0.15s ease", touchAction: "manipulation" }}>
                  {label}
                </button>
              ))}
              {isAdmin && (
                <>
                  <div style={{ margin: "12px 16px 8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, rgba(180, 83, 9, 0.35), transparent)" }} />
                    <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#b45309" }}>Admin</span>
                    <div style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, transparent, rgba(180, 83, 9, 0.35))" }} />
                  </div>
                  {adminNavItems.map(({ label, path }) => (
                    <button key={path} onClick={() => handleNav(path)} style={{ display: "flex", alignItems: "center", width: "100%", padding: "14px 16px", borderRadius: "12px", border: "none", background: isActive(path) ? "rgba(180, 83, 9, 0.10)" : "transparent", color: isActive(path) ? "#b45309" : "rgba(180, 83, 9, 0.6)", fontSize: "15px", fontWeight: isActive(path) ? 600 : 500, cursor: "pointer", textAlign: "left", transition: "all 0.15s ease", touchAction: "manipulation" }}>
                      {label}
                    </button>
                  ))}
                </>
              )}
            </nav>
          </div>
          <style>{`@keyframes menuFadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes menuSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
        </>
      )}

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
