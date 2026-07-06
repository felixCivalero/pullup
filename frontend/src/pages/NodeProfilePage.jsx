// NodeProfilePage (/r/:id) — a node's profile, the room's public face. The Room
// IS the person: name + bio + three counts ARE the identity, and they're the
// same surface whether you're standing in your OWN room (inside) or looking at
// someone else's (outside). The only axis is inside vs. outside — "being a host"
// is just whether the events slider has anything in it.
//
//   • The three counts are tappable → a popup list each:
//       people in [name]'s world  ·  hosted events  ·  pulled up to
//   • Inside your own room: a "Create event" card + your drafts show in the slider.
//   • From outside: only their published events, labeled "[Name]'s events".
//   • Every event tile obeys one guard: pulled up → enter; never RSVP'd → locked.
//   • People in the world are clickable → into their own room.
//
// Clean PullUp brand (light, pink, the eyes). Preview with ?as=email.

import { transformedImageUrl } from "../lib/imageUtils.js";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { authenticatedFetch, publicFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { PullupEyes } from "../components/PullupEyes.jsx";
import { LoadingScreen } from "../components/LoadingScreen.jsx";
import { AppHeader } from "../components/AppHeader.jsx";
import { OwnerConsole } from "./RoomPage.jsx";
import { Instagram, Music2, Twitter, Youtube, Linkedin, Globe, X } from "lucide-react";
import { RoomProductShowcase } from "../components/room/RoomProductShowcase.jsx";
import { useAuth } from "../contexts/AuthContext";
import { useSubscription } from "../lib/useSubscription.js";
import SubscriptionPaywall from "../components/SubscriptionPaywall.jsx";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

const SOCIAL_ICON = { instagram: Instagram, tiktok: Music2, x: Twitter, youtube: Youtube, linkedin: Linkedin, website: Globe };
const SOCIAL_COLOR = { instagram: "#d6249f", tiktok: "#0a0a0a", x: "#0a0a0a", youtube: "#ff0000", linkedin: "#0a66c2", website: "#6b6b6b" };

function Socials({ socials }) {
  if (!socials || !socials.length) return null;
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
      {socials.map((s) => {
        const Icon = SOCIAL_ICON[s.channel] || Globe;
        return s.url ? (
          <a key={s.channel} href={s.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: colors.text, fontWeight: 600, textDecoration: "none", fontSize: 12.5 }}>
            <Icon size={13} style={{ color: SOCIAL_COLOR[s.channel] || colors.textMuted }} /> {s.handle || s.label}
          </a>
        ) : null;
      })}
    </div>
  );
}

// The public face — shown to everyone (the IG-style header). Content below is gated.
function Masthead({ node, onCount, ownerAction }) {
  const c = node.counts || {};
  // The name can fall back to an email (better than a faceless "Someone") —
  // don't shout an email address in uppercase.
  const nameIsEmail = String(node.name || "").includes("@");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 22, position: "relative" }}>
      <div style={{ width: 80, height: 80, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: "linear-gradient(135deg,#ff45ad,#ec178f)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#fff", border: `1px solid ${colors.borderFaint}` }}>
        {node.avatar ? <img src={transformedImageUrl(node.avatar, { width: 120 })} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(node.name)}
      </div>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: nameIsEmail ? 21 : 27, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px", textTransform: nameIsEmail ? "none" : "uppercase", color: colors.text, overflowWrap: "anywhere" }}>{node.name}</h1>
        <div style={{ display: "flex", gap: 6, fontSize: 13.5, color: colors.textMuted, flexWrap: "wrap" }}>
          <CountChip n={c.people ?? 0} label="people" onClick={onCount ? () => onCount("people") : undefined} />
          <span style={{ color: colors.textFaded }}>·</span>
          <CountChip n={c.hosted ?? 0} label="events" onClick={onCount ? () => onCount("hosted") : undefined} />
          <span style={{ color: colors.textFaded }}>·</span>
          <CountChip n={c.pulledUp ?? 0} label="pull-ups" onClick={onCount ? () => onCount("pulledUp") : undefined} />
        </div>
        <Socials socials={node.socials} />
        {node.bio && <div style={{ fontSize: 13.5, color: colors.textSubtle, marginTop: 8, lineHeight: 1.5 }}>{node.bio}</div>}
      </div>
      {/* Owner-only corner action — the data-ownership button lives at the top
          right of the identity face, deliberately unmissable. */}
      {ownerAction && (
        <div style={{ position: "absolute", top: 0, right: 0 }}>{ownerAction}</div>
      )}
    </div>
  );
}

