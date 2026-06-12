import React from "react";
import { colors } from "../theme/colors.js";
import { PullupEyes } from "./PullupEyes.jsx";
import { reportError } from "../lib/errorReporting.js";

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

    // Render crashes are exactly the failures a user would otherwise just
    // see as a broken page and leave — report them.
    reportError(error, { componentStack: errorInfo?.componentStack });
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
            background: colors.background,
            padding: "20px",
          }}
        >
          <div
            style={{
              maxWidth: "480px",
              width: "100%",
              padding: "40px",
              background: "#ffffff",
              borderRadius: "20px",
              border: `1px solid ${colors.border}`,
              boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
              textAlign: "center",
            }}
          >
            {/* Eyes looking around — lost */}
            <div style={{ marginBottom: "24px", display: "flex", justifyContent: "center" }}>
              <PullupEyes
                variant="small"
                style={{ width: 72, height: 63 }}
              />
            </div>
            <h1
              style={{
                fontSize: "22px",
                fontWeight: 700,
                marginBottom: "10px",
                color: colors.text,
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                fontSize: "15px",
                color: colors.textMuted,
                marginBottom: "32px",
                lineHeight: 1.6,
              }}
            >
              We hit an unexpected error. Try refreshing the page or go back home.
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
                  padding: "11px 24px",
                  borderRadius: "999px",
                  border: `1px solid ${colors.borderStrong}`,
                  background: "#ffffff",
                  color: colors.text,
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.surface;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#ffffff";
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  window.location.href = "/";
                }}
                style={{
                  padding: "11px 24px",
                  borderRadius: "999px",
                  border: "none",
                  background: colors.accent,
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: colors.accentShadow,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.accentHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = colors.accent;
                }}
              >
                Go Home
              </button>
            </div>
            {import.meta.env.DEV && this.state.error && (
              <details
                style={{
                  marginTop: "32px",
                  padding: "16px",
                  background: colors.surfaceMuted,
                  borderRadius: "8px",
                  textAlign: "left",
                  fontSize: "12px",
                  color: colors.textMuted,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <summary style={{ cursor: "pointer", marginBottom: "8px", color: colors.text }}>
                  Error Details (Development Only)
                </summary>
                <pre
                  style={{
                    overflow: "auto",
                    maxHeight: "200px",
                    fontSize: "11px",
                    fontFamily: "monospace",
                    color: colors.textMuted,
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
