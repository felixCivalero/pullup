import { useEffect, useMemo, useRef, useState } from "react";
import { authenticatedFetch } from "../lib/api.js";
import { useToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";
import { CrmTab } from "../components/HomeCrmTab";
import EmailPanel from "../components/crm/EmailPanel";
import EmailCanvas from "../components/crm/EmailCanvas";
import ConfirmSendDialog from "../components/crm/ConfirmSendDialog";

const TABS = [
  { id: "segment", label: "Segment" },
  { id: "email", label: "Design" },
];

function deriveFirstName(user) {
  if (!user) return "";
  const meta = user.user_metadata || {};
  if (meta.first_name) return String(meta.first_name).trim();
  const full = meta.full_name || meta.name || "";
  if (full) return String(full).trim().split(/\s+/)[0] || "";
  if (user.email) return String(user.email).split("@")[0];
  return "";
}

export function CrmPage() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const currentUserFirstName = useMemo(() => deriveFirstName(user), [user]);

  const [activeTab, setActiveTab] = useState("segment");

  // Segment selection pushed up by HomeCrmTab whenever filters/total change
  const [segmentSelection, setSegmentSelection] = useState({
    filterCriteria: { eventsAttendedMin: 0 },
    total: 0,
  });

  // Composer state — event template
  const [events, setEvents] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState("event");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [subjectLine, setSubjectLine] = useState("");
  const [headlineText, setHeadlineText] = useState("");
  const [introQuote, setIntroQuote] = useState("");
  const [introBody, setIntroBody] = useState("");
  const [introGreeting, setIntroGreeting] = useState("");
  const [introNote, setIntroNote] = useState("");
  const [signoffText, setSignoffText] = useState("");

  // Composer state — follow-up template (independent so switching templates
  // doesn't lose either side's edits)
  const [followupEventId, setFollowupEventId] = useState("");
  const [followupSubject, setFollowupSubject] = useState("");
  const [followupPreviewText, setFollowupPreviewText] = useState("");
  const [followupGreeting, setFollowupGreeting] = useState("Hi {{first_name}},");
  const [followupBlocks, setFollowupBlocks] = useState([]);
  const [followupSignoff, setFollowupSignoff] = useState("");

  const [isConfirmSendOpen, setIsConfirmSendOpen] = useState(false);
  const [sendStage, setSendStage] = useState("confirm");
  const [sendingStats, setSendingStats] = useState({
    totalRecipients: 0,
    totalSent: 0,
    totalFailed: 0,
  });
  const [sendingErrorMessage, setSendingErrorMessage] = useState("");

  const cancelledRef = useRef(false);
  useEffect(() => () => { cancelledRef.current = true; }, []);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId],
  );

  const followupEvent = useMemo(
    () => events.find((e) => e.id === followupEventId) || null,
    [events, followupEventId],
  );

  // Auto-populate event-template fields when an event is selected
  useEffect(() => {
    if (selectedTemplate === "event" && selectedEvent) {
      setHeadlineText(selectedEvent.title || "");
      setSubjectLine(`You're invited to ${selectedEvent.title}.`);
      const bodyText = selectedEvent.description
        ? selectedEvent.description.trim()
        : "Skriv om du vill komma så får du länk till gästlistan!";
      setIntroBody(bodyText);
      setIntroGreeting("");
      setSignoffText("");
      setIntroQuote("");
      setIntroNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, selectedTemplate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authenticatedFetch("/events");
        if (!res.ok) throw new Error("Failed to load events");
        const data = await res.json();
        if (!cancelled) setEvents(data || []);
      } catch (err) {
        console.error(err);
        if (!cancelled) showToast("Failed to load events", "error");
      }
    })();
    return () => { cancelled = true; };
  }, [showToast]);

  function handleSendClick() {
    if (segmentSelection.total === 0) {
      showToast("No recipients in this segment.", "error");
      setActiveTab("segment");
      return;
    }
    if (selectedTemplate === "event" && !selectedEventId) {
      showToast("Choose an event for the email content.", "error");
      setActiveTab("email");
      return;
    }
    if (selectedTemplate === "followup") {
      if (!followupSubject.trim()) {
        showToast("Subject is required.", "error");
        setActiveTab("email");
        return;
      }
      if (followupBlocks.length === 0) {
        showToast("Add at least one block.", "error");
        setActiveTab("email");
        return;
      }
    }
    setSendStage("confirm");
    setSendingStats({
      totalRecipients: segmentSelection.total,
      totalSent: 0,
      totalFailed: 0,
    });
    setSendingErrorMessage("");
    setIsConfirmSendOpen(true);
  }

  async function handleConfirmSend() {
    const isFollowup = selectedTemplate === "followup";
    if (!isFollowup && !selectedEventId) {
      if (cancelledRef.current) return;
      setSendStage("error");
      setSendingErrorMessage("No event selected.");
      return;
    }

    if (cancelledRef.current) return;
    setSendStage("sending");
    setSendingErrorMessage("");

    const filterCriteria = segmentSelection.filterCriteria || {};

    try {
      const campaignData = isFollowup
        ? {
            templateType: "followup",
            eventId: followupEventId || null,
            subject: followupSubject,
            templateContent: {
              subject: followupSubject,
              previewText: followupPreviewText,
              greeting: followupGreeting,
              blocks: followupBlocks,
              signoff: followupSignoff,
            },
            filterCriteria,
          }
        : {
            templateType: selectedTemplate,
            eventId: selectedEventId,
            subject:
              subjectLine ||
              (selectedEvent
                ? `You're invited to ${selectedEvent.title}.`
                : ""),
            templateContent: {
              headline: headlineText || selectedEvent?.title || "",
              introQuote: introQuote || "",
              introBody: introBody || "",
              introGreeting: introGreeting || "",
              introNote: introNote || "",
              signoffText: signoffText || "",
              ctaLabel: "TO EVENT",
            },
            filterCriteria,
          };

      const createRes = await authenticatedFetch("/host/crm/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaignData),
      });
      if (!createRes.ok) {
        const errJson = await createRes.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to create campaign");
      }
      const { campaignId, totalRecipients } = await createRes.json();
      if (cancelledRef.current) return;
      setSendingStats((prev) => ({
        ...prev,
        totalRecipients:
          totalRecipients != null ? totalRecipients : prev.totalRecipients,
      }));

      const sendRes = await authenticatedFetch(
        `/host/crm/campaigns/${campaignId}/send`,
        { method: "POST" },
      );
      if (cancelledRef.current) return;
      if (!sendRes.ok) {
        const errJson = await sendRes.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to start sending");
      }

      let attempts = 0;
      const maxAttempts = 60;
      while (true) {
        if (cancelledRef.current) return;
        if (attempts >= maxAttempts) {
          setSendStage("error");
          setSendingErrorMessage(
            "Timed out while waiting for campaign to finish.",
          );
          return;
        }
        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const statusRes = await authenticatedFetch(
          `/host/crm/campaigns/${campaignId}`,
        );
        if (!statusRes.ok) continue;
        const statusJson = await statusRes.json();
        if (cancelledRef.current) return;

        setSendingStats((prev) => ({
          ...prev,
          totalRecipients:
            statusJson.totalRecipients ?? prev.totalRecipients,
          totalSent: statusJson.totalSent ?? prev.totalSent,
          totalFailed: statusJson.totalFailed ?? prev.totalFailed,
        }));

        if (statusJson.status === "sent") {
          setSendStage("success");
          return;
        }
        if (statusJson.status === "failed") {
          setSendStage("error");
          setSendingErrorMessage("The email provider reported a failure.");
          return;
        }
      }
    } catch (error) {
      console.error("Error sending campaign:", error);
      if (cancelledRef.current) return;
      setSendStage("error");
      setSendingErrorMessage(
        error.message || "Unexpected error while sending campaign.",
      );
    }
  }

  const sendDisabled = segmentSelection.total === 0;

  return (
    <div
      className="page-with-header"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background:
          "radial-gradient(circle at 20% 50%, rgba(192, 192, 192, 0.06) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232, 232, 232, 0.05) 0%, transparent 50%), #05040a",
      }}
    >
      <style>{`
        @media (max-width: 900px) {
          .crm-split { flex-direction: column !important; }
          .crm-rail { width: 100% !important; min-width: 0 !important; max-width: none !important; border-right: none !important; border-bottom: 1px solid rgba(255,255,255,0.06) !important; max-height: 60vh; }
          .crm-canvas { padding: 12px !important; }
        }
      `}</style>

      <div
        className="crm-split"
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
        }}
      >
        {/* LEFT RAIL: tab strip + tab content + sticky footer */}
        <aside
          className="crm-rail"
          style={{
            width: "440px",
            minWidth: "440px",
            maxWidth: "440px",
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(12, 10, 18, 0.55)",
            backdropFilter: "blur(10px)",
            minHeight: 0,
          }}
        >
          {/* Tab strip — modeled on CreateEventPage's top tab bar */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 10,
              background: "rgba(12, 10, 18, 0.95)",
              backdropFilter: "blur(12px)",
              flexShrink: 0,
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ display: "flex", position: "relative" }}>
              {TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      flex: 1,
                      padding: "14px 0",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      WebkitTapHighlightColor: "transparent",
                      fontSize: "10.5px",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: active ? "#fff" : "rgba(255,255,255,0.3)",
                      transition: "color 0.2s ease",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: `${TABS.findIndex((t) => t.id === activeTab) * (100 / TABS.length)}%`,
                  width: `${100 / TABS.length}%`,
                  height: "2px",
                  background: "linear-gradient(90deg, rgba(192,192,192,0.6), rgba(232,232,232,0.4))",
                  transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            </div>
          </div>

          {/* Tab content — scrolls independently */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            <div style={{ display: activeTab === "segment" ? "block" : "none" }}>
              <CrmTab onSegmentChange={setSegmentSelection} />
            </div>
            {activeTab === "email" && (
              <EmailPanel
                events={events}
                selectedTemplate={selectedTemplate}
                setSelectedTemplate={setSelectedTemplate}
                selectedEventId={selectedEventId}
                setSelectedEventId={setSelectedEventId}
                selectedEvent={selectedEvent}
                subjectLine={subjectLine}
                setSubjectLine={setSubjectLine}
                headlineText={headlineText}
                setHeadlineText={setHeadlineText}
                introQuote={introQuote}
                setIntroQuote={setIntroQuote}
                introBody={introBody}
                setIntroBody={setIntroBody}
                introGreeting={introGreeting}
                setIntroGreeting={setIntroGreeting}
                introNote={introNote}
                setIntroNote={setIntroNote}
                signoffText={signoffText}
                setSignoffText={setSignoffText}
                selectedEventIdForFollowup={followupEventId}
                setSelectedEventIdForFollowup={setFollowupEventId}
                followupSubject={followupSubject}
                setFollowupSubject={setFollowupSubject}
                followupPreviewText={followupPreviewText}
                setFollowupPreviewText={setFollowupPreviewText}
                followupGreeting={followupGreeting}
                setFollowupGreeting={setFollowupGreeting}
                followupBlocks={followupBlocks}
                setFollowupBlocks={setFollowupBlocks}
                followupSignoff={followupSignoff}
                setFollowupSignoff={setFollowupSignoff}
              />
            )}
          </div>

          {/* Sticky footer at bottom of rail */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              padding: "12px 16px",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(12,10,18,0.95)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>
              {segmentSelection.total.toLocaleString()}{" "}
              {segmentSelection.total === 1 ? "recipient" : "recipients"}
            </div>
            <button
              type="button"
              onClick={handleSendClick}
              disabled={sendDisabled}
              style={{
                padding: "10px 18px",
                borderRadius: "10px",
                border: "none",
                background: sendDisabled
                  ? "rgba(34,197,94,0.12)"
                  : "linear-gradient(135deg, rgba(34,197,94,0.35), rgba(34,197,94,0.18))",
                color: sendDisabled ? "rgba(255,255,255,0.3)" : "#4ade80",
                fontSize: "13px",
                fontWeight: 600,
                cursor: sendDisabled ? "not-allowed" : "pointer",
                boxShadow: sendDisabled
                  ? "none"
                  : "0 0 0 1px rgba(34,197,94,0.3), 0 4px 12px rgba(0,0,0,0.3)",
                transition: "all 0.2s ease",
              }}
            >
              Send campaign →
            </button>
          </div>
        </aside>

        {/* RIGHT PANE: always-visible email canvas */}
        <main
          className="crm-canvas"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "24px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <EmailCanvas
            selectedTemplate={selectedTemplate}
            selectedEvent={selectedEvent}
            subjectLine={subjectLine}
            headlineText={headlineText}
            introQuote={introQuote}
            introBody={introBody}
            introGreeting={introGreeting}
            introNote={introNote}
            signoffText={signoffText}
            followupEvent={followupEvent}
            followupSubject={followupSubject}
            followupPreviewText={followupPreviewText}
            followupGreeting={followupGreeting}
            followupBlocks={followupBlocks}
            followupSignoff={followupSignoff}
            currentUserFirstName={currentUserFirstName}
          />
        </main>
      </div>

      <ConfirmSendDialog
        isOpen={isConfirmSendOpen}
        sendStage={sendStage}
        effectiveRecipientCount={segmentSelection.total}
        sendingStats={sendingStats}
        sendingErrorMessage={sendingErrorMessage}
        selectedEvent={selectedEvent}
        subjectLine={
          selectedTemplate === "followup" ? followupSubject : subjectLine
        }
        onClose={() => setIsConfirmSendOpen(false)}
        onConfirmSend={handleConfirmSend}
      />
    </div>
  );
}
