import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { authenticatedFetch } from "../../lib/api.js";
import { isOwnerEmail, useSession } from "../../lib/owner.js";
import { useToast } from "../../components/Toast";
import EmailPanel from "../../components/crm/EmailPanel";
import EmailCanvas from "../../components/crm/EmailCanvas";
import ConfirmSendDialog from "../../components/crm/ConfirmSendDialog";
import CrmSegment from "../../components/crm/CrmSegment";
import { colors } from "../../components/crm/mailColors.js";
import { AdminShell } from "./AdminShell.jsx";
import { CreditsLine, CreditsPaywall } from "../../components/admin/EmailCredits.jsx";
import { useEmailCredits } from "../../components/admin/useEmailCredits.js";

/* /admin/mail — the mail module, restored as it was in the old app's CRM
   composer (removed 2026-06-02, b34e7b50): a Segment tab and a Design tab on
   the left (templates: event invitation, follow-up; blocks edited in place —
   text, image, button, event cards, socials), the email exactly as it lands
   on the right (light/dark). What changed: Segment is the event platform's CRM loaded in place
   (components/crm/CrmSegment.jsx), sending goes through POST /admin/sends (unsubscribe link,
   logged), and there are no saved drafts or scheduling (their tables are
   gone). ?event=<id> opens the event invitation for that event. */

const TABS = [
  { id: "segment", label: "Segment" },
  { id: "email", label: "Design" },
];
const HTTP_RE = /^https?:\/\//i;

// Build a sensible default block list when an event is picked for the
// "Event email template" — host can then edit / reorder / extend.
function buildDefaultEventBlocks(event) {
  if (!event) return [defaultGreetingBlock()];
  const blocks = [defaultGreetingBlock()];
  const hero = event.coverImageUrl || event.imageUrl;
  if (hero) {
    blocks.push({ type: "image", url: hero, alt: event.title || "", source: "event-gallery", width: 100, align: "center", aspectRatio: "banner" });
  }
  if (event.title) blocks.push({ type: "text", style: "heading", text: event.title });
  const meta = [];
  if (event.startsAt) {
    const d = new Date(event.startsAt);
    if (!isNaN(d.getTime())) {
      meta.push(d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
    }
  }
  if (event.location) meta.push(event.location);
  if (meta.length) blocks.push({ type: "text", style: "paragraph", text: meta.join(" · ") });
  if (event.description) blocks.push({ type: "text", style: "paragraph", text: event.description.trim() });
  if (event.url) blocks.push({ type: "button", text: "View event", url: event.url, caption: null, size: 100, align: "center", bgColor: "#d4af37" });
  return blocks;
}

function defaultGreetingBlock() {
  return { type: "text", style: "paragraph", text: "Hi {{first_name}},", align: "left" };
}

// Pre-flight block validation matching the backend rules.
function validateBlocksClient(blocks) {
  if (!Array.isArray(blocks)) return null;
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    if (!b || typeof b !== "object") continue;
    const pos = `Block ${i + 1}`;
    if (b.type === "image" && b.url && !HTTP_RE.test(b.url)) return `${pos} (image): URL must start with http:// or https://`;
    if (b.type === "button") {
      if (!b.text || !b.text.trim()) return `${pos} (button): text is required`;
      if (!b.url || !HTTP_RE.test(b.url)) return `${pos} (button): URL must start with http:// or https://`;
    }
    if (b.type === "socials" && Array.isArray(b.links)) {
      for (const l of b.links) if (l && l.url && !HTTP_RE.test(l.url)) return `${pos} (socials): links must start with http:// or https://`;
    }
  }
  return null;
}

export function MailPage() {
  return (
    <AdminShell title="Mejl" fill>
      <MailComposer />
    </AdminShell>
  );
}

