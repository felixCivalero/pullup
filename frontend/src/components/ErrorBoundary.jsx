import React from "react";
import { useNavigate } from "react-router-dom";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console for debugging
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });

    // You can also log the error to an error reporting service here
    // Example: logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
            padding: "20px",
          }}
        >
          <div
            style={{
              maxWidth: "500px",
              width: "100%",
              padding: "40px",
              background: "rgba(20, 16, 30, 0.8)",
              borderRadius: "20px",
              border: "1px solid rgba(255,255,255,0.1)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "64px", marginBottom: "24px" }}>⚠️</div>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 700,
                marginBottom: "12px",
                color: "#fff",
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                fontSize: "16px",
                opacity: 0.7,
                marginBottom: "32px",
                color: "#fff",
              }}
            >
              We encountered an unexpected error. Please try refreshing the page
              or go back to the home page.
            </p>
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={this.handleReset}
                style={{
                  padding: "12px 24px",
                  borderRadius: "12px",
                  border: "none",
                  background: "rgba(255,255,255,0.1)",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = "rgba(255,255,255,0.15)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = "rgba(255,255,255,0.1)";
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  window.location.href = "/";
                }}
                style={{
                  padding: "12px 24px",
                  borderRadius: "12px",
                  border: "none",
                  background:
                    "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = "translateY(-2px)";
                  e.target.style.boxShadow =
                    "0 8px 20px rgba(139, 92, 246, 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = "translateY(0)";
                  e.target.style.boxShadow = "none";
                }}
              >
                Go Home
              </button>
            </div>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <details
                style={{
                  marginTop: "32px",
                  padding: "16px",
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: "8px",
                  textAlign: "left",
                  fontSize: "12px",
                  color: "#fff",
                  opacity: 0.7,
                }}
              >
                <summary style={{ cursor: "pointer", marginBottom: "8px" }}>
                  Error Details (Development Only)
                </summary>
                <pre
                  style={{
                    overflow: "auto",
                    maxHeight: "200px",
                    fontSize: "11px",
                    fontFamily: "monospace",
                  }}
                >
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
