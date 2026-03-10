import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CrmTab } from "../components/HomeCrmTab";

export function CrmPage() {
  const navigate = useNavigate();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function handleMouseMove(e) {
      setMousePosition({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div
      className="page-with-header"
      style={{
        minHeight: "100vh",
        position: "relative",
        background:
          "radial-gradient(circle at 20% 50%, rgba(192, 192, 192, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232, 232, 232, 0.08) 0%, transparent 50%), #05040a",
        paddingBottom: "clamp(20px, 5vw, 40px)",
      }}
    >
      {/* Cursor glow effect */}
      <div
        style={{
          position: "fixed",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(192, 192, 192, 0.08) 0%, transparent 70%)",
          left: mousePosition.x - 300,
          top: mousePosition.y - 300,
          pointerEvents: "none",
          transition: "all 0.3s ease-out",
          zIndex: 1,
        }}
      />

      <div
        className="responsive-container responsive-container-wide"
        style={{ position: "relative", zIndex: 2 }}
      >
        <style>{`
          @media (max-width: 767px) {
            .responsive-container-wide {
              padding: 12px !important;
            }
            .responsive-container-wide .responsive-card {
              padding: 16px !important;
              border-radius: 16px !important;
            }
          }
        `}</style>

        <div
          className="responsive-card"
          style={{
            background: "rgba(12, 10, 18, 0.6)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <CrmTab />
        </div>
      </div>
    </div>
  );
}

