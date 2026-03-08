import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { useToast } from "../components/Toast";
import { uploadEventImage, validateImageFile } from "../lib/imageUtils.js";

export function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [recipientCount, setRecipientCount] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [sendError, setSendError] = useState("");

  const [subscribers, setSubscribers] = useState([]);
  const [excludedIds, setExcludedIds] = useState(new Set());
  const [recipientSource, setRecipientSource] = useState("");

  const [templateEvent, setTemplateEvent] = useState(null);
  const [templateEventLoading, setTemplateEventLoading] = useState(false);
  const heroFileInputRef = useRef(null);

  // Inline-editable template fields (mirroring CRM email popup)
  const [headlineText, setHeadlineText] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [introQuote, setIntroQuote] = useState("");
  const [introBody, setIntroBody] = useState("");
  const [introGreeting, setIntroGreeting] = useState("");
  const [introNote, setIntroNote] = useState("");
  const [signoffText, setSignoffText] = useState("");
  const [ctaLabel, setCtaLabel] = useState("TO EVENT");
  const [ctaUrl, setCtaUrl] = useState("");
  const [editingField, setEditingField] = useState(null);

  // Weekly Happenings state
  const [weeklyEvents, setWeeklyEvents] = useState([]);
  const [weeklyEventsLoading, setWeeklyEventsLoading] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [weeklyHeadline, setWeeklyHeadline] = useState("This Week in Stockholm");
  const [weeklyIntroBody, setWeeklyIntroBody] = useState("");

  // Fixed template: we’re using the event-style Resend template
  // backed by Supabase event data, same as CRM.
  const templateType = "event";
  const TEMPLATE_EVENT_ID = "5e7abfb7-70a5-4bd3-b820-42dd04d1e0c7";

  useEffect(() => {
    if (!loading && !user) {
      navigate("/");
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await authenticatedFetch("/host/profile");
        if (!res.ok) {
          throw new Error("Failed to load profile");
        }
        const data = await res.json();
        setProfile(data);

        if (!data?.isAdmin) {
          navigate("/events");
        }
      } catch (error) {
        console.error("Failed to load admin profile:", error);
        setProfileError("You don't have access to the admin dashboard.");
      } finally {
        setProfileLoading(false);
      }
    }

    if (!loading && user) {
      loadProfile();
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    async function loadTemplateEvent() {
      if (templateEvent || templateEventLoading || !user || !selectedTemplate) {
        return;
      }
      setTemplateEventLoading(true);
      try {
        const res = await authenticatedFetch(
          "/admin/newsletter/event-template",
        );
        if (!res.ok) {
          throw new Error("Failed to load event template");
        }
        const data = await res.json();
        setTemplateEvent(data);

        const defaultBody =
          data.description?.trim() ||
          "Ett gratiserbjudande faller från ovan.\n\n" +
            "Skriv om du vill komma så får du länk till gästlistan!";

        if (!subject.trim()) {
          setSubject(`You're invited to ${data.title}.`);
        }
        if (!body.trim()) {
          setBody(defaultBody);
        }
        if (!headlineText) {
          setHeadlineText(data.title || "");
        }
        if (!heroImageUrl) {
          setHeroImageUrl(data.imageUrl || "");
        }
        if (!introBody) {
          setIntroBody(defaultBody);
        }
        if (!ctaLabel) {
          setCtaLabel("TO EVENT");
        }
      } catch (error) {
        console.error("Failed to load newsletter template event:", error);
      } finally {
        setTemplateEventLoading(false);
      }
    }

    if (selectedTemplate === "event" && user) {
      loadTemplateEvent();
    }
  }, [
    selectedTemplate,
    user,
    templateEvent,
    templateEventLoading,
    subject,
    body,
    headlineText,
    introBody,
    heroImageUrl,
  ]);

  function getWeekBounds(offset = 0) {
    const now = new Date();
    const day = now.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(now);
    mon.setDate(now.getDate() + diffToMon + offset * 7);
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    sun.setHours(23, 59, 59, 999);
    return { from: mon, to: sun };
  }

  function formatWeekLabel(offset) {
    const { from, to } = getWeekBounds(offset);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const fmt = (d) => `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
    return `${fmt(from)} – ${fmt(to)} ${to.getFullYear()}`;
  }

  function formatEventMeta(startsAt, location) {
    if (!startsAt) return location || "";
    const d = new Date(startsAt);
    if (isNaN(d.getTime())) return location || "";
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const dayName = days[d.getDay()];
    const dayNum = d.getDate();
    const monthName = months[d.getMonth()];
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    const datePart = `${dayName} ${dayNum} ${monthName} · ${hours}:${mins}`;
    return location ? `${datePart} · ${location}` : datePart;
  }

  useEffect(() => {
    if (selectedTemplate !== "weekly_happenings" || !user) return;

    async function fetchWeeklyEvents() {
      setWeeklyEventsLoading(true);
      try {
        const { from, to } = getWeekBounds(weekOffset);
        const params = new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
        });
        const res = await authenticatedFetch(
          `/admin/newsletter/weekly-events?${params.toString()}`,
        );
        if (!res.ok) throw new Error("Failed to fetch weekly events");
        const data = await res.json();
        setWeeklyEvents(Array.isArray(data.events) ? data.events : []);
      } catch (err) {
        console.error("Weekly events fetch error:", err);
        setWeeklyEvents([]);
      } finally {
        setWeeklyEventsLoading(false);
      }
    }

    fetchWeeklyEvents();
  }, [selectedTemplate, weekOffset, user]);

  async function handlePreview() {
    setPreviewLoading(true);
    setSendError("");
    setSendResult(null);
    setSubscribers([]);
    setExcludedIds(new Set());
    try {
      const res = await authenticatedFetch("/admin/newsletter/preview", {
        method: "POST",
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
          errJson.message || "Failed to load newsletter preview.",
        );
      }
      const data = await res.json();
      const list = Array.isArray(data.subscribers) ? data.subscribers : [];
      setSubscribers(list);
      setRecipientCount(data.totalRecipients ?? list.length ?? 0);
    } catch (error) {
      console.error("Admin preview error:", error);
      setSendError(error.message || "Failed to load preview.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleHeroImageFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      showToast(validation.error, "error");
      return;
    }

    // Quick local preview
    const reader = new FileReader();
    reader.onerror = () => {
      console.error("[Admin] FileReader error while reading image");
      showToast("Failed to read image file", "error");
    };
    reader.onloadend = async () => {
      if (reader.result) {
        setHeroImageUrl(reader.result);
      }

      try {
        const updated = await uploadEventImage(TEMPLATE_EVENT_ID, file);
        if (updated?.imageUrl) {
          setHeroImageUrl(updated.imageUrl);
          setTemplateEvent((prev) =>
            prev ? { ...prev, imageUrl: updated.imageUrl } : prev,
          );
        }
        showToast("Image uploaded for newsletter template.", "success");
      } catch (error) {
        console.error("[Admin] Failed to upload newsletter hero image:", error);
        showToast(
          error?.message || "Failed to upload image. Please try again.",
          "error",
        );
      } finally {
        // Reset input so selecting the same file again still triggers onChange
        if (heroFileInputRef.current) {
          heroFileInputRef.current.value = "";
        }
      }
    };

    reader.readAsDataURL(file);
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!recipientSource) {
      setSendError("Choose recipients before sending.");
      return;
    }

    if (!selectedTemplate) {
      setSendError("Choose a template before sending.");
      return;
    }

    // For weekly happenings, default subject to weeklyHeadline if empty
    if (selectedTemplate === "weekly_happenings" && !subject.trim()) {
      setSubject(weeklyHeadline);
    }

    const effectiveSubject =
      selectedTemplate === "weekly_happenings" && !subject.trim()
        ? weeklyHeadline
        : subject.trim();

    if (!effectiveSubject) {
      setSendError("Subject is required.");
      return;
    }

    const excludeSubscriberIds = Array.from(excludedIds);
    const effectiveRecipientCount =
      subscribers.length > 0
        ? subscribers.length - excludeSubscriberIds.length
        : (recipientCount ?? 0);

    if (effectiveRecipientCount <= 0) {
      setSendError("There are no recipients selected for this send.");
      return;
    }

    setSending(true);
    setSendError("");
    setSendResult(null);

    try {
      const isWeeklyHappenings = selectedTemplate === "weekly_happenings";

      const sendBody = isWeeklyHappenings
        ? {
            subject: effectiveSubject,
            templateType: "weekly_happenings",
            templateContent: {
              headline: weeklyHeadline,
              body: weeklyIntroBody,
              events: weeklyEvents,
            },
            excludeSubscriberIds,
          }
        : {
            subject: effectiveSubject,
            templateType,
            templateName: "event",
            templateContent: {
              heroImageUrl: heroImageUrl || templateEvent?.imageUrl || "",
              headline: headlineText || templateEvent?.title || "",
              introQuote: introQuote || "",
              introBody: (introBody || body || "").trim(),
              introGreeting: introGreeting || "",
              introNote: introNote || "",
              signoffText: signoffText || "",
              ctaLabel: ctaLabel || "TO EVENT",
              ctaUrl: ctaUrl || undefined,
            },
            excludeSubscriberIds,
          };

      const res = await authenticatedFetch("/admin/newsletter/send", {
        method: "POST",
        body: JSON.stringify(sendBody),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          data.message || "Failed to send newsletter. Please try again.",
        );
      }

      setSendResult({
        totalRecipients: data.totalRecipients ?? effectiveRecipientCount ?? 0,
        enqueued: data.enqueued ?? 0,
        failed: data.failed ?? 0,
      });
      setRecipientCount(
        data.totalRecipients ?? effectiveRecipientCount ?? recipientCount,
      );
    } catch (error) {
      console.error("Admin send error:", error);
      setSendError(error.message || "Failed to send newsletter.");
    } finally {
      setSending(false);
    }
  }

  if (loading || profileLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: colors.background,
        }}
      >
        <div style={{ color: "#fff" }}>Loading admin...</div>
      </div>
    );
  }

  if (profileError) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: colors.background,
          padding: "24px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            maxWidth: "420px",
            width: "100%",
            borderRadius: "20px",
            background:
              "linear-gradient(145deg, rgba(11,10,20,0.96), rgba(17,15,30,0.98))",
            border: "1px solid rgba(255,255,255,0.12)",
            padding: "20px 20px 18px",
            color: "#fff",
          }}
        >
          <h1
            style={{
              fontSize: "18px",
              margin: 0,
              marginBottom: "8px",
            }}
          >
            Admin access required
          </h1>
          <p
            style={{
              fontSize: "13px",
              lineHeight: 1.6,
              opacity: 0.8,
              margin: 0,
            }}
          >
            {profileError}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "80px 16px 40px",
        display: "flex",
        justifyContent: "center",
        boxSizing: "border-box",
        background: colors.background,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "640px",
          borderRadius: "24px",
          background:
            "linear-gradient(145deg, rgba(11,10,20,0.96), rgba(17,15,30,0.98))",
          boxShadow: "0 24px 60px rgba(0,0,0,0.8)",
          border: "1px solid rgba(255,255,255,0.12)",
          padding: "24px 24px 20px",
          color: "#fff",
        }}
      >
        <h1
          style={{
            fontSize: "20px",
            fontWeight: 600,
            margin: 0,
            marginBottom: 4,
          }}
        >
          Newsletter Sendout
        </h1>
        <p
          style={{
            fontSize: "13px",
            lineHeight: 1.6,
            opacity: 0.6,
            margin: 0,
            marginBottom: 20,
          }}
        >
          Send a one-off newsletter to all confirmed subscribers.
        </p>

        <form
          onSubmit={handleSend}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <input
            ref={heroFileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleHeroImageFileChange}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <label
              style={{
                fontSize: "12px",
                opacity: 0.85,
              }}
            >
              Recipients
            </label>
            <select
              value={recipientSource}
              onChange={async (e) => {
                const value = e.target.value;
                setRecipientSource(value);
                if (value === "newsletter") {
                  // Auto-load newsletter subscribers when selected
                  await handlePreview();
                } else {
                  setSubscribers([]);
                  setRecipientCount(null);
                  setExcludedIds(new Set());
                }
              }}
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(12,10,20,0.9)",
                color: "#fff",
                fontSize: "13px",
                outline: "none",
              }}
            >
              <option value="" disabled>
                Choose recipients
              </option>
              <option value="newsletter">Newsletter subscribers</option>
            </select>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 4,
              marginBottom: 4,
              fontSize: "12px",
              opacity: 0.85,
            }}
          >
            <span>
              Recipients:{" "}
              {subscribers.length
                ? `${subscribers.length - excludedIds.size} of ${
                    subscribers.length
                  } selected`
                : recipientCount === null
                  ? "unknown"
                  : `${recipientCount} confirmed subscribers`}
            </span>
          </div>

          {subscribers.length > 0 && (
            <div
              style={{
                marginBottom: 8,
                padding: "8px 10px",
                borderRadius: "10px",
                background: "rgba(10,10,18,0.9)",
                border: "1px solid rgba(255,255,255,0.08)",
                maxHeight: 180,
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  opacity: 0.7,
                }}
              >
                <span>Segment</span>
                <span>
                  {subscribers.length - excludedIds.size} / {subscribers.length}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {subscribers.map((s) => {
                  const isExcluded = excludedIds.has(s.id);
                  return (
                    <div
                      key={s.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 8px",
                        borderRadius: "8px",
                        background: isExcluded
                          ? "rgba(40,10,10,0.9)"
                          : "rgba(18,18,30,0.95)",
                        border: isExcluded
                          ? "1px solid rgba(255,120,120,0.5)"
                          : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          fontSize: "12px",
                        }}
                      >
                        <span
                          style={{
                            opacity: isExcluded ? 0.5 : 0.9,
                            textDecoration: isExcluded
                              ? "line-through"
                              : "none",
                          }}
                        >
                          {s.email}
                        </span>
                        {s.userId && (
                          <span
                            style={{
                              fontSize: "10px",
                              opacity: 0.6,
                            }}
                          >
                            Linked user
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setExcludedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(s.id)) {
                              next.delete(s.id);
                            } else {
                              next.add(s.id);
                            }
                            return next;
                          });
                        }}
                        style={{
                          borderRadius: "999px",
                          border: "none",
                          width: 24,
                          height: 24,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "14px",
                          cursor: "pointer",
                          background: isExcluded
                            ? "linear-gradient(135deg, #402020, #803030)"
                            : "linear-gradient(135deg, #1f1f2f, #3a3a5a)",
                          color: "#fff",
                        }}
                      >
                        {isExcluded ? "↺" : "×"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginTop: 4,
            }}
          >
            <label
              style={{
                fontSize: "12px",
                opacity: 0.85,
              }}
            >
              Template
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedTemplate(value);
              }}
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(12,10,20,0.9)",
                color: "#fff",
                fontSize: "13px",
                outline: "none",
              }}
            >
              <option value="" disabled>
                Choose template
              </option>
              <option value="event">Event</option>
              <option value="weekly_happenings">Weekly Happenings</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label
              style={{
                fontSize: "12px",
                opacity: 0.85,
              }}
            >
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Pullup newsletter"
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(12,10,20,0.9)",
                color: "#fff",
                fontSize: "13px",
                outline: "none",
              }}
            />
          </div>

          {selectedTemplate === "event" && templateEvent && (
            <div
              style={{
                marginTop: 8,
                marginBottom: 12,
                borderRadius: "16px",
                background: "rgba(12,10,18,0.9)",
                border: "1px solid rgba(255,255,255,0.06)",
                overflow: "hidden",
                boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
              }}
            >
              {heroImageUrl && (
                <div
                  onClick={() => heroFileInputRef.current?.click()}
                  style={{
                    width: "100%",
                    aspectRatio: "4/5",
                    overflow: "hidden",
                    position: "relative",
                    cursor: "pointer",
                  }}
                >
                  <img
                    src={heroImageUrl}
                    alt={templateEvent.title}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(to top, rgba(0,0,0,0.55), transparent 40%)",
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "center",
                      paddingBottom: 14,
                    }}
                  >
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: "11px",
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        background: "rgba(0,0,0,0.65)",
                        color: "#f5f5f5",
                        border: "1px solid rgba(255,255,255,0.4)",
                      }}
                    >
                      Click to change image
                    </span>
                  </div>
                </div>
              )}

              <div style={{ padding: "20px 20px 24px" }}>
                {/* Headline - inline editable */}
                {editingField === "headline" ? (
                  <input
                    type="text"
                    value={headlineText || templateEvent.title}
                    onChange={(e) => setHeadlineText(e.target.value)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.target.blur();
                      }
                    }}
                    autoFocus
                    style={{
                      width: "100%",
                      margin: 0,
                      padding: "12px",
                      fontSize: "28px",
                      lineHeight: "1.3",
                      fontWeight: 600,
                      textAlign: "center",
                      marginBottom: "12px",
                      background: "transparent",
                      border: "1px dashed rgba(255,255,255,0.3)",
                      borderRadius: "4px",
                      color: "#fff",
                      outline: "none",
                    }}
                  />
                ) : (
                  <h1
                    onClick={() => setEditingField("headline")}
                    style={{
                      margin: 0,
                      padding: "12px",
                      fontSize: "28px",
                      lineHeight: "1.3",
                      paddingTop: "12px",
                      fontWeight: 600,
                      textAlign: "center",
                      marginBottom: "12px",
                      cursor: "pointer",
                      borderRadius: "8px",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = colors.silverRgbaHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {headlineText || templateEvent.title}
                  </h1>
                )}

                {/* Intro quote - inline editable */}
                {editingField === "quote" ? (
                  <input
                    type="text"
                    value={introQuote}
                    onChange={(e) => setIntroQuote(e.target.value)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.target.blur();
                      }
                    }}
                    placeholder='E.g. "Ett gratiserbjudande faller från ovan"'
                    autoFocus
                    style={{
                      width: "100%",
                      margin: 0,
                      padding: "8px 12px",
                      fontSize: "15px",
                      paddingTop: "8px",
                      paddingBottom: "8px",
                      textAlign: "center",
                      fontStyle: "italic",
                      background: "transparent",
                      border: "1px dashed rgba(255,255,255,0.3)",
                      borderRadius: "4px",
                      color: "#fff",
                      opacity: 0.9,
                      outline: "none",
                    }}
                  />
                ) : (
                  <div
                    onClick={() => setEditingField("quote")}
                    style={{
                      margin: 0,
                      padding: "8px 12px",
                      fontSize: "15px",
                      paddingTop: "8px",
                      paddingBottom: "8px",
                      textAlign: "center",
                      fontStyle: "italic",
                      opacity: introQuote ? 0.9 : 0.4,
                      cursor: "pointer",
                      borderRadius: "8px",
                      minHeight: "32px",
                      transition: "all 0.2s ease",
                      border: introQuote
                        ? "none"
                        : "1px dashed rgba(255,255,255,0.2)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = colors.silverRgbaHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {introQuote ? (
                      <>&quot;{introQuote}&quot;</>
                    ) : (
                      <span style={{ fontSize: "12px" }}>
                        Click to add quote / hook
                      </span>
                    )}
                  </div>
                )}

                {/* Intro body - inline editable */}
                {editingField === "body" ? (
                  <textarea
                    value={introBody}
                    onChange={(e) => {
                      setIntroBody(e.target.value);
                      setBody(e.target.value);
                    }}
                    onBlur={() => setEditingField(null)}
                    autoFocus
                    rows={3}
                    style={{
                      width: "100%",
                      margin: 0,
                      padding: "8px 12px",
                      fontSize: "15px",
                      paddingTop: "8px",
                      paddingBottom: "8px",
                      textAlign: "center",
                      background: "transparent",
                      border: "1px dashed rgba(255,255,255,0.3)",
                      borderRadius: "4px",
                      color: "#fff",
                      opacity: 0.85,
                      outline: "none",
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />
                ) : (
                  <p
                    onClick={() => setEditingField("body")}
                    style={{
                      margin: 0,
                      padding: "8px 12px",
                      fontSize: "15px",
                      paddingTop: "8px",
                      paddingBottom: "8px",
                      textAlign: "center",
                      opacity: 0.85,
                      cursor: "pointer",
                      borderRadius: "8px",
                      minHeight: "24px",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = colors.silverRgbaHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {introBody}
                  </p>
                )}

                <hr
                  style={{
                    width: "100%",
                    border: "none",
                    borderTop: "1px solid rgba(255,255,255,0.1)",
                    paddingBottom: "12px",
                    marginTop: "12px",
                    marginBottom: "12px",
                  }}
                />

                {/* Greeting */}
                {editingField === "greeting" ? (
                  <input
                    type="text"
                    value={introGreeting}
                    onChange={(e) => setIntroGreeting(e.target.value)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.target.blur();
                      }
                    }}
                    placeholder="Click to add greeting"
                    autoFocus
                    style={{
                      width: "100%",
                      margin: 0,
                      padding: "8px 12px",
                      fontSize: "15px",
                      paddingTop: "8px",
                      paddingBottom: "8px",
                      textAlign: "center",
                      background: "transparent",
                      border: "1px dashed rgba(255,255,255,0.3)",
                      borderRadius: "4px",
                      color: "#fff",
                      opacity: 0.85,
                      outline: "none",
                    }}
                  />
                ) : (
                  <p
                    onClick={() => setEditingField("greeting")}
                    style={{
                      margin: 0,
                      padding: "8px 12px",
                      fontSize: "15px",
                      paddingTop: "8px",
                      paddingBottom: "8px",
                      textAlign: "center",
                      opacity: 0.85,
                      cursor: "pointer",
                      borderRadius: "8px",
                      minHeight: "24px",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = colors.silverRgbaHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {introGreeting || (
                      <span style={{ fontSize: "12px" }}>
                        Click to add greeting
                      </span>
                    )}
                  </p>
                )}

                {/* Note */}
                {editingField === "note" ? (
                  <input
                    type="text"
                    value={introNote}
                    onChange={(e) => setIntroNote(e.target.value)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.target.blur();
                      }
                    }}
                    placeholder="Click to add credits / note"
                    autoFocus
                    style={{
                      width: "100%",
                      margin: 0,
                      padding: "8px 12px",
                      fontSize: "13px",
                      paddingTop: "8px",
                      paddingBottom: "8px",
                      textAlign: "center",
                      background: "transparent",
                      border: "1px dashed rgba(255,255,255,0.3)",
                      borderRadius: "4px",
                      color: "#fff",
                      opacity: 0.85,
                      outline: "none",
                    }}
                  />
                ) : (
                  <p
                    onClick={() => setEditingField("note")}
                    style={{
                      margin: 0,
                      padding: "8px 12px",
                      fontSize: "13px",
                      paddingTop: "8px",
                      paddingBottom: "8px",
                      textAlign: "center",
                      opacity: 0.85,
                      cursor: "pointer",
                      borderRadius: "8px",
                      minHeight: "24px",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = colors.silverRgbaHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {introNote || (
                      <span style={{ fontSize: "12px" }}>
                        Click to add credits / note
                      </span>
                    )}
                  </p>
                )}

                <div
                  style={{
                    marginTop: "16px",
                    marginBottom: "4px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      width: "100%",
                      maxWidth: 360,
                    }}
                  >
                    <input
                      type="text"
                      value={ctaLabel}
                      onChange={(e) => setCtaLabel(e.target.value)}
                      placeholder="Button label (e.g. TO EVENT)"
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: "999px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "rgba(8,8,16,0.9)",
                        color: "#fff",
                        fontSize: "11px",
                        outline: "none",
                      }}
                    />
                    <input
                      type="text"
                      value={ctaUrl}
                      onChange={(e) => setCtaUrl(e.target.value)}
                      placeholder="Button URL (optional)"
                      style={{
                        flex: 2,
                        padding: "8px 10px",
                        borderRadius: "999px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "rgba(8,8,16,0.9)",
                        color: "#fff",
                        fontSize: "11px",
                        outline: "none",
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    style={{
                      borderRadius: "999px",
                      padding: "10px 32px",
                      border: "none",
                      fontSize: "13px",
                      fontWeight: 600,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      background:
                        "linear-gradient(135deg, rgba(250,250,250,0.98), rgba(200,200,200,0.98))",
                      color: "#111",
                      cursor: "default",
                      marginTop: 4,
                    }}
                  >
                    {(ctaLabel || "TO EVENT").toUpperCase()}
                  </button>
                </div>

                {/* Signoff */}
                {editingField === "signoff" ? (
                  <input
                    type="text"
                    value={signoffText}
                    onChange={(e) => setSignoffText(e.target.value)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.target.blur();
                      }
                    }}
                    placeholder="Click to add signoff"
                    autoFocus
                    style={{
                      width: "100%",
                      margin: 0,
                      padding: "8px 12px",
                      fontSize: "13px",
                      paddingTop: "8px",
                      paddingBottom: "8px",
                      textAlign: "center",
                      background: "transparent",
                      border: "1px dashed rgba(255,255,255,0.3)",
                      borderRadius: "4px",
                      color: "#fff",
                      opacity: 0.85,
                      outline: "none",
                    }}
                  />
                ) : (
                  <p
                    onClick={() => setEditingField("signoff")}
                    style={{
                      margin: 0,
                      padding: "8px 12px",
                      fontSize: "13px",
                      paddingTop: "8px",
                      paddingBottom: "8px",
                      textAlign: "center",
                      opacity: 0.85,
                      cursor: "pointer",
                      borderRadius: "8px",
                      minHeight: "24px",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = colors.silverRgbaHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {signoffText || (
                      <span style={{ fontSize: "12px" }}>
                        Click to add signoff
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
          )}

          {selectedTemplate === "weekly_happenings" && (
            <div
              style={{
                marginTop: 8,
                marginBottom: 12,
                borderRadius: "16px",
                background: "rgba(12,10,18,0.9)",
                border: "1px solid rgba(255,255,255,0.06)",
                overflow: "hidden",
                boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ padding: "16px 20px 12px" }}>
                {/* Week picker */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 16,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setWeekOffset((o) => o - 1)}
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "8px",
                      color: "#fff",
                      width: 32,
                      height: 32,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      fontSize: "16px",
                      flexShrink: 0,
                    }}
                  >
                    &#8592;
                  </button>
                  <span
                    style={{
                      flex: 1,
                      textAlign: "center",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.85)",
                    }}
                  >
                    {formatWeekLabel(weekOffset)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setWeekOffset((o) => o + 1)}
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "8px",
                      color: "#fff",
                      width: 32,
                      height: 32,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      fontSize: "16px",
                      flexShrink: 0,
                    }}
                  >
                    &#8594;
                  </button>
                </div>

                {/* Editable headline */}
                {editingField === "weekly_headline" ? (
                  <input
                    type="text"
                    value={weeklyHeadline}
                    onChange={(e) => setWeeklyHeadline(e.target.value)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.target.blur();
                    }}
                    autoFocus
                    style={{
                      width: "100%",
                      margin: "0 0 10px 0",
                      padding: "10px 12px",
                      fontSize: "22px",
                      fontWeight: 600,
                      textAlign: "center",
                      background: "transparent",
                      border: "1px dashed rgba(255,255,255,0.3)",
                      borderRadius: "4px",
                      color: "#fff",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                ) : (
                  <h2
                    onClick={() => setEditingField("weekly_headline")}
                    style={{
                      margin: "0 0 10px 0",
                      padding: "10px 12px",
                      fontSize: "22px",
                      fontWeight: 600,
                      textAlign: "center",
                      cursor: "pointer",
                      borderRadius: "8px",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = colors.silverRgbaHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {weeklyHeadline || "This Week in Stockholm"}
                  </h2>
                )}

                {/* Editable intro body */}
                {editingField === "weekly_body" ? (
                  <textarea
                    value={weeklyIntroBody}
                    onChange={(e) => setWeeklyIntroBody(e.target.value)}
                    onBlur={() => setEditingField(null)}
                    autoFocus
                    rows={3}
                    placeholder="Add an intro message..."
                    style={{
                      width: "100%",
                      margin: "0 0 14px 0",
                      padding: "8px 12px",
                      fontSize: "14px",
                      textAlign: "center",
                      background: "transparent",
                      border: "1px dashed rgba(255,255,255,0.3)",
                      borderRadius: "4px",
                      color: "#fff",
                      opacity: 0.85,
                      outline: "none",
                      resize: "vertical",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                    }}
                  />
                ) : (
                  <p
                    onClick={() => setEditingField("weekly_body")}
                    style={{
                      margin: "0 0 14px 0",
                      padding: "8px 12px",
                      fontSize: "14px",
                      textAlign: "center",
                      opacity: weeklyIntroBody ? 0.8 : 0.38,
                      cursor: "pointer",
                      borderRadius: "8px",
                      minHeight: "24px",
                      border: weeklyIntroBody
                        ? "none"
                        : "1px dashed rgba(255,255,255,0.15)",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = colors.silverRgbaHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {weeklyIntroBody || (
                      <span style={{ fontSize: "12px" }}>
                        Click to add intro message
                      </span>
                    )}
                  </p>
                )}

                {/* Events list */}
                {weeklyEventsLoading ? (
                  <div
                    style={{
                      fontSize: "13px",
                      opacity: 0.5,
                      textAlign: "center",
                      padding: "12px 0",
                    }}
                  >
                    Loading events...
                  </div>
                ) : weeklyEvents.length === 0 ? (
                  <div
                    style={{
                      fontSize: "13px",
                      opacity: 0.4,
                      textAlign: "center",
                      padding: "12px 0",
                      fontStyle: "italic",
                    }}
                  >
                    No approved events for this week.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {weeklyEvents.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: "10px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.07)",
                        }}
                      >
                        {ev.image_url && (
                          <img
                            src={ev.image_url}
                            alt={ev.title}
                            style={{
                              width: 60,
                              height: 60,
                              borderRadius: "8px",
                              objectFit: "cover",
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: "13px",
                              color: "#fff",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {ev.title}
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "rgba(255,255,255,0.45)",
                              marginTop: 2,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatEventMeta(ev.starts_at, ev.location)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setWeeklyEvents((prev) =>
                              prev.filter((e) => e.id !== ev.id),
                            )
                          }
                          style={{
                            borderRadius: "999px",
                            border: "none",
                            width: 24,
                            height: 24,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "14px",
                            cursor: "pointer",
                            background: "linear-gradient(135deg, #1f1f2f, #3a3a5a)",
                            color: "rgba(255,255,255,0.7)",
                            flexShrink: 0,
                          }}
                        >
                          &#215;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {sendError && (
            <div
              style={{
                fontSize: "11px",
                color: "rgba(255, 180, 180, 0.96)",
              }}
            >
              {sendError}
            </div>
          )}

          {sendResult && (
            <div
              style={{
                fontSize: "11px",
                color: "rgba(180, 255, 200, 0.96)",
              }}
            >
              Newsletter queued to {sendResult.enqueued} of{" "}
              {sendResult.totalRecipients} subscribers
              {sendResult.failed > 0 ? `, ${sendResult.failed} failed` : ""}.
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            style={{
              marginTop: 8,
              padding: "11px 0",
              borderRadius: "999px",
              border: "none",
              background:
                "linear-gradient(135deg, #f5f5f5 0%, #c7c7c7 60%, #a1a1a1 100%)",
              color: "#121212",
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: sending ? "wait" : "pointer",
            }}
          >
            {sending ? "Sending..." : "Send newsletter"}
          </button>
        </form>
      </div>
    </div>
  );
}