// What each unfilled profileSetup key means to a human, in "add …" phrasing.
const SETUP_LABELS = { name: "your name", avatar: "a photo", bio: "a short bio", city: "your city", social: "a social link", whatsappSignature: "a WhatsApp signature" };

// Owner-only setup banner — top of the main room, above the identity face.
// The whole card walks to Settings; the × removes it forever (persisted on the
// profile, so it stays gone on every device).
function ProfileSetupBanner({ setup, onGo, onDismiss }) {
  const missing = (setup.missing || []).map((k) => SETUP_LABELS[k]).filter(Boolean);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, padding: "11px 12px 11px 14px", borderRadius: 14, background: colors.accentSoft, border: `1px solid ${colors.accentBorder}` }}>
      <span style={{ width: 30, height: 30, borderRadius: "50%", background: `conic-gradient(${colors.accent} ${setup.percent * 3.6}deg, rgba(236,23,143,0.15) 0deg)`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ width: 21, height: 21, borderRadius: "50%", background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8.5, fontWeight: 800, color: colors.accentText }}>{setup.percent}%</span>
      </span>
      <button onClick={onGo} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.accentText, lineHeight: 1.3 }}>Your profile is {setup.percent}% set up</div>
        {missing.length > 0 && (
          <div style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 1.5, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Add {missing.slice(0, 3).join(", ")} in Settings so guests recognize you.
          </div>
        )}
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss forever"
        title="Don't show this again"
        style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 999, border: "none", background: "transparent", color: colors.accent, cursor: "pointer" }}
      >
        <X size={15} />
      </button>
    </div>
  );
}

