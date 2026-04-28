import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authenticatedFetch } from "../lib/api.js";
import { useToast } from "../components/Toast";
import ComposerSidebar from "../components/crm/ComposerSidebar";
import SegmentPanel from "../components/crm/SegmentPanel";
import EmailPanel from "../components/crm/EmailPanel";

export default function CrmComposerPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

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

  // eslint-disable-next-line no-unused-vars
  const [isConfirmSendOpen, setIsConfirmSendOpen] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [sendStage, setSendStage] = useState("confirm");
  // eslint-disable-next-line no-unused-vars
  const [sendingCampaignId, setSendingCampaignId] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [sendingStats, setSendingStats] = useState({ totalRecipients: 0, totalSent: 0, totalFailed: 0 });
  // eslint-disable-next-line no-unused-vars
  const [sendingErrorMessage, setSendingErrorMessage] = useState("");

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
  }, [searchParams, showToast]);

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
    setSendingErrorMessage("");
    setIsConfirmSendOpen(true);
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

      {/* TODO Task 6: render the existing isConfirmSendOpen confirm dialog here. */}
    </div>
  );
}
