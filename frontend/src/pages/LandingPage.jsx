import { useNavigate } from "react-router-dom";

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div
      className="responsive-container"
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        className="responsive-card"
        style={{
          textAlign: "center",
          maxWidth: "480px",
          width: "100%",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            textTransform: "uppercase",
            opacity: 0.7,
          }}
        >
          PullUp
        </div>

        <h1 style={{ fontSize: "28px", margin: "12px 0 8px" }}>
          The fastest way to make a sexy RSVP link
        </h1>

        <p style={{ fontSize: "14px", opacity: 0.8, marginBottom: "24px" }}>
          Create a link in seconds. Drop it in your bio. Let people pull up.
        </p>

        <button
          onClick={() => navigate("/create")}
          style={{
            padding: "12px 24px",
            borderRadius: "999px",
            border: "none",
            fontWeight: 600,
            fontSize: "15px",
            cursor: "pointer",
          }}
        >
          Create a PullUp
        </button>
      </div>
    </div>
  );
}
