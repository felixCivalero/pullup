import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useToast } from "../components/Toast";

export function SettingsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Mock user data
  const [user, setUser] = useState({
    name: "Felix civalero",
    brand: "",
    email: "felix.civalero@gmail.com",
    bio: "",
    profilePicture: null,
  });

  useEffect(() => {
    function handleMouseMove(e) {
      setMousePosition({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  function handleSave() {
    showToast("Settings saved successfully! ✨", "success");
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
            Settings
          </h1>
          <p style={{ opacity: 0.7, marginBottom: "32px", fontSize: "15px" }}>
            Manage your account and preferences
          </p>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginBottom: "32px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              paddingBottom: "16px",
            }}
          >
            <TabButton label="Account" active={true} />
            <TabButton label="Preferences" />
            <TabButton label="Payment" />
          </div>

          {/* Account Section */}
          <div>
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 600,
                marginBottom: "8px",
              }}
            >
              Your Profile
            </h2>
            <p
              style={{
                fontSize: "14px",
                opacity: 0.7,
                marginBottom: "24px",
              }}
            >
              Choose how you are displayed as a host or guest.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "32px",
                alignItems: "start",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                }}
              >
                <label style={{ display: "block" }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      marginBottom: "8px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      opacity: 0.9,
                    }}
                  >
                    Name
                  </div>
                  <input
                    type="text"
                    value={user.name}
                    onChange={(e) => setUser({ ...user, name: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: "12px",
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(20, 16, 30, 0.6)",
                      color: "#fff",
                      fontSize: "15px",
                      outline: "none",
                    }}
                  />
                </label>

                <label style={{ display: "block" }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      marginBottom: "8px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      opacity: 0.9,
                    }}
                  >
                    Brand
                  </div>
                  <div style={{ position: "relative" }}>
                    <span
                      style={{
                        position: "absolute",
                        left: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "rgba(255,255,255,0.5)",
                      }}
                    ></span>
                    <input
                      type="text"
                      value={user.brand || ""}
                      onChange={(e) =>
                        setUser({ ...user, brand: e.target.value })
                      }
                      placeholder="brand"
                      style={{
                        width: "100%",
                        padding: "12px 16px 12px 28px",
                        borderRadius: "12px",
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(20, 16, 30, 0.6)",
                        color: "#fff",
                        fontSize: "15px",
                        outline: "none",
                      }}
                    />
                  </div>
                </label>

                <label style={{ display: "block" }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      marginBottom: "8px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      opacity: 0.9,
                    }}
                  >
                    Bio
                  </div>
                  <textarea
                    value={user.bio}
                    onChange={(e) => setUser({ ...user, bio: e.target.value })}
                    placeholder="Share a little about your background and interests."
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: "12px",
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(20, 16, 30, 0.6)",
                      color: "#fff",
                      fontSize: "15px",
                      outline: "none",
                      minHeight: "100px",
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />
                </label>
              </div>

              <div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    opacity: 0.9,
                  }}
                >
                  Profile Picture
                </div>
                <div
                  style={{
                    width: "120px",
                    height: "120px",
                    borderRadius: "50%",
                    background:
                      "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "48px",
                    position: "relative",
                    cursor: "pointer",
                    border: "2px solid rgba(255,255,255,0.1)",
                  }}
                >
                  😊
                  <div
                    style={{
                      position: "absolute",
                      bottom: "4px",
                      right: "4px",
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      background: "rgba(0,0,0,0.7)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px solid rgba(255,255,255,0.2)",
                      fontSize: "16px",
                    }}
                  >
                    ⬆️
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleSave}
              style={{
                marginTop: "32px",
                padding: "14px 28px",
                borderRadius: "999px",
                border: "none",
                background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                color: "#fff",
                fontWeight: 700,
                fontSize: "15px",
                cursor: "pointer",
                boxShadow: "0 10px 30px rgba(139, 92, 246, 0.4)",
                transition: "all 0.3s ease",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow =
                  "0 15px 40px rgba(139, 92, 246, 0.6)";
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow =
                  "0 10px 30px rgba(139, 92, 246, 0.4)";
              }}
            >
              🔒 Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({ label, active }) {
  return (
    <button
      style={{
        padding: "8px 16px",
        background: "transparent",
        border: "none",
        color: active ? "#fff" : "rgba(255,255,255,0.6)",
        fontWeight: active ? 600 : 500,
        fontSize: "14px",
        cursor: "pointer",
        borderBottom: active ? "2px solid #8b5cf6" : "2px solid transparent",
        marginBottom: "-16px",
      }}
    >
      {label}
    </button>
  );
}
