// PostPublishPage — the moment right after a host hits Publish. Instead of
// dropping them straight into the Room, we offer the one thing they almost
// always want next: tell their community the event is live. One screen, one
// obvious action.
//
//   you're live  →  who gets it  →  your words  →  live email preview  →  Send
//
// It reuses the messages module verbatim so it feels familiar: the SAME
// audience filter (useAudienceFilter) the dock + Room use, the SAME honest
// dual-rail split (WhatsApp where reachable, email floor), and the SAME
// /host/room/message/bulk send. The event card auto-attaches (passing eventId
// makes the backend embed it), so the email is [your words] + [the event].
//
// After sending we show an honest receipt — how many went out, on which rail,
// who had no email yet — so it's unmistakable that the messages went through.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, ArrowRight, Copy, ExternalLink, Search, SlidersHorizontal } from "lucide-react";
import { colors } from "../theme/colors.js";
import { PullupEyes } from "../components/PullupEyes.jsx";
import { authenticatedFetch } from "../lib/api.js";
import { useToast } from "../components/Toast";
import { useMessagesStore } from "../contexts/useMessagesStore.js";
import { useAudienceFilter, PEOPLE_LENSES } from "../lib/useAudienceFilter.js";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const FRONTEND_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Mirror the backend's event-card whenLabel EXACTLY (roomMessaging.getEventForEmail)
// so the preview matches the email a recipient actually gets.
function whenLabelFor(startsAt) {
  if (!startsAt) return "";
  try {
    return new Date(startsAt).toLocaleString("en-US", {
      weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

// WhatsApp-reachable → WhatsApp (native text); everyone else → email; anyone
// with neither is surfaced, never silently dropped. Same rule as BulkPanel.
const onWhatsApp = (p) => (p.reachable || []).includes("whatsapp");
const onEmail = (p) => !onWhatsApp(p) && (p.reachable || []).includes("email");

export default function PostPublishPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { people, roomEvents, ensureLoaded } = useMessagesStore();

  const [event, setEvent] = useState(null);
  const [eventLoaded, setEventLoaded] = useState(false);

  // Load the room contacts (once) + this event's card fields.
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await authenticatedFetch(`/host/events/${id}`);
        const d = r.ok ? await r.json() : null;
        if (alive) setEvent(d);
      } catch { /* the page still works without the card */ }
      finally { if (alive) setEventLoaded(true); }
    })();
    return () => { alive = false; };
  }, [id]);

  const roomPath = `/events/${id}/room`;
  const goRoom = () => navigate(roomPath);

  // Everyone in the host's world (the system PullUp contact is not an audience).
  const realPeople = useMemo(() => (people || []).filter((p) => !p.isSystem), [people]);
  const af = useAudienceFilter(realPeople, roomEvents || []);
  const recipients = af.list;

  // Compose — a light, factual opener the host obviously owns and edits, plus
  // a subject for whoever lands over email. The event card carries the details.
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [showWho, setShowWho] = useState(false);
  const taRef = useRef(null);
  useEffect(() => {
    if (event && !subject) setSubject(`New event: ${event.title || "my event"}`);
    if (event && !message) setMessage("I just posted a new event — come through 👇");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 72), 220)}px`;
  }, [message]);

  const waCount = recipients.filter(onWhatsApp).length;
  const emCount = recipients.filter(onEmail).length;
  const noneCount = recipients.length - waCount - emCount;

  // phase: compose → sending → done
  const [phase, setPhase] = useState("compose");
  const [result, setResult] = useState(null);

  async function send() {
    if (!recipients.length || phase === "sending") return;
    setPhase("sending");
    try {
      const res = await authenticatedFetch("/host/room/message/bulk", {
        method: "POST",
        body: JSON.stringify({
          personIds: recipients.map((p) => p.id),
          channel: "whatsapp", // hint only — the server splits by reachability
          text: message.trim(),
          subject: subject.trim() || undefined,
          eventId: id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setPhase("compose");
        showToast("Couldn't send — try again", "error");
        return;
      }
      setResult(data);
      setPhase("done");
    } catch {
      setPhase("compose");
      showToast("Couldn't send — check your connection and try again", "error");
    }
  }

  const loading = people === null || !eventLoaded;

  // ── Result screen ───────────────────────────────────────────────────────
  if (phase === "done" && result) {
    return <Receipt result={result} event={event} roomPath={roomPath} navigate={navigate} />;
  }

  return (
    <div style={{ minHeight: "100dvh", background: colors.background, fontFamily: SF, color: colors.text }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "28px 18px 64px" }}>
        {/* Header — you're live, with a quiet skip so it's never a trap. */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: colors.live, background: colors.successRgba, padding: "4px 10px", borderRadius: 999 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors.live, display: "inline-block" }} /> LIVE
            </span>
          </div>
          <button onClick={goRoom} style={linkBtn}>Skip for now →</button>
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15, margin: "10px 0 6px" }}>
          You’re live 🎉
        </h1>
        <p style={{ fontSize: 15, color: colors.textMuted, margin: "0 0 22px", lineHeight: 1.5 }}>
          Tell your community about{" "}
          <span style={{ color: colors.text, fontWeight: 600 }}>{event?.title || "your event"}</span>. One message,
          straight to their WhatsApp or inbox.
        </p>

        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: colors.textSubtle, fontSize: 14 }}>Loading your people…</div>
        ) : realPeople.length === 0 ? (
          <EmptyAudience event={event} roomPath={roomPath} navigate={navigate} showToast={showToast} />
        ) : (
          <>
            {/* WHO — defaults to everyone; "Choose who" reveals the same segment
                lenses the messages module uses. */}
            <Section>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: colors.textSubtle, letterSpacing: 0.4, textTransform: "uppercase" }}>Sending to</div>
                  <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>
                    {plural(recipients.length, "person", "people")}
                    {af.segment !== "all" && (
                      <span style={{ fontSize: 13, fontWeight: 600, color: colors.textMuted, marginLeft: 8 }}>
                        · {Object.fromEntries(PEOPLE_LENSES)[af.segment]}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => setShowWho((s) => !s)} style={{ ...pillBtn, borderColor: showWho ? colors.accentBorder : colors.border, color: showWho ? colors.accent : colors.textMuted }}>
                  <SlidersHorizontal size={13} /> Choose who
                </button>
              </div>

              {showWho && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
                    {PEOPLE_LENSES.map(([key, label]) => {
                      const active = af.segment === key;
                      return (
                        <button key={key} onClick={() => af.setSegment(key)} style={{ ...chip, ...(active ? chipActive : null) }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "8px 11px" }}>
                    <Search size={15} style={{ color: colors.textSubtle }} />
                    <input
                      value={af.q}
                      onChange={(e) => af.setQ(e.target.value)}
                      placeholder="Search by name, email, phone…"
                      style={{ flex: 1, border: "none", outline: "none", fontSize: 13.5, fontFamily: SF, color: colors.text, background: "transparent" }}
                    />
                  </div>
                </div>
              )}

              {/* Honest split — where this actually lands. */}
              <div style={{ marginTop: 14, fontSize: 12.5, color: colors.textMuted, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "9px 12px", lineHeight: 1.5 }}>
                {waCount ? <><strong style={{ color: colors.text }}>{waCount}</strong> on WhatsApp</> : null}
                {waCount && (emCount || noneCount) ? " · " : ""}
                {emCount ? <><strong style={{ color: colors.text }}>{emCount}</strong> on email</> : null}
                {(waCount || emCount) && noneCount ? " · " : ""}
                {noneCount ? <><strong style={{ color: colors.text }}>{noneCount}</strong> can’t be reached yet</> : null}
                {!waCount && !emCount && !noneCount ? "No one matches — widen your selection." : "."}
              </div>
            </Section>

            {/* YOUR WORDS */}
            <Section>
              <div style={{ fontSize: 12, fontWeight: 700, color: colors.textSubtle, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>Your message</div>
              <textarea
                ref={taRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write a line to your community…"
                style={{ width: "100%", boxSizing: "border-box", resize: "none", border: `1px solid ${colors.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 15, fontFamily: SF, color: colors.text, outline: "none", lineHeight: 1.5, minHeight: 72 }}
              />
              {emCount > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11.5, color: colors.textSubtle, marginBottom: 5 }}>Email subject (for the {emCount} on email)</div>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={`New event: ${event?.title || ""}`}
                    style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${colors.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontWeight: 600, fontFamily: SF, color: colors.text, outline: "none" }}
                  />
                </div>
              )}
            </Section>

            {/* LIVE PREVIEW — a faithful mirror of the email that goes out. */}
            <Section>
              <div style={{ fontSize: 12, fontWeight: 700, color: colors.textSubtle, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>Here’s what they’ll get</div>
              <EmailPreview message={message} event={event} />
            </Section>

            {/* SEND */}
            <button
              onClick={send}
              disabled={!recipients.length || phase === "sending"}
              style={{
                width: "100%", marginTop: 8, padding: "15px 20px", borderRadius: 14, border: "none",
                background: recipients.length && phase !== "sending" ? colors.accent : colors.surfaceMuted,
                color: recipients.length && phase !== "sending" ? "#fff" : colors.textFaded,
                fontSize: 16, fontWeight: 800, fontFamily: SF,
                cursor: recipients.length && phase !== "sending" ? "pointer" : "default",
                boxShadow: recipients.length && phase !== "sending" ? colors.accentShadow : "none",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
              }}
            >
              {phase === "sending"
                ? `Sending to ${recipients.length}…`
                : <>Send to {plural(recipients.length, "person", "people")} <ArrowRight size={18} /></>}
            </button>
            <button onClick={goRoom} style={{ ...linkBtn, display: "block", width: "100%", textAlign: "center", marginTop: 14, padding: 4 }}>
              I’ll do this later
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── The receipt: unmistakable proof it went through ────────────────────────
function Receipt({ result, event, roomPath, navigate }) {
  const { sent = 0, noEmail = 0, failed = 0, byChannel = {} } = result;
  const wa = byChannel.whatsapp || 0;
  const em = byChannel.email || 0;
  const ok = sent > 0;
  const slug = event?.slug;

  return (
    <div style={{ minHeight: "100dvh", background: colors.background, fontFamily: SF, color: colors.text, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 18px" }}>
      <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        <div style={{ width: 68, height: 68, borderRadius: "50%", margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center", background: ok ? colors.successRgba : colors.warningRgba }}>
          {ok
            ? <Check size={34} strokeWidth={3} style={{ color: colors.success }} />
            : <span style={{ fontSize: 30 }}>🤔</span>}
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 8px" }}>
          {ok ? "Sent! 🎉" : "That didn’t go through"}
        </h1>

        {ok ? (
          <>
            <p style={{ fontSize: 16, color: colors.textMuted, margin: "0 0 18px", lineHeight: 1.5 }}>
              Your event went out to <strong style={{ color: colors.text }}>{plural(sent, "person", "people")}</strong>.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 8 }}>
              {wa > 0 && <span style={{ ...tag, color: colors.whatsapp, background: colors.whatsappSoft, borderColor: colors.whatsappBorder }}>{wa} on WhatsApp</span>}
              {em > 0 && <span style={{ ...tag, color: colors.secondary, background: colors.secondarySoft, borderColor: colors.secondaryBorder }}>{em} on email</span>}
            </div>
            {(noEmail > 0 || failed > 0) && (
              <p style={{ fontSize: 13, color: colors.textSubtle, margin: "6px 0 0", lineHeight: 1.5 }}>
                {noEmail > 0 && <>{plural(noEmail, "person doesn’t", "people don’t")} have an email yet — they’re saved in your Room. </>}
                {failed > 0 && <>{plural(failed, "message", "messages")} couldn’t be delivered — you can retry from your Room.</>}
              </p>
            )}
            <p style={{ fontSize: 13, color: colors.textSubtle, margin: "16px 0 0", lineHeight: 1.5 }}>
              You’ll see every message — and who’s replied — in your Room.
            </p>
          </>
        ) : (
          <p style={{ fontSize: 15, color: colors.textMuted, margin: "0 0 20px", lineHeight: 1.5 }}>
            No messages were sent. Nothing was lost — you can send it again from your Room whenever you’re ready.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 26 }}>
          <button onClick={() => navigate(roomPath)} style={{ padding: "14px 20px", borderRadius: 14, border: "none", background: colors.accent, color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: SF, cursor: "pointer", boxShadow: colors.accentShadow, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            Go to your Room <ArrowRight size={17} />
          </button>
          {slug && (
            <a href={`/e/${slug}`} target="_blank" rel="noopener noreferrer" style={{ padding: "12px 20px", borderRadius: 14, border: `1px solid ${colors.border}`, background: colors.background, color: colors.textMuted, fontSize: 14, fontWeight: 600, fontFamily: SF, cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              View event page <ExternalLink size={15} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── No contacts yet: a warm nudge to share, never a dead send button ───────
function EmptyAudience({ event, roomPath, navigate, showToast }) {
  const slug = event?.slug;
  const url = slug ? `${FRONTEND_ORIGIN}/e/${slug}` : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); showToast("Link copied", "success"); }
    catch { showToast("Couldn’t copy — long-press the link to copy it", "error"); }
  };
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 16, padding: "24px 20px", textAlign: "center", background: colors.surface }}>
      <div style={{ width: 46, height: 46, borderRadius: "50%", margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", background: colors.accentSoft, border: `1px solid ${colors.accentBorder}` }}>
        <PullupEyes variant="small" style={{ width: 24, height: 19, display: "block" }} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>No one to message yet</div>
      <p style={{ fontSize: 14, color: colors.textMuted, margin: "0 0 18px", lineHeight: 1.5 }}>
        Your community grows as people RSVP. Share your event link to get the first ones in — then you can message everyone from your Room.
      </p>
      {url && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", background: colors.background, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "9px 9px 9px 13px", marginBottom: 12 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: colors.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>{url}</span>
          <button onClick={copy} style={{ ...pillBtn, borderColor: colors.accentBorder, color: colors.accent, flexShrink: 0 }}><Copy size={13} /> Copy</button>
        </div>
      )}
      <button onClick={() => navigate(roomPath)} style={{ width: "100%", padding: "13px 20px", borderRadius: 12, border: "none", background: colors.accent, color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: SF, cursor: "pointer" }}>
        Go to your Room
      </button>
    </div>
  );
}

// ── Faithful email mirror (roomMessaging: textToHtml + eventCardHtml) ───────
function EmailPreview({ message, event }) {
  const meta = [whenLabelFor(event?.startsAt), event?.location].filter(Boolean).join(" · ");
  const cover = event?.coverImageUrl || event?.imageUrl || null;
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 14, overflow: "hidden", background: "#fff" }}>
      <div style={{ padding: "18px 18px 16px" }}>
        {/* The host's words — line breaks preserved, exactly like the email. */}
        <div style={{ fontSize: 15, lineHeight: 1.55, color: "#1a1a1a", whiteSpace: "pre-wrap", wordBreak: "break-word", minHeight: message.trim() ? undefined : 22 }}>
          {message.trim() || <span style={{ color: "#bbb" }}>Your message shows here…</span>}
        </div>

        {/* The inline event card — same layout the recipient sees. */}
        {event && (
          <div style={{ marginTop: 16, border: "1px solid #eee", borderRadius: 12, background: "#fafafa", display: "flex", alignItems: "center", gap: 12, padding: 12 }}>
            {cover && <img src={cover} alt="" width={56} height={56} style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title || "Event"}</div>
              {meta && <div style={{ fontSize: 13, color: "#666", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</div>}
              <div style={{ fontSize: 13, fontWeight: 600, color: "#ec178f", marginTop: 6 }}>View event →</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── shared bits ────────────────────────────────────────────────────────────
function Section({ children }) {
  return <div style={{ border: `1px solid ${colors.border}`, borderRadius: 16, padding: "18px 18px", marginBottom: 14, background: colors.background }}>{children}</div>;
}
const linkBtn = { border: "none", background: "transparent", color: colors.textSubtle, fontSize: 13, fontWeight: 600, fontFamily: SF, cursor: "pointer", padding: 0 };
const pillBtn = { display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${colors.border}`, background: colors.background, borderRadius: 999, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, fontFamily: SF, cursor: "pointer" };
const chip = { border: `1px solid ${colors.border}`, background: colors.background, borderRadius: 999, padding: "7px 13px", fontSize: 13, fontWeight: 600, fontFamily: SF, color: colors.textMuted, cursor: "pointer" };
const chipActive = { borderColor: colors.accentBorder, background: colors.accentSoft, color: colors.accent };
const tag = { display: "inline-flex", alignItems: "center", fontSize: 12.5, fontWeight: 700, padding: "5px 12px", borderRadius: 999, border: "1px solid" };
