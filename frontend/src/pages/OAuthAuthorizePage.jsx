// OAuth 2.1 consent page for PullUp MCP.
//
// Flow:
//   1. Backend's GET mcp.pullup.se/oauth/authorize redirects here with a
//      signed `req` token in the URL.
//   2. If user isn't signed in, redirect to /login?next=/oauth/authorize?...
//   3. Fetch /api/oauth/describe-consent?req=... to learn which client is
//      asking and what scope they want.
//   4. Show "Allow [client] to manage your events?" with Allow / Deny.
//   5. On click, POST /api/oauth/consent with { req, decision }. Backend
//      mints the auth code and returns { redirectTo: "<client URL>?code=…" }.
//   6. window.location.replace(redirectTo) — the user lands back in the AI
//      app, fully connected.

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plug, Check, AlertTriangle, Shield } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { SilverIcon } from "../components/ui/SilverIcon.jsx";

export function OAuthAuthorizePage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [params] = useSearchParams();
  const reqToken = params.get("req");

  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // If unauthenticated, bounce to /login with a return path so the user
  // lands back here after signing in.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      const here = `/oauth/authorize?req=${encodeURIComponent(reqToken || "")}`;
      navigate(`/login?next=${encodeURIComponent(here)}`, { replace: true });
    }
  }, [authLoading, user, reqToken, navigate]);

  // Describe the consent request once we have a session.
  useEffect(() => {
    if (!user || !reqToken) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await authenticatedFetch(
          `/oauth/describe-consent?req=${encodeURIComponent(reqToken)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error_description || data.error || "Invalid request");
        if (!cancelled) setClient(data);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load authorization request");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, reqToken]);

  async function submit(decision) {
    if (!reqToken) return;
    try {
      setSubmitting(true);
      setError(null);
      const res = await authenticatedFetch("/oauth/consent", {
        method: "POST",
        body: JSON.stringify({ req: reqToken, decision }),
      });
      const data = await res.json();
      if (!res.ok || !data.redirectTo) {
        throw new Error(data.error_description || data.error || "Authorization failed");
      }
      // Send the user back to the AI client.
      window.location.replace(data.redirectTo);
    } catch (err) {
      setError(err.message || "Authorization failed");
      setSubmitting(false);
    }
  }

  if (authLoading || (!user && !error)) {
    return <CenterFrame>Loading…</CenterFrame>;
  }

  if (!reqToken) {
    return (
      <CenterFrame>
        <ErrorCard message="Missing authorization request. Open this page only from your AI client's connector flow." />
      </CenterFrame>
    );
  }

  if (loading) {
    return <CenterFrame>Loading authorization request…</CenterFrame>;
  }

  if (error) {
    return (
      <CenterFrame>
        <ErrorCard message={error} />
      </CenterFrame>
    );
  }

  const clientLabel = client?.clientName || "An AI assistant";
  const host = safeHost(client?.redirectUri);

  return (
    <CenterFrame>
      <div style={cardStyle}>
        <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", marginBottom: "20px" }}>
          <div style={iconBubbleStyle}>
            <SilverIcon as={Plug} size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "4px" }}>
              Authorize {clientLabel}?
            </div>
            <div style={{ fontSize: "13px", opacity: 0.7, lineHeight: 1.5 }}>
              {clientLabel} wants to connect to your PullUp account
              {host ? <> via <code style={inlineCodeStyle}>{host}</code></> : null}.
            </div>
          </div>
        </div>

        <div style={permissionListStyle}>
          <div style={smallLabelStyle}>It will be able to</div>
          <PermissionItem text="Create, edit, publish, and unpublish your events" />
          <PermissionItem text="See your event RSVPs and guest lists" />
          <PermissionItem text="Upload cover images to your events" />
          <PermissionItem text="Read your event analytics — attendance, revenue, trends" />
          <PermissionItem text="Read your CRM — audience segments, repeat guests, top spenders" />
          <PermissionItem text="Read your email campaign performance" />
        </div>

        <div style={whoStyle}>
          <Shield size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
          <span>
            Authorizing as <b>{user?.email}</b>. Revoke any time from Settings → PullUp MCP.
          </span>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
          <button
            type="button"
            style={denyButtonStyle}
            onClick={() => submit("deny")}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            style={allowButtonStyle}
            onClick={() => submit("allow")}
            disabled={submitting}
          >
            {submitting ? "Authorizing…" : "Allow"}
          </button>
        </div>
      </div>
    </CenterFrame>
  );
}

function PermissionItem({ text }) {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
      <Check size={14} style={{ color: "rgba(34, 197, 94, 0.9)", marginTop: "3px", flexShrink: 0 }} />
      <span style={{ fontSize: "13px", opacity: 0.85 }}>{text}</span>
    </div>
  );
}

function ErrorCard({ message }) {
  return (
    <div style={{ ...cardStyle, display: "flex", gap: "12px", alignItems: "flex-start" }}>
      <AlertTriangle size={20} style={{ color: "#f59e0b", flexShrink: 0, marginTop: "2px" }} />
      <div>
        <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px" }}>
          Authorization error
        </div>
        <div style={{ fontSize: "13px", opacity: 0.7 }}>{message}</div>
      </div>
    </div>
  );
}

function CenterFrame({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 20% 50%, rgba(192, 192, 192, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232, 232, 232, 0.08) 0%, transparent 50%), #05040a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        color: "#fff",
      }}
    >
      <div style={{ width: "100%", maxWidth: "440px" }}>{children}</div>
    </div>
  );
}

function safeHost(url) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

const cardStyle = {
  background: "rgba(20, 16, 30, 0.85)",
  backdropFilter: "blur(10px)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "16px",
  padding: "28px",
  boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
};

const iconBubbleStyle = {
  width: "48px",
  height: "48px",
  borderRadius: "14px",
  background: "rgba(192, 192, 192, 0.14)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const smallLabelStyle = {
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  opacity: 0.55,
  marginBottom: "8px",
};

const permissionListStyle = {
  padding: "14px 16px",
  background: "rgba(10, 8, 18, 0.5)",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.04)",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const whoStyle = {
  marginTop: "16px",
  fontSize: "12px",
  opacity: 0.7,
  display: "flex",
  gap: "8px",
  alignItems: "center",
};

const inlineCodeStyle = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "12px",
  background: "rgba(255,255,255,0.06)",
  padding: "1px 6px",
  borderRadius: "4px",
};

const allowButtonStyle = {
  flex: 1,
  padding: "12px 16px",
  borderRadius: "12px",
  border: "none",
  background: "rgba(232, 232, 232, 0.92)",
  color: "#05040a",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
};

const denyButtonStyle = {
  flex: 1,
  padding: "12px 16px",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  fontWeight: 600,
  fontSize: "14px",
  cursor: "pointer",
};
