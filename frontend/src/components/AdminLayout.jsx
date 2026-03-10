import { NavLink, Outlet } from "react-router-dom";
import { colors } from "../theme/colors.js";

const NAV_ITEMS = [
  { label: "Discover", to: "/admin/discover", emoji: "🌆" },
  { label: "Newsletter", to: "/admin", emoji: "✉️", end: true },
  { label: "Analytics", to: "/admin/analytics", emoji: "📊" },
  { label: "Sales", to: "/admin/sales", emoji: "💼" },
];

export function AdminLayout() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: colors.background,
        color: "#fff",
      }}
    >
      {/* Persistent admin nav */}
      <div
        style={{
          position: "sticky",
          top: 58,
          zIndex: 10,
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(5,4,10,0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <div
          style={{
            maxWidth: 640,
            margin: "0 auto",
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            gap: 4,
            height: 52,
          }}
        >
          <span
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              opacity: 0.35,
              marginRight: 12,
              userSelect: "none",
            }}
          >
            Admin
          </span>

          {NAV_ITEMS.map(({ label, to, emoji, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: "999px",
                fontSize: "13px",
                fontWeight: isActive ? 600 : 400,
                textDecoration: "none",
                color: isActive ? "#fff" : "rgba(255,255,255,0.45)",
                background: isActive
                  ? "rgba(255,255,255,0.1)"
                  : "transparent",
                border: isActive
                  ? "1px solid rgba(255,255,255,0.15)"
                  : "1px solid transparent",
                transition: "all 0.15s ease",
              })}
            >
              <span style={{ fontSize: "14px" }}>{emoji}</span>
              {label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Page content */}
      <Outlet />
    </div>
  );
}
