import { AuthCard } from "./AuthCard";
import { colors } from "../theme/colors.js";

// The one door. The app shell shows this whenever there's no session on a route
// that needs one — guest or host, same modal: Google / WhatsApp / email
// (AuthCard). Once auth resolves, the shell re-renders with the user and this
// unmounts on its own (it's driven by `user`, so there's no close button —
// signing in IS the dismissal). After login you're routed by access.
export function LoginModal({ redirectTo = "/room" }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(10,10,12,0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 20,
          padding: "28px 24px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <h2
            style={{
              fontSize: 19,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: colors.text,
              margin: "0 0 4px",
            }}
          >
            Sign in to PullUp
          </h2>
          <p style={{ fontSize: 13.5, color: colors.textMuted, margin: 0, lineHeight: 1.5 }}>
            One account for everything you're in.
          </p>
        </div>
        <AuthCard onSuccess={() => {}} redirectTo={redirectTo} theme="light" />
      </div>
    </div>
  );
}
