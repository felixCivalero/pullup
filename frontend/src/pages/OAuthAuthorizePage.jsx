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
import { colors } from "../theme/colors.js";

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
            <Plug size={22} style={{ color: colors.accent }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "4px", color: colors.text }}>
              Authorize {clientLabel}?
            </div>
            <div style={{ fontSize: "13px", color: colors.textMuted, lineHeight: 1.5 }}>
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
        </div>

        <div style={whoStyle}>
          <Shield size={14} style={{ color: colors.textSubtle, flexShrink: 0 }} />
          <span style={{ color: colors.textMuted }}>
            Authorizing as <b style={{ color: colors.text }}>{user?.email}</b>. Revoke any time from Settings → PullUp MCP.
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
      <Check size={14} style={{ color: colors.success, marginTop: "3px", flexShrink: 0 }} />
      <span style={{ fontSize: "13px", color: colors.textMuted }}>{text}</span>
    </div>
  );
}

function ErrorCard({ message }) {
  return (
    <div style={{ ...cardStyle, display: "flex", gap: "12px", alignItems: "flex-start" }}>
      <AlertTriangle size={20} style={{ color: colors.warning, flexShrink: 0, marginTop: "2px" }} />
      <div>
        <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px", color: colors.text }}>
          Authorization error
        </div>
        <div style={{ fontSize: "13px", color: colors.textMuted }}>{message}</div>
      </div>
    </div>
  );
}

function CenterFrame({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: colors.background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        color: colors.text,
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
  background: "#fff",
  border: `1px solid ${colors.border}`,
  borderRadius: "16px",
  padding: "28px",
  boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
};

const iconBubbleStyle = {
  width: "48px",
  height: "48px",
  borderRadius: "14px",
  background: colors.accentSoft,
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
  color: colors.textSubtle,
  marginBottom: "8px",
};

const permissionListStyle = {
  padding: "14px 16px",
  background: colors.surface,
  borderRadius: "12px",
  border: `1px solid ${colors.border}`,
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const whoStyle = {
  marginTop: "16px",
  fontSize: "12px",
  display: "flex",
  gap: "8px",
  alignItems: "center",
};

const inlineCodeStyle = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "12px",
  background: colors.surfaceMuted,
  border: `1px solid ${colors.border}`,
  padding: "1px 6px",
  borderRadius: "4px",
  color: colors.text,
};

const allowButtonStyle = {
  flex: 1,
  padding: "12px 16px",
  borderRadius: "12px",
  border: "none",
  background: colors.accent,
  color: "#fff",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
};

const denyButtonStyle = {
  flex: 1,
  padding: "12px 16px",
  borderRadius: "12px",
  border: `1px solid ${colors.borderStrong}`,
  background: "#fff",
  color: colors.text,
  fontWeight: 600,
  fontSize: "14px",
  cursor: "pointer",
};
