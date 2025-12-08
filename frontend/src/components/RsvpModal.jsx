import { useState } from "react";

const inputStyle = {
  width: "100%",
  marginTop: "8px",
  padding: "12px 16px",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(20, 16, 30, 0.6)",
  color: "#fff",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
  transition: "all 0.3s ease",
  backdropFilter: "blur(10px)",
};

const errorInputStyle = {
  ...inputStyle,
  border: "1px solid #ef4444",
};

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function RsvpModal({ event, onClose, onSubmit, loading }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (!validateEmail(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }

    onSubmit({ email: email.trim(), name: name.trim() || null });
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "rgba(12, 10, 18, 0.95)",
          borderRadius: "24px",
          padding: "32px",
          maxWidth: "420px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(20px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: "clamp(20px, 4vw, 24px)",
            marginBottom: "24px",
            fontWeight: 700,
            background:
              "linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.8) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          RSVP to {event?.title}
        </h2>

        <form onSubmit={handleSubmit}>
          <label
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 600,
              marginBottom: "20px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              opacity: 0.9,
            }}
          >
            Email *
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              style={
                error
                  ? {
                      ...inputStyle,
                      border: "1px solid #ef4444",
                      boxShadow: "0 0 0 3px rgba(239, 68, 68, 0.1)",
                    }
                  : inputStyle
              }
              placeholder="you@example.com"
              disabled={loading}
              autoFocus
            />
          </label>

          <label
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 600,
              marginBottom: "24px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              opacity: 0.9,
            }}
          >
            Name (optional)
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              placeholder="Your name"
              disabled={loading}
            />
          </label>

          {error && (
            <div
              style={{
                color: "#ef4444",
                fontSize: "13px",
                marginBottom: "16px",
                padding: "12px",
                background: "rgba(239, 68, 68, 0.1)",
                borderRadius: "12px",
                border: "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                flex: 1,
                padding: "12px 20px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.5 : 1,
                transition: "all 0.3s ease",
                backdropFilter: "blur(10px)",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.target.style.background = "rgba(255,255,255,0.1)";
                  e.target.style.borderColor = "rgba(255,255,255,0.3)";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.target.style.background = "rgba(255,255,255,0.05)";
                  e.target.style.borderColor = "rgba(255,255,255,0.2)";
                }
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: "12px 20px",
                borderRadius: "999px",
                border: "none",
                background: loading
                  ? "#666"
                  : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading
                  ? "none"
                  : "0 10px 30px rgba(139, 92, 246, 0.4)",
                transition: "all 0.3s ease",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.target.style.transform = "translateY(-2px)";
                  e.target.style.boxShadow = "0 15px 40px rgba(139, 92, 246, 0.6)";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.target.style.transform = "translateY(0)";
                  e.target.style.boxShadow = "0 10px 30px rgba(139, 92, 246, 0.4)";
                }
              }}
            >
              {loading ? "Submitting…" : "RSVP"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

