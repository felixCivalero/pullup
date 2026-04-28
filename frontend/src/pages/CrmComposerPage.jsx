import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authenticatedFetch } from "../lib/api.js";
import { useToast } from "../components/Toast";
import ComposerSidebar from "../components/crm/ComposerSidebar";
import SegmentPanel from "../components/crm/SegmentPanel";
import EmailPanel from "../components/crm/EmailPanel";
import ConfirmSendDialog from "../components/crm/ConfirmSendDialog";

export default function CrmComposerPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();

  const [activeSection, setActiveSection] = useState("segment");

  // Composer state (lifted verbatim from CrmTab)
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

  const [segmentRecipients, setSegmentRecipients] = useState([]);
  const [excludedRecipientIds, setExcludedRecipientIds] = useState(() => new Set());

  const [isConfirmSendOpen, setIsConfirmSendOpen] = useState(false);
  const [sendStage, setSendStage] = useState("confirm");
  const [sendingCampaignId, setSendingCampaignId] = useState(null);
  const [sendingStats, setSendingStats] = useState({ totalRecipients: 0, totalSent: 0, totalFailed: 0 });
  const [sendingErrorMessage, setSendingErrorMessage] = useState("");

  const cancelledRef = useRef(false);
  useEffect(() => {
    return () => { cancelledRef.current = true; };
  }, []);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  const effectiveRecipientCount = segmentRecipients.filter(
    (p) => !excludedRecipientIds.has(p.id)
  ).length;

  // Auto-populate email fields when event is selected (event template only) — copied from CrmTab
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
    } else {
      setHeadlineText("");
      setSubjectLine("");
      setIntroQuote("");
      setIntroBody("");
      setIntroGreeting("");
      setIntroNote("");
      setSignoffText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, selectedTemplate]);

  // Load events list (for the event-content dropdown)
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

  // Load segment recipients on mount, using filter params from query string
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        for (const [k, v] of searchParams.entries()) params.append(k, v);
        params.set("limit", "1000");
        params.set("offset", "0");
        if (!params.has("eventsAttendedMin")) params.set("eventsAttendedMin", "0");
        if (!params.has("sortBy")) params.set("sortBy", "created_at");
        if (!params.has("sortOrder")) params.set("sortOrder", "desc");

        const res = await authenticatedFetch(`/host/crm/people?${params}`);
        if (!res.ok) throw new Error("Failed to load recipients");
        const data = await res.json();
        if (!cancelled) setSegmentRecipients(data.people || []);
      } catch (err) {
        console.error(err);
        if (!cancelled) showToast("Failed to load recipients for this segment", "error");
      }
    })();
    return () => { cancelled = true; };
  }, [searchParamsString, showToast]);

  function handleSendClick() {
    if (effectiveRecipientCount === 0) {
      showToast("No recipients in this segment.", "error");
      return;
    }
    if (selectedTemplate === "event" && !selectedEventId) {
      showToast("Choose an event for the email content.", "error");
      return;
    }
    setSendStage("confirm");
    setSendingCampaignId(null);
    setSendingStats({ totalRecipients: effectiveRecipientCount, totalSent: 0, totalFailed: 0 });
    setSendingErrorMessage("");
    setIsConfirmSendOpen(true);
  }

  async function handleConfirmSend() {
    if (!selectedEventId) {
      if (cancelledRef.current) return;
      setSendStage("error");
      setSendingErrorMessage("No event selected.");
      return;
    }

    if (cancelledRef.current) return;
    setSendStage("sending");
    setSendingErrorMessage("");

    const filterCriteria = {
      search: searchParams.get("search") || undefined,
      attendedEventIds: searchParams.get("attendedEventIds")
        ? searchParams.get("attendedEventIds").split(",")
        : undefined,
      hasDinner: searchParams.get("hasDinner") === "true" ? true : undefined,
      eventsAttendedMin: searchParams.has("eventsAttendedMin")
        ? Number(searchParams.get("eventsAttendedMin"))
        : 0,
      excludePersonIds: Array.from(excludedRecipientIds),
    };

    try {
      const campaignData = {
        templateType: "event",
        eventId: selectedEventId,
        subject:
          subjectLine ||
          (selectedEvent ? `You're invited to ${selectedEvent.title}.` : ""),
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

      // 1) Create campaign
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
      setSendingCampaignId(campaignId);
      setSendingStats((prev) => ({
        ...prev,
        totalRecipients:
          totalRecipients != null ? totalRecipients : prev.totalRecipients,
      }));

      // 2) Start sending
      const sendRes = await authenticatedFetch(
        `/host/crm/campaigns/${campaignId}/send`,
        { method: "POST" },
      );
      if (cancelledRef.current) return;
      if (!sendRes.ok) {
        const errJson = await sendRes.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to start sending");
      }

      // 3) Poll status until "sent" or "failed"
      let attempts = 0;
      const maxAttempts = 60; // ~2 minutes at 2s intervals

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (cancelledRef.current) return;
        if (attempts >= maxAttempts) {
          if (cancelledRef.current) return;
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
        if (!statusRes.ok) {
          continue;
        }

        const statusJson = await statusRes.json();
        if (cancelledRef.current) return;

        setSendingStats((prev) => ({
          ...prev,
          totalRecipients: statusJson.totalRecipients ?? prev.totalRecipients,
          totalSent: statusJson.totalSent ?? prev.totalSent,
          totalFailed: statusJson.totalFailed ?? prev.totalFailed,
        }));

        if (statusJson.status === "sent") {
          if (cancelledRef.current) return;
          setSendStage("success");
          return;
        }
        if (statusJson.status === "failed") {
          if (cancelledRef.current) return;
          setSendStage("error");
          setSendingErrorMessage("The email provider reported a failure.");
          return;
        }
        // statuses "queued" or "sending" -> keep polling
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

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "rgba(8,6,12,1)", color: "#fff" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <h1 style={{ fontSize: "20px", fontWeight: 600, margin: 0 }}>Compose campaign</h1>
        <button
          type="button"
          onClick={() => navigate("/crm")}
          style={{
            padding: "8px 14px",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.15)",
            background: "transparent",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <ComposerSidebar activeSection={activeSection} onSelect={setActiveSection} />

        <main style={{ flex: 1, padding: "24px", overflowY: "auto" }}>
          {activeSection === "segment" && (
            <SegmentPanel
              effectiveRecipientCount={effectiveRecipientCount}
              excludedRecipientIds={excludedRecipientIds}
              setExcludedRecipientIds={setExcludedRecipientIds}
              segmentRecipients={segmentRecipients}
            />
          )}
          {activeSection === "email" && (
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
            />
          )}
        </main>
      </div>

      <footer
        style={{
          position: "sticky",
          bottom: 0,
          display: "flex",
          justifyContent: "flex-end",
          gap: "12px",
          padding: "12px 24px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(8,6,12,0.95)",
        }}
      >
        <button
          type="button"
          onClick={handleSendClick}
          disabled={effectiveRecipientCount === 0}
          style={{
            padding: "10px 20px",
            borderRadius: "8px",
            border: "none",
            background: effectiveRecipientCount === 0 ? "rgba(139,92,246,0.3)" : "linear-gradient(135deg,#8b5cf6,#ec4899)",
            color: "#fff",
            fontSize: "14px",
            fontWeight: 600,
            cursor: effectiveRecipientCount === 0 ? "not-allowed" : "pointer",
            opacity: effectiveRecipientCount === 0 ? 0.7 : 1,
          }}
        >
          Send campaign
        </button>
      </footer>

      <ConfirmSendDialog
        isOpen={isConfirmSendOpen}
        sendStage={sendStage}
        effectiveRecipientCount={effectiveRecipientCount}
        sendingStats={sendingStats}
        sendingErrorMessage={sendingErrorMessage}
        selectedEvent={selectedEvent}
        subjectLine={subjectLine}
        onClose={() => setIsConfirmSendOpen(false)}
        onConfirmSend={handleConfirmSend}
      />
    </div>
  );
}
