// AdminEmailPage — platform-wide broadcast email composer.
//
// Layout-cloned from CrmPage: left rail with Segment / Design tabs, right
// pane with live email canvas, sticky footer with send button. Audience
// is every `people` row minus host accounts and unsubscribers — admin
// can broadcast to the entire pullup contact list with the same UX a
// host uses to email their own guests.

import { useEffect, useMemo, useRef, useState } from "react";
import { authenticatedFetch } from "../lib/api.js";
import { useToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";
import BlockEditorList from "../components/crm/BlockEditorList";
import EmailCanvas from "../components/crm/EmailCanvas";
import ConfirmSendDialog from "../components/crm/ConfirmSendDialog";
import { Users, Filter, Check, Search, X } from "lucide-react";
import { colors } from "../theme/colors.js";

const TABS = [
  { id: "segment", label: "Segment" },
  { id: "email", label: "Design" },
];

const HTTP_RE = /^https?:\/\//i;

function defaultGreetingBlock() {
  return {
    type: "text",
    style: "paragraph",
    text: "Hi {{first_name}},",
    align: "left",
  };
}

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
      if (!b.text || !b.text.trim())
        return `${pos} (button): text is required`;
      if (!b.url || !HTTP_RE.test(b.url))
        return `${pos} (button): URL must start with http:// or https://`;
    }
  }
  return null;
}

function deriveFirstName(user) {
  if (!user) return "";
  const meta = user.user_metadata || {};
  if (meta.first_name) return String(meta.first_name).trim();
  const full = meta.full_name || meta.name || "";
  if (full) return String(full).trim().split(/\s+/)[0] || "";
  if (user.email) return String(user.email).split("@")[0];
  return "";
}