function initials(n = "") { return String(n).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"; }
function firstName(n = "") { return String(n).trim().split(/\s+/)[0] || "they"; }
function whenLabel(iso) { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }

export default function NodeProfilePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  // A community join lands here logged OUT (a session needs a verified email —
  // the welcome email's link is that verification). The join passes who they
  // are via navigation state so the gate below greets them instead of walling.
  const justJoined = location.state?.justJoined || null;
  const [linkResent, setLinkResent] = useState(false);
  const [resending, setResending] = useState(false);
  const resendSignInLink = async () => {
    if (!justJoined?.email || resending) return;
    setResending(true);
    try {
      await publicFetch("/auth/request-link", {
        method: "POST",
        body: JSON.stringify({ email: justJoined.email, name: justJoined.name || undefined, next: `/r/${id}`, mode: "login" }),
      });
      setLinkResent(true);
    } catch { /* cooldown or transient — the welcome email still has the link */ }
    setResending(false);
  };
  const { user } = useAuth();
  const asEmail = params.get("as");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [popup, setPopup] = useState(null); // "people" | "hosted" | "pulledUp" | null
  const [setupDismissed, setSetupDismissed] = useState(false); // profile-setup banner, closed this session
  const [shown, setShown] = useState(8); // events grid: 4×2, then "Load more"
  // Create needs the tier — the owner's Create card raises the subscribe sheet
  // instead of walking an unpaid host into the editor. Fails open while loading.
  const { sub, loading: subLoading } = useSubscription();
  const createLocked = !subLoading && !!sub?.enforced && sub?.entitlement?.canHost === false;
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    setShown(8); // reset the events grid limit when the room changes
    let alive = true;
    const p = asEmail
      ? publicFetch(`/r/${id}?email=${encodeURIComponent(asEmail)}`)
      : authenticatedFetch(`/r/${id}`).catch(() => publicFetch(`/r/${id}`));
    Promise.resolve(p)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setData(d))
      .catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, [id, asEmail]);

  const node = data?.node;
  const hosted = useMemo(() => data?.hosted || [], [data]);
  const people = useMemo(() => data?.people || [], [data]);
  const isOwner = !!data?.viewer?.isOwner;
  // The host's events that have GATHERED pull-ups, busiest first — the dropdown
  // behind the "pull-ups" count (owner-only).
  const pullupEvents = useMemo(
    () => (data?.hosted || []).filter((e) => e.pullups > 0).sort((a, b) => (b.pullups || 0) - (a.pullups || 0)),
    [data]
  );

  if (err) return <Shell><div style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>This room isn't available.</div></Shell>;
  if (!node) return <LoadingScreen />;

  // Gated — IG-style. The public header (above) is visible to anyone; the
  // CONTENT (their events) needs a PullUp session. Show who they are + a login
  // wall where the events would be, so a shared /r/ link is a real landing page.
  if (data.gated) {
    return (
      <Shell>
        <Masthead node={node} onCount={() => {}} />
        <SectionLabel>{firstName(node.name)}'s events</SectionLabel>
        {justJoined ? (
          // Fresh member, no session yet: greet the join and hand them the key
          // (the sign-in link just emailed) — not a cold login wall.
          <div style={{ marginTop: 4, padding: "26px 20px", borderRadius: 16, border: "1px solid rgba(22,163,74,0.3)", background: "rgba(22,163,74,0.05)", textAlign: "center", fontFamily: SF }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: colors.text, margin: "0 0 6px" }}>
              You're in{justJoined.name ? `, ${String(justJoined.name).split(" ")[0]}` : ""} — welcome to {firstName(node.name)}'s community
            </p>
            <p style={{ fontSize: 13.5, color: colors.textMuted, lineHeight: 1.55, margin: "0 0 16px" }}>
              Verify your email to step inside — tap the link we sent{justJoined.email ? ` to ${justJoined.email}` : ""} and the room opens as you.
            </p>
            <button
              onClick={resendSignInLink}
              disabled={resending || linkResent}
              style={{ padding: "11px 24px", borderRadius: 999, border: "none", background: linkResent ? colors.surfaceMuted : colors.accent, color: linkResent ? colors.textMuted : "#fff", fontSize: 14, fontWeight: 700, cursor: linkResent ? "default" : "pointer", fontFamily: SF, opacity: resending ? 0.6 : 1 }}
            >
              {linkResent ? "Link sent — check your inbox" : resending ? "Sending…" : "Send the verification link again"}
            </button>
            <p style={{ fontSize: 12, color: colors.textFaded, margin: "12px 0 0" }}>
              <button onClick={() => navigate("/login")} style={{ background: "none", border: "none", padding: 0, color: colors.textFaded, fontSize: 12, textDecoration: "underline", cursor: "pointer", fontFamily: SF }}>
                Log in another way
              </button>
            </p>
          </div>
        ) : (
        <div style={{ marginTop: 4, padding: "26px 20px", borderRadius: 16, border: `1px solid ${colors.border}`, background: colors.surface, textAlign: "center", fontFamily: SF }}>
          <p style={{ fontSize: 14, color: colors.textMuted, lineHeight: 1.55, margin: "0 0 16px" }}>
            Log in to step into {firstName(node.name)}'s room and see their events.
          </p>
          <button
            onClick={() => navigate("/login")}
            style={{ padding: "11px 24px", borderRadius: 999, border: "none", background: colors.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: SF }}
          >
            Log in to PullUp
          </button>
        </div>
        )}
      </Shell>
    );
  }

  const whose = isOwner ? "your" : `${firstName(node.name)}'s`;
  const enter = (e) => {
    // Anyone with a relationship to the event (pulled up / going / waitlisted /
    // owner) goes into the one event Room; "none" + still-open → go RSVP.
    if (["pulledup", "owner", "rsvped", "waitlist"].includes(e.viewer)) return navigate(`/events/${e.id}/room`);
    if (!e.ended) return navigate(`/e/${e.slug}`);   // locked but still open → go RSVP
    // ended + locked (missed): no-op
  };

  // The owner standing in their OWN room (and not previewing as a visitor) gets
  // the operating console below the identity face — the room is ONE surface,
  // inside vs. outside. Everyone else sees the public face + the events slider.
  const showConsole = isOwner && !asEmail && !!data.console;

  // "Never again" is optimistic-local first, then persisted onto the profile
  // (read-merge-write so future ui_prefs tenants survive). The backend stops
  // shipping profileSetup once the flag is set.
  const dismissSetupBanner = async () => {
    setSetupDismissed(true);
    try {
      const r = await authenticatedFetch("/host/profile");
      const prof = r.ok ? await r.json() : null;
      await authenticatedFetch("/host/profile", {
        method: "PUT",
        body: JSON.stringify({ uiPrefs: { ...(prof?.uiPrefs || {}), profileSetupDismissed: true } }),
      });
    } catch { /* best-effort: hidden this session either way */ }
  };
  const showSetupBanner = showConsole && !setupDismissed && data.profileSetup && data.profileSetup.percent < 100;

  // The count popups behind the masthead numbers — shared across both views.
  const popups = (
    <>
      {popup === "people" && (
        <Popup title={`People in ${whose} world`} onClose={() => setPopup(null)}>
          {people.length === 0 && <Empty>No one in the world yet.</Empty>}
          {people.map((p, i) => (
            <PersonRow key={i} name={p.name} clickable={!!p.roomId} onClick={() => p.roomId && (setPopup(null), navigate(`/r/${p.roomId}`))} />
          ))}
        </Popup>
      )}
      {popup === "hosted" && (
        <Popup title="Hosted events" onClose={() => setPopup(null)}>
          {hosted.length === 0 && <Empty>No hosted events yet.</Empty>}
          {hosted.map((e) => <EventRow key={e.id} e={e} onClick={() => (setPopup(null), enter(e))} />)}
        </Popup>
      )}
      {popup === "pulledUp" && (
        <Popup title="Pull-ups gathered" onClose={() => setPopup(null)}>
          {pullupEvents.length === 0 && <Empty>No pull-ups gathered yet.</Empty>}
          {pullupEvents.map((e) => <EventRow key={e.id} e={e} count={e.pullups} onClick={() => (setPopup(null), enter(e))} />)}
        </Popup>
      )}
    </>
  );

  // OWNER, inside their own room: full app chrome + identity face + console.
  if (showConsole) {
    return (
      <>
        <AppHeader />
        <div style={{ minHeight: "100dvh", background: colors.background, color: colors.text, fontFamily: SF }}>
          <div style={{ maxWidth: 740, margin: "0 auto", padding: "calc(78px + env(safe-area-inset-top, 0px)) 20px calc(80px + env(safe-area-inset-bottom, 0px))" }}>
            {showSetupBanner && (
              <ProfileSetupBanner setup={data.profileSetup} onGo={() => navigate("/settings")} onDismiss={dismissSetupBanner} />
            )}
            <Masthead node={node} onCount={setPopup} />
            <OwnerConsole room={data.console} />
          </div>
        </div>
        {popups}
      </>
    );
  }

  // PUBLIC / VISITOR (or owner previewing as a visitor): clean standalone face.
  return (
    <Shell>
      {/* Only the host (owner) can tap the counts to open the people/events/
          pull-ups lists — visitors see the numbers, never the underlying lists. */}
      <Masthead node={node} onCount={isOwner ? setPopup : undefined} />

      {asEmail && <div style={{ fontSize: 11.5, color: colors.textFaded, marginBottom: 16, padding: "6px 10px", borderRadius: 8, border: `1px dashed ${colors.border}`, display: "inline-block" }}>Previewing as {asEmail}</div>}

      {/* Events slider — "your events" inside, "[Name]'s events" outside */}
      <SectionLabel>{isOwner ? "Your events" : `${firstName(node.name)}'s events`}</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        {isOwner && <CreateCard onClick={() => (createLocked ? setShowPaywall(true) : navigate("/create"))} />}
        {hosted.slice(0, shown).map((e) => <EventCard key={e.id} e={e} onClick={() => enter(e)} />)}
        {hosted.length === 0 && !isOwner && <div style={{ fontSize: 13, color: colors.textFaded }}>No events yet.</div>}
      </div>
      {hosted.length > shown && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <button
            onClick={() => setShown((s) => s + 8)}
            style={{ padding: "9px 20px", borderRadius: 999, border: `1px solid ${colors.borderStrong}`, background: colors.surface, color: colors.text, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: SF }}
          >
            Load more <span style={{ color: colors.textFaded, fontWeight: 600 }}>· {hosted.length - shown} more</span>
          </button>
        </div>
      )}

      {/* The main-room storefront — this host's live products. Visitors buy
          inline; the room's RSVP relationship is what got them in the door. */}
      <RoomProductShowcase
        products={data.products || []}
        isHost={false}
        theme="light"
        scope="main"
        heading={isOwner ? "Your products" : `${firstName(node.name)}'s shop`}
        prefill={{ name: user?.user_metadata?.name || user?.user_metadata?.full_name || "", email: user?.email || "" }}
      />

      {/* Branding — the eyes */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 44, color: colors.textFaded }}>
        <PullupEyes variant="small" style={{ width: 26, height: 22, display: "block", opacity: 0.55 }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>PullUp</span>
      </div>

      {popups}

      {/* Subscribe sheet the Create card raises for unpaid hosts. */}
      <SubscriptionPaywall open={showPaywall} onClose={() => setShowPaywall(false)} title="Creating is where hosting starts" closeLabel="Not now" />
    </Shell>
  );
}

