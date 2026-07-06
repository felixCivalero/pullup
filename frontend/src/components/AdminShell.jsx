// AdminShell — the admin world's chrome: a proper dashboard with the menu on
// the LEFT and nothing in the top bar. Wraps every /admin route (ProtectedLayout
// hands over to this shell for admins). The Messages blob rides along on every
// admin page, so the system's voice is always one tap away.

import { useEffect, useState, Suspense, lazy } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Globe2, Gauge, Sparkles, ShieldCheck, Users, GitMerge, BarChart3, LogOut } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext";

const AdminMessagesDock = lazy(() => import("./AdminMessagesDock.jsx").then((m) => ({ default: m.AdminMessagesDock })));

const INK = "#0a0a0a";
const MUTED = "rgba(10,10,10,0.55)";
const FAINT = "rgba(10,10,10,0.4)";
const LINE = "rgba(10,10,10,0.08)";
const PINK = "#ec178f";

function Eyes({ size = 30 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#fff", border: `2px solid ${PINK}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <img src="/pullup-smalleyes.svg" alt="PullUp" style={{ width: "68%", display: "block" }} />
    </div>
  );
}

export function AdminShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { signOut } = useAuth();
  const [me, setMe] = useState(null);
  // Icon rail that breathes: 64px of icons, expanding on hover to show labels.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    authenticatedFetch("/admin/me").then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {});
  }, []);

  const tab = params.get("tab") || "globe";
  const onHq = location.pathname === "/admin/inbox";

  const hq = [
    { key: "globe", label: "World", Icon: Globe2 },
    { key: "overview", label: "Overview", Icon: Gauge },
    { key: "requests", label: "Requests", Icon: Sparkles },
    ...(me?.role === "super" ? [{ key: "admins", label: "Admins", Icon: ShieldCheck }] : []),
  ];
  const tools = [
    { path: "/admin/crm", label: "CRM", Icon: Users },
    { path: "/admin/matches", label: "Matching", Icon: GitMerge },
    { path: "/admin/analytics", label: "Analytics", Icon: BarChart3 },
  ];

  const label = (text) => (
    <span style={{ whiteSpace: "nowrap", opacity: open ? 1 : 0, transform: open ? "translateX(0)" : "translateX(-6px)", transition: "opacity 0.16s ease, transform 0.16s ease", pointerEvents: "none" }}>{text}</span>
  );
  const item = (active, onClick, Icon, text, key) => (
    <button key={key} onClick={onClick} title={open ? undefined : text}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(10,10,10,0.04)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "none"; }}
      style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 12px", border: "none", borderRadius: 12, cursor: "pointer", textAlign: "left", background: active ? INK : "none", color: active ? "#fff" : MUTED, fontSize: 13.5, fontWeight: 700, fontFamily: "inherit", transition: "background 0.12s", overflow: "hidden" }}>
      <Icon size={17} strokeWidth={2.25} style={{ color: active ? PINK : "inherit", flexShrink: 0 }} />
      {label(text)}
    </button>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#fafafa", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: INK }}>
      {/* ── The rail: 64px of icons, breathing open on hover ── */}
      <aside onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        style={{ width: open ? 208 : 64, flexShrink: 0, display: "flex", flexDirection: "column", gap: 2, padding: "16px 10px", borderRight: `1px solid ${LINE}`, background: "#fff", position: "sticky", top: 0, height: "100vh", boxSizing: "border-box", transition: "width 0.18s ease", overflow: "hidden", zIndex: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 3px 14px" }}>
          <Eyes size={34} />
          <div style={{ opacity: open ? 1 : 0, transition: "opacity 0.16s ease", whiteSpace: "nowrap" }}>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>pullup<span style={{ color: PINK }}>.</span></div>
            <div style={{ fontSize: 10, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: "0.09em" }}>HQ</div>
          </div>
        </div>

        {hq.map(({ key, label: text, Icon }) =>
          item(onHq && tab === key, () => navigate(`/admin/inbox?tab=${key}`), Icon, text, key))}

        <div style={{ height: 1, background: LINE, margin: "10px 6px" }} />
        {tools.map(({ path, label: text, Icon }) =>
          item(location.pathname.startsWith(path), () => navigate(path), Icon, text, path))}

        <div style={{ marginTop: "auto", borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
          {me?.email && (
            <div style={{ fontSize: 11.5, color: FAINT, padding: "0 12px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: open ? 1 : 0, transition: "opacity 0.16s ease" }}>
              {me.email}{me.role === "super" ? " · super" : ""}
            </div>
          )}
          {item(false, () => signOut(), LogOut, "Sign out", "signout")}
        </div>
      </aside>

      {/* ── The page ── */}
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>

      {/* The system's voice, on every admin page. */}
      <Suspense fallback={null}>
        <AdminMessagesDock />
      </Suspense>
    </div>
  );
}
