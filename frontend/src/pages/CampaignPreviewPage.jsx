import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Users, Mail } from "lucide-react";
import EmailCanvas from "../components/crm/EmailCanvas.jsx";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { logger } from "../lib/logger.js";

function deriveFirstName(user) {
  if (!user) return "";
  const meta = user.user_metadata || {};
  if (meta.first_name) return String(meta.first_name).trim();
  const full = meta.full_name || meta.name || "";
  if (full) return String(full).trim().split(/\s+/)[0] || "";
  if (user.email) return String(user.email).split("@")[0];
  return "";
}

const STATUS_LABELS = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
};

export function CampaignPreviewPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const currentUserFirstName = useMemo(() => deriveFirstName(user), [user]);

  const [campaign, setCampaign] = useState(null);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await authenticatedFetch(`/host/crm/campaigns/${id}`);
        if (!res.ok) {
          throw new Error(
            res.status === 404 ? "Campaign not found" : "Couldn't load campaign",
          );
        }
        const c = await res.json();
        if (cancelled) return;
        setCampaign(c);

        if (c.eventId) {
          try {
            const evRes = await authenticatedFetch(`/host/events/${c.eventId}`);
            if (evRes.ok) {
              const ev = await evRes.json();
              if (!cancelled) setEvent(ev);
            }
          } catch (err) {
            logger.warn("[CampaignPreview] event fetch failed", {
              message: err?.message,
            });
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load campaign");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (id) load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ opacity: 0.5, padding: 40 }}>Loading preview…</div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div style={pageStyle}>
        <div style={{ opacity: 0.7, padding: 40, textAlign: "center" }}>
          {error || "Campaign not found."}
        </div>
      </div>
    );
  }

  const templateType = campaign.templateType === "followup" ? "followup" : "event";
  const tc = campaign.templateContent || {};
  const blocks = Array.isArray(tc.blocks) ? tc.blocks : [];
  const previewText = tc.previewText || "";
  const subject = campaign.subject || tc.subject || "";

  const canvasProps =
    templateType === "followup"
      ? {
          selectedTemplate: "followup",
          followupEvent: event,
          followupSubject: subject,
          followupPreviewText: previewText,
          followupBlocks: blocks,
        }
      : {
          selectedTemplate: "event",
          selectedEvent: event,
          eventSubject: subject,
          eventPreviewText: previewText,
          eventBlocks: blocks,
        };

  const statusKey = (campaign.status || "").toLowerCase();
  const statusLabel = STATUS_LABELS[statusKey] || campaign.status || "";

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 12, opacity: 0.55, letterSpacing: 0.4 }}>
            CAMPAIGN PREVIEW · {statusLabel.toUpperCase()}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{subject || "Untitled"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: 0.85 }}>
          {event?.title && (
            <span style={pillStyle}>
              <Mail size={14} />
              <span>{event.title}</span>
            </span>
          )}
          <span style={pillStyle}>
            <Users size={14} />
            <span>{campaign.totalRecipients ?? 0} recipients</span>
          </span>
        </div>
      </div>

      <div style={canvasWrapStyle}>
        <EmailCanvas
          {...canvasProps}
          currentUserFirstName={currentUserFirstName}
        />
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#05040a",
  color: "#fff",
  padding: "24px 20px 140px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};

const headerStyle = {
  width: "100%",
  maxWidth: 720,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 24,
  padding: "16px 20px",
  borderRadius: 14,
  background: "rgba(20,16,30,0.6)",
  border: "1px solid rgba(255,255,255,0.06)",
  marginBottom: 20,
  flexWrap: "wrap",
};

const pillStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  fontSize: 13,
};

const canvasWrapStyle = {
  width: "100%",
  maxWidth: 720,
};