function CountChip({ n, label, onClick }) {
  // No handler (a visitor) → a plain, non-interactive number. Only the host gets
  // the tappable chip that opens the underlying list.
  if (!onClick) {
    return (
      <span style={{ fontFamily: SF, fontSize: 13.5, color: colors.textMuted }}>
        <b style={{ color: colors.text }}>{n}</b> {label}
      </span>
    );
  }
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: SF, fontSize: 13.5, color: colors.textMuted }}>
      <b style={{ color: colors.text }}>{n}</b> {label}
    </button>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, color: colors.textSubtle, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontWeight: 700 }}>{children}</div>;
}

function tagFor(e) {
  if (e.draft) return { t: "Draft", c: colors.textSubtle };
  if (e.viewer === "owner") return null;
  if (e.viewer === "pulledup") return { t: "You pulled up", c: colors.accent };
  if (e.viewer === "rsvped") return { t: "You're going", c: colors.secondary };
  if (e.viewer === "waitlist") return { t: "Waitlisted", c: "#d97706" };
  return { t: e.ended ? "Missed" : "Locked", c: colors.textSubtle };
}

function CreateCard({ onClick }) {
  return (
    <button onClick={onClick} style={{ textAlign: "left", border: `1.5px dashed ${colors.borderStrong}`, borderRadius: 16, background: colors.surface, cursor: "pointer", color: colors.text, fontFamily: SF, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 160, gap: 6 }}>
      <span style={{ fontSize: 30, fontWeight: 300, color: colors.accent, lineHeight: 1 }}>+</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: colors.textMuted }}>Create event</span>
    </button>
  );
}

