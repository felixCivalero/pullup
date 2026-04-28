import { useNavigate } from "react-router-dom";

export default function CrmComposerPage() {
  const navigate = useNavigate();
  return (
    <div style={{ padding: "24px", color: "#fff", minHeight: "100vh", background: "rgba(8,6,12,1)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700 }}>Compose campaign</h1>
        <button
          type="button"
          onClick={() => navigate("/crm")}
          style={{
            padding: "8px 16px",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.15)",
            background: "transparent",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
      <p style={{ opacity: 0.7 }}>Coming up next: sidebar + panels.</p>
    </div>
  );
}
