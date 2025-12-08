// frontend/src/components/ProtectedLayout.jsx
import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";

export function ProtectedLayout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  function handleNav(path) {
    setOpen(false);
    navigate(path);
  }

  const isHome = location.pathname === "/home";

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