function EventCard({ e, onClick }) {
  const locked = e.viewer === "none";
  const tag = tagFor(e);
  return (
    <button onClick={onClick} style={{ textAlign: "left", border: `1px solid ${colors.border}`, borderRadius: 16, overflow: "hidden", background: colors.surface, cursor: "pointer", padding: 0, color: colors.text, fontFamily: SF }}>
      <div style={{ position: "relative", aspectRatio: "1.3", background: "linear-gradient(135deg, #fde7f3, #f4f4f5)" }}>
        {e.cover && <img src={transformedImageUrl(e.cover, { width: 480 })} alt="" onError={(ev) => { ev.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
        {locked && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: colors.text, border: `1px solid ${colors.borderStrong}`, borderRadius: 999, padding: "5px 12px", background: "rgba(255,255,255,0.7)" }}>{e.ended ? "Missed" : "Pull up to unlock"}</span>
          </div>
        )}
        {tag && <span style={{ position: "absolute", top: 8, left: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", color: "#fff", background: tag.c, borderRadius: 999, padding: "3px 9px" }}>{tag.t}</span>}
      </div>
      <div style={{ padding: "10px 12px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title || "Untitled"}</div>
        <div style={{ fontSize: 11.5, color: colors.textFaded, marginTop: 2 }}>{whenLabel(e.startsAt)}{e.viewer === "pulledup" ? " · enter →" : (e.viewer === "rsvped" || e.viewer === "waitlist") ? " · view" : ""}</div>
      </div>
    </button>
  );
}

function EventRow({ e, onClick, count }) {
  const locked = e.viewer === "none";
  const tag = tagFor(e);
  const dead = locked && e.ended; // missed — not clickable
  return (
    <button onClick={dead ? undefined : onClick} disabled={dead} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "9px 6px", background: "none", border: "none", borderBottom: `1px solid ${colors.borderFaint}`, cursor: dead ? "default" : "pointer", fontFamily: SF, opacity: dead ? 0.55 : 1 }}>
      <div style={{ position: "relative", width: 52, height: 40, borderRadius: 9, flexShrink: 0, overflow: "hidden", background: "linear-gradient(135deg, #fde7f3, #f4f4f5)" }}>
        {e.cover && <img src={transformedImageUrl(e.cover, { width: 480 })} alt="" onError={(ev) => { ev.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: locked ? "blur(2px)" : "none" }} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title || "Untitled"}</div>
        <div style={{ fontSize: 11.5, color: colors.textFaded }}>{whenLabel(e.startsAt)}</div>
      </div>
      {count != null ? (
        <span style={{ fontSize: 12, fontWeight: 800, color: colors.accent, whiteSpace: "nowrap" }}>{count} <span style={{ color: colors.textFaded, fontWeight: 600 }}>pulled up</span></span>
      ) : tag && <span style={{ fontSize: 10, fontWeight: 800, color: tag.c }}>{tag.t}</span>}
    </button>
  );
}

function PersonRow({ name, clickable, onClick }) {
  return (
    <button onClick={clickable ? onClick : undefined} disabled={!clickable} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "9px 6px", background: "none", border: "none", borderBottom: `1px solid ${colors.borderFaint}`, cursor: clickable ? "pointer" : "default", fontFamily: SF }}>
      <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg,#ff45ad,#ec178f)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 800, color: "#fff" }}>{initials(name)}</div>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      {clickable && <span style={{ fontSize: 12, color: colors.accent, fontWeight: 700 }}>→</span>}
    </button>
  );
}

function Popup({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.32)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, maxHeight: "72vh", background: colors.background, borderRadius: 18, border: `1px solid ${colors.border}`, boxShadow: "0 20px 60px rgba(10,10,10,0.22)", display: "flex", flexDirection: "column", fontFamily: SF }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 12px", borderBottom: `1px solid ${colors.borderFaint}` }}>
          <span style={{ fontSize: 14.5, fontWeight: 800, color: colors.text }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, color: colors.textMuted, padding: 0 }}>×</button>
        </div>
        <div style={{ overflowY: "auto", padding: "4px 18px 16px" }}>{children}</div>
      </div>
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ fontSize: 13, color: colors.textFaded, padding: "18px 0", textAlign: "center" }}>{children}</div>;
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100dvh", background: colors.background, color: colors.text, fontFamily: SF }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px 60px" }}>
        <div style={{ marginBottom: 24 }}><PullupEyes variant="small" style={{ width: 30, height: 24, display: "block", opacity: 0.9 }} /></div>
        {children}
      </div>
    </div>
  );
}
