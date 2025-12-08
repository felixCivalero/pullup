import { useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../components/Toast";

export function IntegrationsPage() {
  const { showToast } = useToast();
  const [integrations, setIntegrations] = useState([
    { id: "google-calendar", name: "Google Calendar", connected: false, icon: "📅" },
    { id: "stripe", name: "Stripe", connected: false, icon: "💳" },
    { id: "mailchimp", name: "Mailchimp", connected: false, icon: "📧" },
    { id: "slack", name: "Slack", connected: false, icon: "💬" },
  ]);

  function handleConnect(id) {
    setIntegrations(
      integrations.map((int) =>
        int.id === id ? { ...int, connected: !int.connected } : int
      )
    );
    const integration = integrations.find((int) => int.id === id);
    showToast(
      `${integration.name} ${integration.connected ? "disconnected" : "connected"}!`,
      "success"
    );
  }

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
            Integrations
          </h1>
          <p style={{ opacity: 0.7, marginBottom: "32px", fontSize: "15px" }}>
            Connect your favorite tools to enhance your events
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {integrations.map((integration) => (
              <div
                key={integration.id}
                style={{
                  padding: "20px",
                  background: "rgba(20, 16, 30, 0.6)",
                  borderRadius: "16px",
                  border: "1px solid rgba(255,255,255,0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "12px",
                      background: "rgba(139, 92, 246, 0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "24px",
                    }}
                  >
                    {integration.icon}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: 600,
                        marginBottom: "4px",
                      }}
                    >
                      {integration.name}
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        opacity: 0.6,
                      }}
                    >
                      {integration.connected
                        ? "Connected"
                        : "Not connected"}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleConnect(integration.id)}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "999px",
                    border: integration.connected
                      ? "1px solid rgba(255,255,255,0.2)"
                      : "none",
                    background: integration.connected
                      ? "transparent"
                      : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (integration.connected) {
                      e.target.style.background = "rgba(239, 68, 68, 0.2)";
                      e.target.style.borderColor = "rgba(239, 68, 68, 0.5)";
                    } else {
                      e.target.style.transform = "translateY(-2px)";
                      e.target.style.boxShadow =
                        "0 8px 20px rgba(139, 92, 246, 0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (integration.connected) {
                      e.target.style.background = "transparent";
                      e.target.style.borderColor = "rgba(255,255,255,0.2)";
                    } else {
                      e.target.style.transform = "translateY(0)";
                      e.target.style.boxShadow = "none";
                    }
                  }}
                >
                  {integration.connected ? "Disconnect" : "Connect"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

