import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TabButton } from "../components/HomeTabs";
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

        {/* Main app mode tabs (Events / CRM) */}
        <div
          style={{
            position: "sticky",
            top: 56,
            zIndex: 5,
            marginBottom: "clamp(12px, 3vw, 20px)",
          }}
        >
          <div
            className="main-tabs-rail"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "4px",
              background: "rgba(5, 4, 10, 0.96)",
              borderRadius: "999px",
              padding: "4px",
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "0 18px 40px rgba(0,0,0,0.65)",
              maxWidth: "420px",
              margin: "0 auto",
            }}
          >
            <TabButton
              label="Events"
              active={false}
              onClick={() => navigate("/events")}
            />
            <TabButton label="CRM" active={true} />
          </div>
        </div>

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

