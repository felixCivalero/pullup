import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { authenticatedFetch } from "../lib/api.js";
import { useToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";
import { getEventUrl } from "../lib/urlUtils.js";
import { CrmTab } from "../components/HomeCrmTab";
import EmailPanel from "../components/crm/EmailPanel";
import EmailCanvas from "../components/crm/EmailCanvas";
import ConfirmSendDialog from "../components/crm/ConfirmSendDialog";
import { useHostActions } from "../lib/useHostActions.js";
import { useSetHostResource } from "../contexts/useHostResource.js";

// Normalize a campaign's stored filterCriteria into the shape CrmTab expects.
// MCP-drafted campaigns use a slightly different shape (singular attendedEventId,
// `tags` instead of `attendedEventTags`); accept either so chat-drafted segments
// re-display correctly when the host opens the draft in the composer.
function normalizeFilterCriteria(fc) {
  if (!fc || typeof fc !== "object") return {};
  const out = {};
  if (Array.isArray(fc.attendedEventIds) && fc.attendedEventIds.length) {
    out.attendedEventIds = fc.attendedEventIds;
  } else if (fc.attendedEventId) {
    out.attendedEventIds = [fc.attendedEventId];
  }
  if (Array.isArray(fc.attendedEventTags) && fc.attendedEventTags.length) {
    out.attendedEventTags = fc.attendedEventTags;
  } else if (Array.isArray(fc.tags) && fc.tags.length) {
    out.attendedEventTags = fc.tags;
  }
  if (fc.hasDinner !== undefined) out.hasDinner = fc.hasDinner;
  if (fc.search) out.search = fc.search;
  return out;
}

// Build a sensible default block list when an event is picked for the
// "Event email template" — host can then edit / reorder / extend.
function buildDefaultEventBlocks(event) {
  if (!event) return [defaultGreetingBlock()];
  const blocks = [defaultGreetingBlock()];
  const hero = event.coverImageUrl || event.imageUrl;
  if (hero) {
    // Default cover to a 16:9 banner crop — event covers are typically
    // portrait and would otherwise dominate the email vertically.
    blocks.push({ type: "image", url: hero, alt: event.title || "", source: "event-gallery", width: 100, align: "center", aspectRatio: "banner" });
  }
  if (event.title) {
    blocks.push({ type: "text", style: "heading", text: event.title });
  }
  const meta = [];
  if (event.startsAt) {
    const d = new Date(event.startsAt);
    if (!isNaN(d.getTime())) {
      meta.push(d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
    }
  }
  if (event.location) meta.push(event.location);
  if (meta.length) blocks.push({ type: "text", style: "paragraph", text: meta.join(" · ") });
  if (event.description) {
    blocks.push({ type: "text", style: "paragraph", text: event.description.trim() });
  }
  if (event.slug) {
    blocks.push({ type: "button", text: "View event", url: getEventUrl(event.slug), caption: null, size: 100, align: "center", bgColor: "#d4af37" });
  }
  return blocks;
}

// Greeting is just a regular paragraph block — host can move/delete/edit
// it like any other block. {{first_name}} resolves to the recipient's
// first name (falls back to "there").
function defaultGreetingBlock() {
  return { type: "text", style: "paragraph", text: "Hi {{first_name}},", align: "left" };
}

const HTTP_RE = /^https?:\/\//i;
const SOCIAL_LABELS = {
  instagram: "Instagram", spotify: "Spotify", tiktok: "TikTok",
  soundcloud: "SoundCloud", youtube: "YouTube", website: "Website",
};

// Pre-flight block validation matching the backend rules. Returns a
// human-readable error string or null. Catches invalid URLs in social
// links, buttons, and images BEFORE the user clicks Send so they don't
// see a 400 from the server.
function validateBlocksClient(blocks) {
  if (!Array.isArray(blocks)) return null;
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    if (!b || typeof b !== "object") continue;
    const pos = `Block ${i + 1}`;
    if (b.type === "image" && b.url && !HTTP_RE.test(b.url)) {
      return `${pos} (image): URL must start with http:// or https://`;
    }
    if (b.type === "button") {
      if (!b.text || !b.text.trim()) return `${pos} (button): text is required`;
      if (!b.url || !HTTP_RE.test(b.url)) return `${pos} (button): URL must start with http:// or https://`;
    }
    if (b.type === "socials" && Array.isArray(b.links)) {
      for (const l of b.links) {
        if (l && l.url && !HTTP_RE.test(l.url)) {
          return `${pos} (socials): ${SOCIAL_LABELS[l.key] || l.key} link must start with http:// or https://`;
        }
      }
    }
  }
  return null;
}

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

  // ?campaignId=<id> drops the host into an existing draft (the URL the MCP
  // coach hands back from draft_campaign, and the address the Save-draft
  // button writes into the URL after the first save).
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCampaignId = searchParams.get("campaignId") || null;
  const [currentDraftId, setCurrentDraftId] = useState(initialCampaignId);
  // Tell the floating coach widget which campaign is loaded (or none).
  useSetHostResource(
    currentDraftId ? { type: "campaign", id: currentDraftId } : null,
  );
  // Status of the loaded campaign (null until hydrated). Anything other than
  // "draft" means the campaign already sent (or is sending) — the composer
  // hydrates for viewing but disables Save / Send.
  const [draftStatus, setDraftStatus] = useState(null);
  // When the loaded campaign is scheduled, the ISO time it'll fire — drives the
  // "Scheduled for …" indicator and the Cancel-schedule button.
  const [scheduledAt, setScheduledAt] = useState(null);
  // Set right before we apply campaign data into composer state so the
  // auto-populate-on-event-pick effect skips a beat (we don't want to
  // overwrite the draft's blocks with a fresh template).
  const hydratingRef = useRef(false);
  // Initial filters CrmTab should display when hydrating from a draft.
  // Stable reference so CrmTab's effect doesn't loop.
  const [hydratedFilters, setHydratedFilters] = useState(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const [activeTab, setActiveTab] = useState("segment");
  // Mirrors the CreateEventPage hover-section pattern: editor row hover →
  // outline the matching part in the canvas. Key is "greeting" or `block-${i}`.
  const [hoveredKey, setHoveredKey] = useState(null);

  // Phone-size guard: composing/sending campaigns from a phone is awkward
  // (long forms, image picker, color picker, real-time preview). Below
  // 768px we hide the Email tab, canvas, and send footer — host can still
  // browse + filter their audience but is told to open on desktop to send.
  const [isPhone, setIsPhone] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(max-width: 767px)").matches
      : false,
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e) => {
      setIsPhone(e.matches);
      if (e.matches) setActiveTab("segment"); // bounce off the Email tab
    };
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Segment selection pushed up by HomeCrmTab whenever filters/total change
  const [segmentSelection, setSegmentSelection] = useState({
    filterCriteria: { eventsAttendedMin: 0 },
    total: 0,
  });

  const [events, setEvents] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  // Composer state — event template (block-based; defaults populated from
  // the event when picked, then host can edit / reorder freely)
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventSubject, setEventSubject] = useState("");
  const [eventPreviewText, setEventPreviewText] = useState("");
  const [eventBlocks, setEventBlocks] = useState([]);
  // Per-template "From" display name. Defaults to host's brand or first name
  // for both templates so out-of-the-box emails feel personal in the inbox.
  const defaultFromName = useMemo(() => {
    const meta = user?.user_metadata || {};
    if (meta.brand) return String(meta.brand).trim();
    if (meta.full_name) return String(meta.full_name).trim();
    return currentUserFirstName || "PullUp";
  }, [user, currentUserFirstName]);
  const [eventFromName, setEventFromName] = useState("");
  const [followupFromName, setFollowupFromName] = useState("");
  // Seed the From-name fields from the resolved default once the user
  // record is hydrated (only if the host hasn't typed anything yet).
  useEffect(() => {
    if (!eventFromName && defaultFromName) setEventFromName(defaultFromName);
    if (!followupFromName && defaultFromName) setFollowupFromName(defaultFromName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultFromName]);

  // Composer state — follow-up template (independent so switching templates
  // doesn't lose either side's edits)
  const [followupEventId, setFollowupEventId] = useState("");
  const [followupSubject, setFollowupSubject] = useState("");
  const [followupPreviewText, setFollowupPreviewText] = useState("");
  const [followupBlocks, setFollowupBlocks] = useState([defaultGreetingBlock()]);

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

  // Auto-populate event-template subject + blocks when an event is selected.
  // Re-runs on event change — switching events regenerates the block defaults
  // (host loses customization but gets fresh, accurate content for the new event).
  // Skipped while hydrating an existing draft so we don't clobber its content.
  useEffect(() => {
    if (hydratingRef.current) {
      hydratingRef.current = false;
      return;
    }
    if (selectedTemplate !== "event" || !selectedEvent) return;
    setEventSubject(`You're invited to ${selectedEvent.title}.`);
    setEventBlocks(buildDefaultEventBlocks(selectedEvent));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, selectedTemplate]);

  // Hydrate composer from ?campaignId=<id> on mount. Runs once. Drops the host
  // onto the Design tab so the email is the first thing they see.
  useEffect(() => {
    if (!initialCampaignId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authenticatedFetch(`/host/crm/campaigns/${initialCampaignId}`);
        if (!res.ok) {
          if (res.status === 404) {
            showToast("Draft not found — starting a fresh compose", "error");
            setCurrentDraftId(null);
            setSearchParams({}, { replace: true });
          }
          return;
        }
        const c = await res.json();
        if (cancelled) return;

        const tt = c.templateType === "followup" ? "followup" : "event";
        const tc = c.templateContent || {};
        const blocks = Array.isArray(tc.blocks) ? tc.blocks : [];

        hydratingRef.current = true;
        setSelectedTemplate(tt);
        setDraftStatus(c.status || "draft");
        setScheduledAt(c.scheduledAt || null);

        if (tt === "followup") {
          if (c.eventId) setFollowupEventId(c.eventId);
          if (c.subject) setFollowupSubject(c.subject);
          if (tc.previewText) setFollowupPreviewText(tc.previewText);
          if (tc.fromName) setFollowupFromName(tc.fromName);
          if (blocks.length) setFollowupBlocks(blocks);
        } else {
          if (c.eventId) setSelectedEventId(c.eventId);
          if (c.subject) setEventSubject(c.subject);
          if (tc.previewText) setEventPreviewText(tc.previewText);
          if (tc.fromName) setEventFromName(tc.fromName);
          if (blocks.length) setEventBlocks(blocks);
        }

        const normalized = normalizeFilterCriteria(c.filterCriteria);
        setHydratedFilters(normalized);
        setSegmentSelection({
          filterCriteria: normalized,
          total: c.totalRecipients || 0,
        });

        setActiveTab("email");
      } catch (err) {
        console.error("[CrmPage] hydrate draft failed:", err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCampaignId]);

  // Chat → UI live sync. When MCP sends or updates the loaded campaign,
  // refetch its status so the composer flips draft → sending → sent in
  // real time. We only refetch status fields; we don't clobber the
  // composer's in-flight edits (subject/blocks/segment).
  useHostActions({
    enabled: !!currentDraftId,
    targetType: "campaign",
    targetId: currentDraftId,
    tools: ["send_campaign", "update_campaign"],
    onInsert: async () => {
      if (!currentDraftId) return;
      try {
        const res = await authenticatedFetch(`/host/crm/campaigns/${currentDraftId}`);
        if (!res.ok) return;
        const c = await res.json();
        setDraftStatus(c.status || "draft");
        if (c.totalRecipients != null) {
          setSegmentSelection((prev) => ({ ...prev, total: c.totalRecipients }));
        }
      } catch (err) {
        console.warn("[CrmPage] live refresh failed:", err?.message);
      }
    },
  });

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

  // Build the campaign payload from the current composer state. Shared by
  // save-draft and send flows so they always agree on the shape that lands
  // in the DB.
  function buildCampaignPayload() {
    const isFollowup = selectedTemplate === "followup";
    const filterCriteria = segmentSelection.filterCriteria || {};
    if (isFollowup) {
      return {
        templateType: "followup",
        eventId: followupEventId || null,
        subject: followupSubject,
        templateContent: {
          subject: followupSubject,
          previewText: followupPreviewText,
          fromName: followupFromName || null,
          blocks: followupBlocks,
        },
        filterCriteria,
      };
    }
    return {
      templateType: "event",
      eventId: selectedEventId || null,
      subject: eventSubject,
      templateContent: {
        subject: eventSubject,
        previewText: eventPreviewText,
        fromName: eventFromName || null,
        blocks: eventBlocks,
      },
      filterCriteria,
    };
  }

  // Save-draft is the same write path the MCP coach uses — creates or updates
  // a campaign row at status='draft' without firing /send. URL gets the
  // campaignId so the draft is addressable and re-loadable.
  async function handleSaveDraft() {
    if (!selectedTemplate) {
      showToast("Pick a template first.", "error");
      setActiveTab("email");
      return;
    }
    const isFollowup = selectedTemplate === "followup";
    const requiredEventId = isFollowup ? followupEventId : selectedEventId;
    const subject = isFollowup ? followupSubject : eventSubject;
    if (!requiredEventId) {
      showToast("Pick an event for this campaign first.", "error");
      setActiveTab("email");
      return;
    }
    if (!subject.trim()) {
      showToast("Subject is required.", "error");
      setActiveTab("email");
      return;
    }

    setIsSavingDraft(true);
    try {
      const payload = buildCampaignPayload();
      const url = currentDraftId
        ? `/host/crm/campaigns/${currentDraftId}`
        : "/host/crm/campaigns";
      const method = currentDraftId ? "PATCH" : "POST";
      const res = await authenticatedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to save draft");
      }
      const data = await res.json();
      const newId = data.campaignId || currentDraftId;
      if (newId && newId !== currentDraftId) {
        setCurrentDraftId(newId);
        setSearchParams({ campaignId: newId }, { replace: true });
      }
      if (data.totalRecipients != null) {
        setSegmentSelection((prev) => ({ ...prev, total: data.totalRecipients }));
      }
      setDraftStatus(data.status || "draft");
      showToast("Draft saved", "success");
    } catch (err) {
      console.error("[CrmPage] save draft failed:", err);
      showToast(err.message || "Failed to save draft", "error");
    } finally {
      setIsSavingDraft(false);
    }
  }

  function handleSendClick() {
    if (segmentSelection.total === 0) {
      showToast("No recipients in this segment.", "error");
      setActiveTab("segment");
      return;
    }
    if (!selectedTemplate) {
      showToast("Pick a template first.", "error");
      setActiveTab("email");
      return;
    }
    if (selectedTemplate === "event") {
      if (!selectedEventId) {
        showToast("Choose an event for the email content.", "error");
        setActiveTab("email");
        return;
      }
      if (!eventSubject.trim()) {
        showToast("Subject is required.", "error");
        setActiveTab("email");
        return;
      }
      if (eventBlocks.length === 0) {
        showToast("Add at least one block.", "error");
        setActiveTab("email");
        return;
      }
      const blockErr = validateBlocksClient(eventBlocks);
      if (blockErr) {
        showToast(blockErr, "error");
        setActiveTab("email");
        return;
      }
    }
    if (selectedTemplate === "followup") {
      if (!followupEventId) {
        showToast("Pick the event this follow-up is for.", "error");
        setActiveTab("email");
        return;
      }
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
      const blockErr = validateBlocksClient(followupBlocks);
      if (blockErr) {
        showToast(blockErr, "error");
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
    const requiredEventId = isFollowup ? followupEventId : selectedEventId;
    if (!requiredEventId) {
      if (cancelledRef.current) return;
      setSendStage("error");
      setSendingErrorMessage("No event selected.");
      return;
    }

    if (cancelledRef.current) return;
    setSendStage("sending");
    setSendingErrorMessage("");

    try {
      const campaignData = buildCampaignPayload();

      // Hydrated drafts already exist in the DB — PATCH the latest edits then
      // /send the existing campaignId. Fresh composes POST a new row first.
      let campaignId = currentDraftId;
      let totalRecipients;
      if (campaignId) {
        const patchRes = await authenticatedFetch(`/host/crm/campaigns/${campaignId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(campaignData),
        });
        if (!patchRes.ok) {
          const errJson = await patchRes.json().catch(() => ({}));
          throw new Error(errJson.message || "Failed to save edits before send");
        }
        const data = await patchRes.json();
        totalRecipients = data.totalRecipients;
      } else {
        const createRes = await authenticatedFetch("/host/crm/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(campaignData),
        });
        if (!createRes.ok) {
          const errJson = await createRes.json().catch(() => ({}));
          throw new Error(errJson.message || "Failed to create campaign");
        }
        const created = await createRes.json();
        campaignId = created.campaignId;
        totalRecipients = created.totalRecipients;
        // Reflect the new campaignId in the URL so the host can come back to
        // its status page after the send completes.
        setCurrentDraftId(campaignId);
        setSearchParams({ campaignId }, { replace: true });
      }
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

  // Schedule = same write path as send (save the latest edits, creating the
  // row if needed), but POST /schedule instead of /send. The backend poll
  // worker fires it later and re-resolves recipients then. Closes the dialog
  // and reflects the scheduled state inline regardless of outcome.
  async function handleConfirmSchedule(scheduledAtISO) {
    try {
      const campaignData = buildCampaignPayload();
      let campaignId = currentDraftId;
      if (campaignId) {
        const patchRes = await authenticatedFetch(`/host/crm/campaigns/${campaignId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(campaignData),
        });
        if (!patchRes.ok) {
          const e = await patchRes.json().catch(() => ({}));
          throw new Error(e.message || "Failed to save edits before scheduling");
        }
      } else {
        const createRes = await authenticatedFetch("/host/crm/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(campaignData),
        });
        if (!createRes.ok) {
          const e = await createRes.json().catch(() => ({}));
          throw new Error(e.message || "Failed to create campaign");
        }
        const created = await createRes.json();
        campaignId = created.campaignId;
        setCurrentDraftId(campaignId);
        setSearchParams({ campaignId }, { replace: true });
      }

      const schedRes = await authenticatedFetch(
        `/host/crm/campaigns/${campaignId}/schedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledAt: scheduledAtISO }),
        },
      );
      if (!schedRes.ok) {
        const e = await schedRes.json().catch(() => ({}));
        throw new Error(e.message || "Failed to schedule");
      }
      const data = await schedRes.json();
      setDraftStatus("scheduled");
      setScheduledAt(data.scheduledAt || scheduledAtISO);
      const local = new Date(data.scheduledAt || scheduledAtISO).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      showToast(`Scheduled for ${local}`, "success");
    } catch (err) {
      console.error("[CrmPage] schedule failed:", err);
      showToast(err.message || "Failed to schedule", "error");
    } finally {
      setIsConfirmSendOpen(false);
    }
  }

  async function handleCancelSchedule() {
    if (!currentDraftId) return;
    try {
      const res = await authenticatedFetch(
        `/host/crm/campaigns/${currentDraftId}/unschedule`,
        { method: "POST" },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || "Failed to cancel schedule");
      }
      setDraftStatus("draft");
      setScheduledAt(null);
      showToast("Schedule cancelled — back to draft", "success");
    } catch (err) {
      console.error("[CrmPage] cancel schedule failed:", err);
      showToast(err.message || "Failed to cancel schedule", "error");
    }
  }

  const sendDisabled = segmentSelection.total === 0;

  return (
    <div
      className="page-with-header"
      style={{
        height: "100vh",
        boxSizing: "border-box",
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
              {(isPhone ? TABS.filter((t) => t.id === "segment") : TABS).map((tab) => {
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
                  left: isPhone
                    ? "0%"
                    : `${TABS.findIndex((t) => t.id === activeTab) * (100 / TABS.length)}%`,
                  width: isPhone ? "100%" : `${100 / TABS.length}%`,
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
              <CrmTab onSegmentChange={setSegmentSelection} initialFilters={hydratedFilters} />
            </div>
            {isPhone && (
              <div style={phoneNoteStyle}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                  Composing emails is desktop-only
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.5, opacity: 0.75 }}>
                  Building campaigns needs more screen space — open PullUp on
                  your laptop to design and send. From your phone you can still
                  browse and filter your audience.
                </div>
              </div>
            )}
            {!isPhone && activeTab === "email" && (
              <EmailPanel
                events={events}
                selectedTemplate={selectedTemplate}
                setSelectedTemplate={setSelectedTemplate}
                // Event template props
                selectedEventId={selectedEventId}
                setSelectedEventId={setSelectedEventId}
                eventSubject={eventSubject}
                setEventSubject={setEventSubject}
                eventPreviewText={eventPreviewText}
                setEventPreviewText={setEventPreviewText}
                eventBlocks={eventBlocks}
                setEventBlocks={setEventBlocks}
                eventFromName={eventFromName}
                setEventFromName={setEventFromName}
                // Follow-up template props
                selectedEventIdForFollowup={followupEventId}
                setSelectedEventIdForFollowup={setFollowupEventId}
                followupSubject={followupSubject}
                setFollowupSubject={setFollowupSubject}
                followupPreviewText={followupPreviewText}
                setFollowupPreviewText={setFollowupPreviewText}
                followupBlocks={followupBlocks}
                setFollowupBlocks={setFollowupBlocks}
                followupFromName={followupFromName}
                setFollowupFromName={setFollowupFromName}
                hoveredKey={hoveredKey}
                setHoveredKey={setHoveredKey}
              />
            )}
          </div>

          {/* Sticky footer at bottom of rail — hidden on phone since
              composing/sending isn't available there */}
          <div
            style={{
              flexShrink: 0,
              display: isPhone ? "none" : "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              padding: "12px 16px",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(12,10,18,0.95)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", display: "flex", flexDirection: "column", gap: 2 }}>
              <span>
                {segmentSelection.total.toLocaleString()}{" "}
                {segmentSelection.total === 1 ? "recipient" : "recipients"}
              </span>
              {currentDraftId && draftStatus === "draft" && (
                <span style={{ fontSize: "10.5px", opacity: 0.7, letterSpacing: 0.3 }}>
                  Editing saved draft
                </span>
              )}
              {currentDraftId && draftStatus === "scheduled" && (
                <span style={{ fontSize: "10.5px", color: "#fde68a", letterSpacing: 0.3 }}>
                  Scheduled for{" "}
                  {scheduledAt
                    ? new Date(scheduledAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
                    : "later"}
                </span>
              )}
              {currentDraftId && draftStatus && draftStatus !== "draft" && draftStatus !== "scheduled" && (
                <span style={{ fontSize: "10.5px", color: "#fde68a", letterSpacing: 0.3 }}>
                  Already {draftStatus} — read only
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {draftStatus === "scheduled" ? (
                <button
                  type="button"
                  onClick={handleCancelSchedule}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "10px",
                    border: "1px solid rgba(253,230,138,0.3)",
                    background: "rgba(253,230,138,0.08)",
                    color: "#fde68a",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  title="Cancel the scheduled send and return to draft"
                >
                  Cancel schedule
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={isSavingDraft || (draftStatus && draftStatus !== "draft")}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.04)",
                      color: isSavingDraft ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.88)",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: isSavingDraft || (draftStatus && draftStatus !== "draft") ? "not-allowed" : "pointer",
                      transition: "all 0.2s ease",
                    }}
                    title={currentDraftId ? "Update saved draft" : "Save as draft (no send)"}
                  >
                    {isSavingDraft ? "Saving…" : currentDraftId ? "Update draft" : "Save draft"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSendClick}
                    disabled={sendDisabled || (draftStatus && draftStatus !== "draft")}
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
                    Send or schedule →
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>

        {/* RIGHT PANE: always-visible email canvas — hidden on phone */}
        <main
          className="crm-canvas"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "24px",
            overflow: "auto",
            display: isPhone ? "none" : "flex",
            flexDirection: "column",
          }}
        >
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
        selectedEvent={selectedTemplate === "followup" ? followupEvent : selectedEvent}
        currentUserFirstName={currentUserFirstName}
        templateType={selectedTemplate}
        subjectLine={selectedTemplate === "followup" ? followupSubject : eventSubject}
        previewText={selectedTemplate === "followup" ? followupPreviewText : eventPreviewText}
        blocks={selectedTemplate === "followup" ? followupBlocks : eventBlocks}
        onClose={() => setIsConfirmSendOpen(false)}
        onConfirmSend={handleConfirmSend}
        onSchedule={handleConfirmSchedule}
      />
    </div>
  );
}

const phoneNoteStyle = {
  padding: "14px 16px",
  marginBottom: 16,
  borderRadius: 12,
  background: "rgba(96,165,250,0.06)",
  border: "1px solid rgba(96,165,250,0.18)",
  color: "rgba(255,255,255,0.85)",
};