function MailComposer() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const initialEventId = searchParams.get("event") || "";
  const [activeTab, setActiveTab] = useState(initialEventId ? "email" : "segment");
  const [hoveredKey, setHoveredKey] = useState(null);
  const [events, setEvents] = useState([]);

  // Segment — the CRM, filtered (components/crm/CrmSegment.jsx).
  const [segment, setSegment] = useState({
    eventIds: initialEventId ? [initialEventId] : [],
    came: false,
    consentOnly: false,
    search: "",
  });
  const [total, setTotal] = useState(null);
  // Mail to a list is paid: one send per recipient from the bought balance.
  const credits = useEmailCredits();
  const [paywall, setPaywall] = useState(false);
  useEffect(() => {
    if (credits.paid) showToast(`Purchase complete: ${credits.paid.balance.toLocaleString("sv-SE")} sends in your balance.`, "success");
  }, [credits.paid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Composer — two templates kept apart so switching doesn't lose either.
  const [selectedTemplate, setSelectedTemplate] = useState(initialEventId ? "event" : "");
  const [selectedEventId, setSelectedEventId] = useState(initialEventId);
  const [eventSubject, setEventSubject] = useState("");
  const [eventPreviewText, setEventPreviewText] = useState("");
  const [eventBlocks, setEventBlocks] = useState([]);
  const [eventFromName, setEventFromName] = useState("Felix, PullUp");
  const [followupEventId, setFollowupEventId] = useState("");
  const [followupSubject, setFollowupSubject] = useState("");
  const [followupPreviewText, setFollowupPreviewText] = useState("");
  const [followupBlocks, setFollowupBlocks] = useState([defaultGreetingBlock()]);
  const [followupFromName, setFollowupFromName] = useState("Felix, PullUp");
  // An organiser's mail always goes out in the name of the brand it's sent
  // in (the server sets it); only the owner names the sender himself.
  const owner = isOwnerEmail(useSession()?.user?.email);
  const [brandName, setBrandName] = useState("");
  useEffect(() => {
    authenticatedFetch("/admin/brands")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setBrandName(d.brands.find((b) => b.id === d.current)?.name || ""))
      .catch(() => {});
  }, []);
  const eventSender = owner ? eventFromName : brandName;
  const followupSender = owner ? followupFromName : brandName;

  const [isConfirmSendOpen, setIsConfirmSendOpen] = useState(false);
  const [sendStage, setSendStage] = useState("confirm");
  const [sendingStats, setSendingStats] = useState({ totalRecipients: 0, totalSent: 0, totalFailed: 0 });
  const [sendingErrorMessage, setSendingErrorMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const cancelledRef = useRef(false);
  useEffect(() => {
    cancelledRef.current = false; // StrictMode runs this twice in dev
    return () => { cancelledRef.current = true; };
  }, []);

  useEffect(() => {
    let alive = true;
    authenticatedFetch("/admin/events")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!alive) return;
        // The composer's event shape (the old /events endpoint).
        setEvents(d.events.map((e) => ({
          id: e.id,
          title: e.title,
          slug: e.slug,
          url: e.url,
          startsAt: e.startsAt,
          location: e.location,
          description: e.text,
          imageUrl: e.imageUrl,
          coverImageUrl: e.imageUrl,
          mine: e.mine,
          attending: e.attending,
        })));
      })
      .catch(() => alive && showToast("Failed to load events", "error"));
    return () => { alive = false; };
  }, [showToast]);

  const selectedEvent = useMemo(() => events.find((e) => e.id === selectedEventId) || null, [events, selectedEventId]);
  const followupEvent = useMemo(() => events.find((e) => e.id === followupEventId) || null, [events, followupEventId]);

  // Picking an event for the invitation fills the blocks from it.
  useEffect(() => {
    if (selectedTemplate !== "event" || !selectedEvent) return;
    setEventSubject(`You're invited to ${selectedEvent.title}.`);
    setEventBlocks(buildDefaultEventBlocks(selectedEvent));
  }, [selectedEventId, selectedTemplate, selectedEvent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const audience = { type: "crm", ...segment };
  const audienceKey = JSON.stringify(segment);

  // The server's count for this segment (debounced while typing a search).
  useEffect(() => {
    let alive = true;
    setTotal(null);
    const t = setTimeout(() => {
      authenticatedFetch("/admin/sends/preview", { method: "POST", body: JSON.stringify({ audience }) })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => alive && setTotal(d.count ?? 0))
        .catch(() => alive && setTotal(0));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [audienceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFollowup = selectedTemplate === "followup";
  const active = isFollowup
    ? { eventId: followupEventId, subject: followupSubject, previewText: followupPreviewText, blocks: followupBlocks, fromName: followupSender, event: followupEvent }
    : { eventId: selectedEventId, subject: eventSubject, previewText: eventPreviewText, blocks: eventBlocks, fromName: eventSender, event: selectedEvent };

  function check() {
    if (!selectedTemplate) return "Pick a template first.";
    if (!active.eventId) return isFollowup ? "Pick the event this follow-up is for." : "Choose an event for the email content.";
    if (!active.subject.trim()) return "Subject is required.";
    if (!active.blocks.length) return "Add at least one block.";
    return validateBlocksClient(active.blocks);
  }

  const payload = () => ({
    audience,
    subject: active.subject,
    previewText: active.previewText,
    fromName: active.fromName,
    blocks: active.blocks,
    eventId: active.eventId || null,
  });

  function handleSendClick() {
    if (!total) { showToast("No recipients in this segment.", "error"); setActiveTab("segment"); return; }
    const err = check();
    if (err) { showToast(err, "error"); setActiveTab("email"); return; }
    if (credits.balance != null && total > credits.balance) { setPaywall(true); return; }
    setSendStage("confirm");
    setSendingStats({ totalRecipients: total, totalSent: 0, totalFailed: 0 });
    setSendingErrorMessage("");
    setIsConfirmSendOpen(true);
  }

  async function handleTest() {
    const err = check();
    if (err) { showToast(err, "error"); setActiveTab("email"); return; }
    setTesting(true);
    try {
      const res = await authenticatedFetch("/admin/sends", { method: "POST", body: JSON.stringify({ ...payload(), test: true }) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      showToast(`Test sent to ${out.to}`, "success");
    } catch {
      showToast("Failed to send test", "error");
    } finally {
      setTesting(false);
    }
  }

  // Send, then follow the campaign in the outbox log until every mail is in.
  async function handleConfirmSend() {
    setSendStage("sending");
    try {
      const res = await authenticatedFetch("/admin/sends", { method: "POST", body: JSON.stringify(payload()) });
      const out = await res.json();
      if (res.status === 402) {
        credits.setBalance(out.balance);
        setIsConfirmSendOpen(false);
        setPaywall(true);
        return;
      }
      if (out.balance != null) credits.setBalance(out.balance);
      if (!res.ok) throw new Error(out.detail === "no_recipients" ? "No recipients in this segment." : "Failed to start sending");
      setSendingStats((s) => ({ ...s, totalRecipients: out.queued }));
      for (let attempt = 0; attempt < 150; attempt += 1) {
        if (cancelledRef.current) return;
        await new Promise((r) => setTimeout(r, 2000));
        const sr = await authenticatedFetch("/admin/sends");
        if (!sr.ok) continue;
        const row = (await sr.json()).sends.find((x) => x.tag === out.tag);
        if (!row) continue;
        setSendingStats({ totalRecipients: out.queued, totalSent: row.sent, totalFailed: row.failed });
        if (row.sent + row.failed >= out.queued) {
          setSendStage(row.sent ? "success" : "error");
          if (!row.sent) setSendingErrorMessage("The email provider reported a failure.");
          return;
        }
      }
      setSendStage("error");
      setSendingErrorMessage("Still sending — check back in a minute.");
    } catch (e) {
      if (cancelledRef.current) return;
      setSendStage("error");
      setSendingErrorMessage(e.message || "Unexpected error while sending.");
    }
  }


  return (
    <>
      <style>{`
        .ml-split { height: 100%; display: flex; min-height: 0; background: ${colors.background}; }
        .ml-rail { width: 440px; min-width: 440px; display: flex; flex-direction: column; border-right: 1px solid ${colors.border}; background: ${colors.surface}; min-height: 0; }
        .ml-canvas { flex: 1; min-width: 0; padding: 24px; overflow: auto; display: flex; flex-direction: column; background: ${colors.surfaceMuted}; }
        .ml-input { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid ${colors.border}; background: #fff; color: ${colors.text}; font: inherit; font-size: 14px; box-sizing: border-box; }
        .ml-foot { flex-shrink: 0; display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid ${colors.border}; background: ${colors.surface}; }
        .ml-btn { padding: 10px 16px; border-radius: 999px; border: 1px solid ${colors.borderStrong}; background: #fff; color: ${colors.text}; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
        .ml-btn.is-send { border: none; background: ${colors.accent}; color: #fff; box-shadow: ${colors.accentShadow}; }
        .ml-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
        @media (max-width: 900px) {
          .ml-split { flex-direction: column; overflow: auto; }
          .ml-rail { width: 100%; min-width: 0; border-right: none; border-bottom: 1px solid ${colors.border}; }
          .ml-canvas { padding: 12px; overflow: visible; }
        }
      `}</style>
      <div className="ml-split">
        <aside className="ml-rail">
          <div style={{ position: "sticky", top: 0, zIndex: 10, background: colors.surface, flexShrink: 0, borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ display: "flex", position: "relative" }}>
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{ flex: 1, padding: "14px 0", background: "none", border: "none", cursor: "pointer", fontSize: "10.5px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: activeTab === tab.id ? colors.accent : colors.textSubtle, transition: "color 0.2s ease" }}
                >
                  {tab.label}
                </button>
              ))}
              <div style={{ position: "absolute", bottom: 0, left: `${TABS.findIndex((t) => t.id === activeTab) * 50}%`, width: "50%", height: "2px", background: colors.accent, transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }} />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            {activeTab === "segment" && <CrmSegment segment={segment} setSegment={setSegment} total={total} />}
            {activeTab === "email" && (
              <EmailPanel
                events={events}
                selectedTemplate={selectedTemplate}
                setSelectedTemplate={setSelectedTemplate}
                selectedEventId={selectedEventId}
                setSelectedEventId={setSelectedEventId}
                eventSubject={eventSubject}
                setEventSubject={setEventSubject}
                eventPreviewText={eventPreviewText}
                setEventPreviewText={setEventPreviewText}
                eventBlocks={eventBlocks}
                setEventBlocks={setEventBlocks}
                eventFromName={eventSender}
                setEventFromName={owner ? setEventFromName : undefined}
                selectedEventIdForFollowup={followupEventId}
                setSelectedEventIdForFollowup={setFollowupEventId}
                followupSubject={followupSubject}
                setFollowupSubject={setFollowupSubject}
                followupPreviewText={followupPreviewText}
                setFollowupPreviewText={setFollowupPreviewText}
                followupBlocks={followupBlocks}
                setFollowupBlocks={setFollowupBlocks}
                followupFromName={followupSender}
                setFollowupFromName={owner ? setFollowupFromName : undefined}
                hoveredKey={hoveredKey}
                setHoveredKey={setHoveredKey}
              />
            )}
          </div>

          <div className="ml-foot">
            <div style={{ marginRight: "auto", alignSelf: "center" }}><CreditsLine balance={credits.balance} needed={total} onBuy={() => setPaywall(true)} /></div>
            <button type="button" className="ml-btn" onClick={handleTest} disabled={testing}>{testing ? "Sending…" : "Send test to me"}</button>
            <button type="button" className="ml-btn is-send" onClick={handleSendClick} disabled={!total}>Send to {total ?? "…"} →</button>
          </div>
        </aside>

        <main className="ml-canvas">
          <EmailCanvas
            selectedTemplate={selectedTemplate}
            selectedEvent={selectedEvent}
            eventSubject={eventSubject}
            eventPreviewText={eventPreviewText}
            eventBlocks={eventBlocks}
            followupEvent={followupEvent}
            followupSubject={followupSubject}
            followupPreviewText={followupPreviewText}
            followupBlocks={followupBlocks}
            hoveredKey={hoveredKey}
            currentUserFirstName={owner ? "Felix" : "Anna"}
          />
        </main>
      </div>

      <ConfirmSendDialog
        isOpen={isConfirmSendOpen}
        sendStage={sendStage}
        effectiveRecipientCount={total || 0}
        sendingStats={sendingStats}
        sendingErrorMessage={sendingErrorMessage}
        selectedEvent={active.event}
        currentUserFirstName={owner ? "Felix" : "Anna"}
        templateType={selectedTemplate}
        subjectLine={active.subject}
        previewText={active.previewText}
        blocks={active.blocks}
        onClose={() => setIsConfirmSendOpen(false)}
        onConfirmSend={handleConfirmSend}
      />
      <CreditsPaywall open={paywall} needed={total} balance={credits.balance} packs={credits.packs} onBuy={credits.buy} onClose={() => setPaywall(false)} />
    </>
  );
}
