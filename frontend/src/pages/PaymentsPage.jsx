import { Link } from "react-router-dom";

export function PaymentsPage() {
  return (
    <div
      className="page-with-header"
      style={{
        minHeight: "100vh",
        position: "relative",
        background:
          "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
        paddingBottom: "40px",
      }}
    >
      <div
        className="responsive-container"
        style={{ position: "relative", zIndex: 2 }}
      >
        <div
          className="responsive-card"
          style={{
            maxWidth: "800px",
            margin: "0 auto",
            background: "rgba(12, 10, 18, 0.6)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div style={{ marginBottom: "24px", fontSize: "14px", opacity: 0.7 }}>
            <Link
              to="/home"
              style={{
                color: "#aaa",
                textDecoration: "none",
                transition: "color 0.3s ease",
              }}
              onMouseEnter={(e) => (e.target.style.color = "#fff")}
              onMouseLeave={(e) => (e.target.style.color = "#aaa")}
            >
              ← Back to home
            </Link>
          </div>

          <h1
            style={{
              fontSize: "clamp(28px, 5vw, 36px)",
              fontWeight: 700,
              marginBottom: "8px",
            }}
          >
            Payments
          </h1>
          <p style={{ opacity: 0.7, marginBottom: "32px", fontSize: "15px" }}>
            Manage your payment methods and transactions
          </p>

          <div
            style={{
              textAlign: "center",
              padding: "60px 24px",
              opacity: 0.6,
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>💳</div>
            <div style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>
              Payments coming soon
            </div>
            <div style={{ fontSize: "14px", opacity: 0.7 }}>
              Payment management features will be available here.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

