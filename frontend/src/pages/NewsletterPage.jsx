import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { colors } from "../theme/colors.js";

export function NewsletterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [state, setState] = useState({
    loading: true,
    status: null,
    message: "",
    error: false,
  });

  useEffect(() => {
    const token = searchParams.get("token");
    const intent = searchParams.get("intent");

    if (!token || intent !== "unsubscribe") {
      setState({
        loading: false,
        status: "invalid",
        error: true,
        message:
          "This link is no longer valid. Use the latest email you received to manage your preferences.",
      });
      return;
    }

    async function runUnsubscribe() {
      try {
        const response = await fetch("/api/newsletter/unsubscribe-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });

        let payload = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok) {
          const code = String(payload?.code || "").toLowerCase();
          let message =
            "We couldn’t update your preferences. Try again later or use the latest email you received.";

          if (code === "invalid_token") {
            message =
              "This unsubscribe link is no longer valid. Use the latest email you received to manage your preferences.";
          }

          setState({
            loading: false,
            status: "error",
            error: true,
            message,
          });
          return;
        }

        const status = payload?.status;

        if (status === "unsubscribed") {
          setState({
            loading: false,
            status: "unsubscribed",
            error: false,
            message:
              "You’re unsubscribed. You won’t get Pullup invites at this address.",
          });
        } else if (status === "already_unsubscribed") {
          setState({
            loading: false,
            status: "already_unsubscribed",
            error: false,
            message: "You were already unsubscribed for this email.",
          });
        } else if (status === "suppressed") {
          setState({
            loading: false,
            status: "suppressed",
            error: false,
            message:
              "You’re not currently subscribed at this address. Nothing more to do.",
          });
        } else {
          setState({
            loading: false,
            status: "unknown",
            error: false,
            message:
              "Your email preferences were updated. If this wasn’t you, ignore this change.",
          });
        }
      } catch (error) {
        console.error("Newsletter unsubscribe error:", error);
        setState({
          loading: false,
          status: "error",
          error: true,
          message:
            "We couldn’t reach the server. Check your connection and try again.",
        });
      }
    }

    runUnsubscribe();
  }, [searchParams]);

  const handleBackHome = () => {
    navigate("/");
  };

  const title =
    state.status === "unsubscribed"
      ? "You’re off the list"
      : state.status === "already_unsubscribed"
      ? "Already unsubscribed"
      : state.status === "suppressed"
      ? "Nothing to update"
      : state.error
      ? "We couldn’t update this link"
      : "Updating your preferences";

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        maxHeight: "100vh",
        maxWidth: "100vw",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: "hidden",
        background: `${colors.gradientGlow}, ${colors.background}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "360px",
          width: "100%",
          borderRadius: "24px",
          background:
            "linear-gradient(145deg, rgba(11,10,20,0.98), rgba(17,15,30,0.98))",
          boxShadow: "0 24px 60px rgba(0,0,0,0.85)",
          border: "1px solid rgba(255,255,255,0.12)",
          padding: "20px 20px 16px",
          textAlign: "left",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            opacity: 0.6,
            marginBottom: 10,
          }}
        >
          PullUp
        </div>
        <h1
          style={{
            fontSize: "20px",
            fontWeight: 700,
            margin: 0,
            marginBottom: 8,
            color: "#fff",
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontSize: "13px",
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.8)",
            margin: 0,
            marginBottom: 16,
          }}
        >
          {state.loading
            ? "Give us a second while we update your email preferences."
            : state.message}
        </p>

        <button
          type="button"
          onClick={handleBackHome}
          style={{
            width: "100%",
            padding: "10px 0",
            borderRadius: "999px",
            border: "none",
            background:
              "linear-gradient(135deg, #f5f5f5 0%, #c7c7c7 60%, #a1a1a1 100%)",
            color: "#121212",
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Back to PullUp
        </button>
      </div>
    </div>
  );
}

