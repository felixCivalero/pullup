// Public page reached via the per-recipient /u/:token link in marketing
// emails. No auth: the token itself is the proof. Toggles
// people.marketing_unsubscribed_at without ever deleting the row.

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { API_BASE } from "../lib/env.js";

export function UnsubscribePage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [person, setPerson] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/u/${encodeURIComponent(token)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Link is invalid or expired");
        }
        const data = await res.json();
        if (!cancelled) setPerson(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function toggle(subscribed) {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/u/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribed }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const data = await res.json();
      setPerson((prev) => ({ ...prev, isUnsubscribed: data.isUnsubscribed }));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {loading && <div style={{ opacity: 0.6 }}>Loading…</div>}

        {!loading && error && (
          <div>
            <h1 style={titleStyle}>Link not valid</h1>
            <p style={bodyStyle}>{error}</p>
          </div>
        )}

        {!loading && !error && person && (
          <div>
            <h1 style={titleStyle}>
              {person.isUnsubscribed
                ? "You're unsubscribed"
                : "Unsubscribe from PullUp emails"}
            </h1>
            <p style={bodyStyle}>
              {person.isUnsubscribed
                ? `${person.email} won't receive marketing emails from PullUp hosts. You can re-subscribe below at any time.`
                : `${person.email} is currently subscribed to marketing emails from PullUp hosts. Click below to stop receiving them.`}
            </p>
            {person.isUnsubscribed ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => toggle(true)}
                style={resubBtn}
              >
                {saving ? "Saving…" : "Re-subscribe"}
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => toggle(false)}
                style={unsubBtn}
              >
                {saving ? "Saving…" : "Unsubscribe"}
              </button>
            )}
            <p style={{ ...bodyStyle, fontSize: 12, opacity: 0.5, marginTop: 24 }}>
              Your event history and RSVPs are not affected.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background:
    "radial-gradient(circle at 20% 50%, rgba(192, 192, 192, 0.08) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232, 232, 232, 0.06) 0%, transparent 50%), #05040a",
  color: "#fff",
};

const cardStyle = {
  width: "100%",
  maxWidth: 480,
  padding: 32,
  borderRadius: 16,
  background: "rgba(12, 10, 18, 0.7)",
  border: "1px solid rgba(255,255,255,0.06)",
  backdropFilter: "blur(10px)",
};

const titleStyle = {
  fontSize: 22,
  fontWeight: 600,
  margin: "0 0 12px",
};

const bodyStyle = {
  fontSize: 14,
  lineHeight: 1.6,
  opacity: 0.8,
  margin: "0 0 20px",
};

const buttonBase = {
  display: "inline-block",
  padding: "10px 20px",
  borderRadius: 10,
  border: "none",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const unsubBtn = {
  ...buttonBase,
  background: "linear-gradient(135deg, rgba(248,113,113,0.3), rgba(248,113,113,0.15))",
  color: "#fca5a5",
  boxShadow: "0 0 0 1px rgba(248,113,113,0.3), 0 4px 12px rgba(0,0,0,0.3)",
};

const resubBtn = {
  ...buttonBase,
  background: "linear-gradient(135deg, rgba(34,197,94,0.3), rgba(34,197,94,0.15))",
  color: "#4ade80",
  boxShadow: "0 0 0 1px rgba(34,197,94,0.3), 0 4px 12px rgba(0,0,0,0.3)",
};