export function AdminEmailPage() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const currentUserFirstName = useMemo(() => deriveFirstName(user), [user]);

  const [activeTab, setActiveTab] = useState("segment");
  const [hoveredKey, setHoveredKey] = useState(null);

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
      if (e.matches) setActiveTab("segment");
    };
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Audience filters — direct fields + behavioral signals from rsvps/events.
  const [filters, setFilters] = useState({
    excludeHosts: true,
    marketingConsent: "any",
    minEventsAttended: 0,
    hasPaid: false,
    attendedEventTags: [],
    // Specific-event filter — admin picks individual events from a
    // typeahead. Each entry is {id, title, startsAt} so the UI can
    // render chips without re-fetching event metadata.
    attendedEvents: [],
    attendedEventLogic: "or",
  });
  const [audience, setAudience] = useState({ total: 0, sample: [] });
  const [audienceLoading, setAudienceLoading] = useState(true);
  const [tagOptions, setTagOptions] = useState([]);

  const filterQuery = useMemo(() => {
    const q = new URLSearchParams();
    if (!filters.excludeHosts) q.set("excludeHosts", "false");
    if (filters.marketingConsent && filters.marketingConsent !== "any")
      q.set("marketingConsent", filters.marketingConsent);
    if (Number(filters.minEventsAttended) > 0)
      q.set("minEventsAttended", String(filters.minEventsAttended));
    if (filters.hasPaid) q.set("hasPaid", "true");
    if (Array.isArray(filters.attendedEventTags) && filters.attendedEventTags.length > 0) {
      q.set("attendedEventTags", filters.attendedEventTags.join(","));
    }
    if (Array.isArray(filters.attendedEvents) && filters.attendedEvents.length > 0) {
      q.set(
        "attendedEventIds",
        filters.attendedEvents.map((e) => e.id).join(","),
      );
      if (filters.attendedEventLogic === "and") q.set("attendedEventLogic", "and");
    }
    return q.toString();
  }, [filters]);

  // Fetch the tag universe once on mount so the chip cloud has options
  // even before any filter is active.
  useEffect(() => {
    let cancelled = false;
    authenticatedFetch("/admin/email/tag-options")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setTagOptions(d.tags || []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setAudienceLoading(true);
    authenticatedFetch(`/admin/email/audience?${filterQuery}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setAudience(d);
      })
      .finally(() => {
        if (!cancelled) setAudienceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterQuery]);

  // Composer — single broadcast template (no event coupling).
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  // Display name shown in the recipient's inbox before the subject ("PullUp"
  // by default — admin can override per-broadcast for higher open rates).
  const [fromName, setFromName] = useState("PullUp");
  const [blocks, setBlocks] = useState([defaultGreetingBlock()]);

  const [isConfirmSendOpen, setIsConfirmSendOpen] = useState(false);
  const [sendStage, setSendStage] = useState("confirm");
  const [sendingStats, setSendingStats] = useState({
    totalRecipients: 0,
    totalSent: 0,
    totalFailed: 0,
  });
  const [sendingErrorMessage, setSendingErrorMessage] = useState("");

  const cancelledRef = useRef(false);
  useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  function handleSendClick() {
    if (audience.total === 0) {
      showToast("No recipients in this segment.", "error");
      setActiveTab("segment");
      return;
    }
    if (!subject.trim()) {
      showToast("Subject is required.", "error");
      setActiveTab("email");
      return;
    }
    if (blocks.length === 0) {
      showToast("Add at least one block.", "error");
      setActiveTab("email");
      return;
    }
    const blockErr = validateBlocksClient(blocks);
    if (blockErr) {
      showToast(blockErr, "error");
      setActiveTab("email");
      return;
    }
    setSendStage("confirm");
    setSendingStats({
      totalRecipients: audience.total,
      totalSent: 0,
      totalFailed: 0,
    });
    setSendingErrorMessage("");
    setIsConfirmSendOpen(true);
  }

  async function handleConfirmSend() {
    if (cancelledRef.current) return;
    setSendStage("sending");
    setSendingErrorMessage("");

    try {
      // Backend reads attendedEventIds (string[]) — strip the UI-only
      // event objects in attendedEvents before persisting the criteria.
      const { attendedEvents = [], ...rest } = filters;
      const persistedCriteria = {
        ...rest,
        attendedEventIds: attendedEvents.map((e) => e.id),
      };

      const createRes = await authenticatedFetch("/admin/email/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          templateContent: { subject, previewText, fromName, blocks },
          filterCriteria: persistedCriteria,
        }),
      });
      if (!createRes.ok) {
        const j = await createRes.json().catch(() => ({}));
        throw new Error(j.error || "Failed to create broadcast");
      }
      const { campaignId, totalRecipients } = await createRes.json();
      if (cancelledRef.current) return;
      setSendingStats((p) => ({
        ...p,
        totalRecipients: totalRecipients ?? p.totalRecipients,
      }));

      const sendRes = await authenticatedFetch(
        `/admin/email/campaigns/${campaignId}/send`,
        { method: "POST" },
      );
      if (cancelledRef.current) return;
      if (!sendRes.ok) {
        const j = await sendRes.json().catch(() => ({}));
        throw new Error(j.error || "Failed to start send");
      }

      let attempts = 0;
      const max = 60;
      while (true) {
        if (cancelledRef.current) return;
        if (attempts >= max) {
          setSendStage("error");
          setSendingErrorMessage(
            "Timed out while waiting for the broadcast to finish.",
          );
          return;
        }
        attempts += 1;
        await new Promise((r) => setTimeout(r, 2000));

        const statusRes = await authenticatedFetch(
          `/admin/email/campaigns/${campaignId}`,
        );
        if (!statusRes.ok) continue;
        const statusJson = await statusRes.json();
        if (cancelledRef.current) return;

        setSendingStats((p) => ({
          ...p,
          totalRecipients: statusJson.totalRecipients ?? p.totalRecipients,
          totalSent: statusJson.totalSent ?? p.totalSent,
          totalFailed: statusJson.totalFailed ?? p.totalFailed,
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
      console.error("Error sending admin broadcast:", error);
      if (cancelledRef.current) return;
      setSendStage("error");
      setSendingErrorMessage(
        error.message || "Unexpected error while sending broadcast.",
      );
    }
  }

  const sendDisabled = audience.total === 0;

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
        style={{ flex: 1, display: "flex", minHeight: 0 }}
      >
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
          {/* Tab strip */}
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
              {(isPhone ? TABS.filter((t) => t.id === "segment") : TABS).map(
                (tab) => {
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
                },
              )}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: isPhone
                    ? "0%"
                    : `${TABS.findIndex((t) => t.id === activeTab) * (100 / TABS.length)}%`,
                  width: isPhone ? "100%" : `${100 / TABS.length}%`,
                  height: "2px",
                  background:
                    "linear-gradient(90deg, rgba(192,192,192,0.6), rgba(232,232,232,0.4))",
                  transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            </div>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            {activeTab === "segment" && (
              <AdminAudienceTab
                filters={filters}
                setFilters={setFilters}
                audience={audience}
                loading={audienceLoading}
                tagOptions={tagOptions}
              />
            )}
            {!isPhone && activeTab === "email" && (
              <AdminEmailComposer
                subject={subject}
                setSubject={setSubject}
                previewText={previewText}
                setPreviewText={setPreviewText}
                fromName={fromName}
                setFromName={setFromName}
                blocks={blocks}
                setBlocks={setBlocks}
                hoveredKey={hoveredKey}
                setHoveredKey={setHoveredKey}
              />
            )}
          </div>

          {/* Sticky footer */}
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
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>
              {audience.total.toLocaleString()}{" "}
              {audience.total === 1 ? "recipient" : "recipients"}
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
              Send broadcast →
            </button>
          </div>
        </aside>

        <main
          className="crm-canvas"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "24px",
            overflow: "hidden",
            display: isPhone ? "none" : "flex",
            flexDirection: "column",
          }}
        >
          <EmailCanvas
            selectedTemplate="followup"
            followupSubject={subject}
            followupPreviewText={previewText}
            followupBlocks={blocks}
            followupEvent={null}
            hoveredKey={hoveredKey}
            currentUserFirstName={currentUserFirstName}
          />
        </main>
      </div>

      <ConfirmSendDialog
        isOpen={isConfirmSendOpen}
        sendStage={sendStage}
        effectiveRecipientCount={audience.total}
        sendingStats={sendingStats}
        sendingErrorMessage={sendingErrorMessage}
        selectedEvent={null}
        currentUserFirstName={currentUserFirstName}
        templateType="followup"
        subjectLine={subject}
        previewText={previewText}
        blocks={blocks}
        onClose={() => setIsConfirmSendOpen(false)}
        onConfirmSend={handleConfirmSend}
      />
    </div>
  );
}

// ─── Audience tab ──────────────────────────────────────────────────────
function AdminAudienceTab({ filters, setFilters, audience, loading, tagOptions }) {
  function toggleTag(tag) {
    setFilters((f) => {
      const next = Array.isArray(f.attendedEventTags) ? [...f.attendedEventTags] : [];
      const idx = next.indexOf(tag);
      if (idx >= 0) next.splice(idx, 1);
      else next.push(tag);
      return { ...f, attendedEventTags: next };
    });
  }

  function addEvent(evt) {
    setFilters((f) => {
      const current = Array.isArray(f.attendedEvents) ? f.attendedEvents : [];
      if (current.some((e) => e.id === evt.id)) return f;
      return { ...f, attendedEvents: [...current, evt] };
    });
  }

  function removeEvent(eventId) {
    setFilters((f) => ({
      ...f,
      attendedEvents: (f.attendedEvents || []).filter((e) => e.id !== eventId),
    }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          padding: 16,
          background: "rgba(96,165,250,0.05)",
          border: "1px solid rgba(96,165,250,0.2)",
          borderRadius: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "#60a5fa",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Users size={12} /> Audience
        </div>
        <div
          style={{ fontSize: 32, fontWeight: 700, color: "#fff", lineHeight: 1 }}
        >
          {loading ? "…" : audience.total.toLocaleString()}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.55)",
            marginTop: 4,
          }}
        >
          unique emails across the entire pullup platform
        </div>
      </div>

      <div
        style={{
          padding: 16,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Filter size={12} /> Filters
        </div>

        <ToggleRow
          label="Exclude host accounts"
          description="Skip everyone who has signed up. Recommended — your hosts are customers, not a marketing list."
          value={filters.excludeHosts}
          onToggle={() =>
            setFilters((f) => ({ ...f, excludeHosts: !f.excludeHosts }))
          }
        />

        <div>
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.7)",
              fontWeight: 500,
              marginBottom: 6,
            }}
          >
            Marketing consent
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { key: "any", label: "Any" },
              { key: "optedIn", label: "Opted in only" },
            ].map((opt) => {
              const active = filters.marketingConsent === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() =>
                    setFilters((f) => ({ ...f, marketingConsent: opt.key }))
                  }
                  style={{
                    padding: "5px 14px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    cursor: "pointer",
                    border: active
                      ? "1px solid rgba(74,222,128,0.4)"
                      : "1px solid rgba(255,255,255,0.08)",
                    background: active
                      ? "rgba(74,222,128,0.12)"
                      : "transparent",
                    color: active ? "#4ade80" : "rgba(255,255,255,0.4)",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            Unsubscribed and do-not-contact people are always excluded.
          </div>
        </div>
      </div>

      {/* Behavior filters — narrow by what guests have actually done */}
      <div
        style={{
          padding: 16,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Behavior
        </div>

        <div>
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.7)",
              fontWeight: 500,
              marginBottom: 6,
            }}
          >
            Min events attended
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { key: 0, label: "Any" },
              { key: 1, label: "1+" },
              { key: 3, label: "3+" },
              { key: 5, label: "5+" },
              { key: 10, label: "10+" },
            ].map((opt) => {
              const active = (filters.minEventsAttended || 0) === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() =>
                    setFilters((f) => ({ ...f, minEventsAttended: opt.key }))
                  }
                  style={pillStyle(active, "#60a5fa")}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6, lineHeight: 1.5 }}>
            Counts every RSVP across the platform — the more, the more engaged.
          </div>
        </div>

        <ToggleRow
          label="Has paid for an event"
          description="Anyone with at least one Stripe-confirmed payment. Useful for targeting high-intent audiences."
          value={filters.hasPaid}
          onToggle={() => setFilters((f) => ({ ...f, hasPaid: !f.hasPaid }))}
        />
      </div>

      {/* Event-tag interest — segment by what kind of events guests engage with */}
      {tagOptions && tagOptions.length > 0 && (
        <div
          style={{
            padding: 16,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.5)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 6,
            }}
          >
            Interested in
          </div>
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.45)",
              marginBottom: 10,
              lineHeight: 1.5,
            }}
          >
            Pick event tags. Anyone who's RSVP'd to at least one event with
            any of these tags will be included.
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {tagOptions.slice(0, 30).map(({ tag, count }) => {
              const active = (filters.attendedEventTags || []).includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  style={pillStyle(active, "#fbbf24")}
                >
                  {tag} <span style={{ opacity: 0.5 }}>{count}</span>
                </button>
              );
            })}
            {(filters.attendedEventTags || []).length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setFilters((f) => ({ ...f, attendedEventTags: [] }))
                }
                style={pillStyle(false, "rgba(239,68,68,0.6)")}
              >
                clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Specific-event typeahead — narrow to people who attended one or
          more particular events. Dropdown stays hidden until the admin
          starts typing, so the empty state isn't a giant event list. */}
      <AttendedEventsFilter
        selected={filters.attendedEvents || []}
        logic={filters.attendedEventLogic || "or"}
        onAdd={addEvent}
        onRemove={removeEvent}
        onToggleLogic={() =>
          setFilters((f) => ({
            ...f,
            attendedEventLogic: f.attendedEventLogic === "and" ? "or" : "and",
          }))
        }
      />

      {/* Sample of who's in */}
      {audience.sample?.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 8,
            }}
          >
            Sample · first 30
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {audience.sample.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.02)",
                  fontSize: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      color: "#fff",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {p.name || p.email.split("@")[0]}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.35)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {p.email}
                  </div>
                </div>
                {p.marketingConsent && (
                  <span
                    style={{
                      fontSize: 9,
                      color: "#4ade80",
                      padding: "1px 6px",
                      borderRadius: 999,
                      background: "rgba(74,222,128,0.1)",
                      border: "1px solid rgba(74,222,128,0.25)",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}
                  >
                    Opted in
                  </span>
                )}
                {p.paymentCount > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "rgba(251,191,36,0.85)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.paymentCount} pay
                    {p.paymentCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function pillStyle(active, accent = "#a3e635") {
  return {
    padding: "5px 12px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "lowercase",
    letterSpacing: "0.02em",
    cursor: "pointer",
    border: active
      ? `1px solid ${accent}66`
      : "1px solid rgba(255,255,255,0.08)",
    background: active
      ? `${accent}1f`
      : "transparent",
    color: active ? accent : "rgba(255,255,255,0.45)",
    whiteSpace: "nowrap",
    transition: "all 0.12s ease",
  };
}

// Typeahead picker for filtering by specific events the audience has
// attended. Hits /admin/email/event-options?source=pullup&q=… on every
// keystroke (debounced). Results are hidden until the user types — that
// "blank state" is intentional, the admin asked for it.
function AttendedEventsFilter({ selected, logic, onAdd, onRemove, onToggleLogic }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Empty query gets handled by handleQueryChange — the dropdown is
  // already closed and there's nothing to fetch. Effect only runs when
  // there's a non-empty query to debounce.
  const trimmedQuery = query.trim();
  useEffect(() => {
    if (!trimmedQuery) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      authenticatedFetch(
        `/admin/email/event-options?source=pullup&q=${encodeURIComponent(trimmedQuery)}`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled) return;
          setResults((d?.events || []).slice(0, 10));
          setSearching(false);
        })
        .catch(() => {
          if (!cancelled) setSearching(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trimmedQuery]);

  function handleQueryChange(value) {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      setOpen(false);
      setSearching(false);
      return;
    }
    setOpen(true);
    setSearching(true);
  }

  // Close dropdown on outside click.
  useEffect(() => {
    function handleClick(e) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedIds = new Set(selected.map((e) => e.id));
  const visibleResults = results.filter((r) => !selectedIds.has(r.id));

  return (
    <div
      style={{
        padding: 16,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Attended specific events
        </div>
        {selected.length >= 2 && (
          <button
            type="button"
            onClick={onToggleLogic}
            title={
              logic === "and"
                ? "Currently: people who attended ALL selected events"
                : "Currently: people who attended ANY of the selected events"
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: "pointer",
              border:
                logic === "and"
                  ? "1px solid rgba(244,114,182,0.4)"
                  : "1px solid rgba(96,165,250,0.4)",
              background:
                logic === "and"
                  ? "rgba(244,114,182,0.12)"
                  : "rgba(96,165,250,0.12)",
              color: logic === "and" ? "#f472b6" : "#60a5fa",
            }}
          >
            {logic === "and" ? "all of" : "any of"}
          </button>
        )}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.45)",
          marginBottom: 10,
          lineHeight: 1.5,
        }}
      >
        Start typing an event name. Pick one or more; we'll only include
        people who RSVP'd to{" "}
        {selected.length >= 2
          ? logic === "and"
            ? "every"
            : "any"
          : "the selected"}{" "}
        event{selected.length >= 2 ? "s" : ""}.
      </div>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 5,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          {selected.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onRemove(e.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                border: "1px solid rgba(96,165,250,0.4)",
                background: "rgba(96,165,250,0.12)",
                color: "#60a5fa",
                whiteSpace: "nowrap",
                maxWidth: "100%",
              }}
              title={e.title}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 220,
                }}
              >
                {e.title}
              </span>
              <X size={11} />
            </button>
          ))}
        </div>
      )}

      {/* Search input + dropdown */}
      <div ref={containerRef} style={{ position: "relative" }}>
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Search
            size={13}
            style={{
              position: "absolute",
              left: 11,
              color: "rgba(255,255,255,0.35)",
              pointerEvents: "none",
            }}
          />
          <input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => {
              if (query.trim()) setOpen(true);
            }}
            placeholder="Search events…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px 10px 32px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(12, 10, 20, 0.7)",
              color: "#fff",
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>

        {open && query.trim() && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              maxHeight: 280,
              overflowY: "auto",
              background: "rgba(18, 15, 28, 0.98)",
              backdropFilter: "blur(14px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              zIndex: 20,
            }}
          >
            {searching && visibleResults.length === 0 && (
              <div
                style={{
                  padding: "12px 14px",
                  fontSize: 12,
                  color: "rgba(255,255,255,0.45)",
                }}
              >
                Searching…
              </div>
            )}
            {!searching && visibleResults.length === 0 && (
              <div
                style={{
                  padding: "12px 14px",
                  fontSize: 12,
                  color: "rgba(255,255,255,0.45)",
                }}
              >
                No matching events.
              </div>
            )}
            {visibleResults.map((evt) => {
              const dateLabel = evt.startsAt
                ? new Date(evt.startsAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : null;
              return (
                <button
                  key={evt.id}
                  type="button"
                  onClick={() => {
                    onAdd({
                      id: evt.id,
                      title: evt.title,
                      startsAt: evt.startsAt,
                    });
                    setQuery("");
                    setOpen(false);
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 2,
                    width: "100%",
                    padding: "9px 12px",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.12s ease",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "rgba(255,255,255,0.04)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: "#fff",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "100%",
                    }}
                  >
                    {evt.title}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.4)",
                      display: "flex",
                      gap: 8,
                    }}
                  >
                    {dateLabel && <span>{dateLabel}</span>}
                    {evt.location && (
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 200,
                        }}
                      >
                        · {evt.location}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({ label, description, value, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: 0,
        background: "none",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          border: value
            ? "1px solid rgba(74,222,128,0.5)"
            : "1px solid rgba(255,255,255,0.18)",
          background: value ? "rgba(74,222,128,0.18)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {value && <Check size={12} color="#4ade80" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#fff", fontWeight: 500 }}>
          {label}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.45)",
            lineHeight: 1.5,
            marginTop: 2,
          }}
        >
          {description}
        </div>
      </div>
    </button>
  );
}

// ─── Composer ──────────────────────────────────────────────────────────
function AdminEmailComposer({
  subject,
  setSubject,
  previewText,
  setPreviewText,
  fromName,
  setFromName,
  blocks,
  setBlocks,
  hoveredKey,
  setHoveredKey,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          padding: 14,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 10,
          }}
        >
          Email
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="Sender name (in inbox)">
            <input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="PullUp"
              maxLength={80}
              style={inputStyle}
            />
          </Field>
          <Field label="Subject">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              style={inputStyle}
            />
          </Field>
          <Field label="Preview text">
            <input
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="The first line of preview text guests see in their inbox"
              style={inputStyle}
            />
          </Field>
        </div>
      </div>

      <div
        style={{
          padding: 14,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 10,
          }}
        >
          Content
        </div>
        <BlockEditorList
          blocks={blocks}
          onChange={setBlocks}
          hoveredKey={hoveredKey}
          setHoveredKey={setHoveredKey}
        />
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.5)",
          marginBottom: 5,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(12, 10, 20, 0.7)",
  color: "#fff",
  fontSize: 13,
  outline: "none",
};
