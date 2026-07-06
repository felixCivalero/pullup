// frontend/src/pages/EventRoomPage.jsx
//
// THE ROOM — PullUp as the host's chief-of-staff for one event.
//
// This is the heart of the product's narrowing (see "The Room" direction,
// 2026-05-31). It is NOT a funnel, a CRM table, or a stage board. It's a
// conversational surface: PullUp reads the whole room out loud (the brief),
// then shows the people as living threads ranked by who needs the host now.
// Depth/closeness is surfaced as a FEELING (a plain sentence + a soft heat
// dot), never a status badge or a column the host has to sort.
//
// Rendered against REAL data: ONE page-shaped call (GET /events/:id/room-view,
// via useEventRoomView) returns access + roster + channels + the Main feed for
// first paint, and the room itself is ONE flowing feed —
// RoomConversation (the /space stream: text + photos + replies + pinned), plus
// the roster. No fixtures, no channels, no side galleries. (The old BYO-storage
// grammar and the separate darkroom grid were folded into the feed.)

import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, Navigate } from "react-router-dom";
import { useEventNav } from "../contexts/EventNavContext.jsx";
import { useAuth } from "../contexts/AuthContext";
import { useEventRoomView } from "../lib/useEventRoomView.js";
import { initTracking, track } from "../lib/track.js";
import { AccessGate } from "../components/AccessGate.jsx";
import { AuthGate } from "../components/auth/AuthGate.jsx";
import { DoorVerify } from "../components/room/DoorVerify.jsx";
import { EventQuickActions } from "../components/EventQuickActions.jsx";
import { colors } from "../theme/colors.js";
import { LoadingScreen } from "../components/LoadingScreen.jsx";
import { authenticatedFetch } from "../lib/api.js";
import { supabase } from "../lib/supabase.js";
import { transformedImageUrl } from "../lib/imageUtils.js";
import { RoomAccessSettings } from "../components/RoomAccessSettings.jsx";
import RoomConversation from "../components/room/RoomConversation.jsx";
import { InstallPrompt } from "../components/pwa/InstallPrompt.jsx";
import { MessageSquare, Plus, X, Sparkles, Pencil, Users, ChevronDown, Images, ShoppingBag, Star, Share2, ExternalLink } from "lucide-react";
import { EventShareModal } from "../components/EventShareModal.jsx";
import { RoomPagesSettings } from "../components/RoomPagesSettings.jsx";
import { EventHostsSection } from "../components/EventHostsSection.jsx";
import { VipInviteSection } from "../components/VipInviteSection.jsx";
import { useSetHostResource } from "../contexts/useHostResource.js";
import { useToast } from "../components/Toast";
import { hasEventEnded } from "../lib/eventLifecycle.js";
import { RoomProductShowcase } from "../components/room/RoomProductShowcase.jsx";
import { RoomProductManager } from "../components/room/RoomProductManager.jsx";
import RoomContentWall from "../components/room/RoomContentWall.jsx";
import RoomPreview from "../components/room/RoomPreview.jsx";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// ─── Faces ───────────────────────────────────────────────────────────
// A closed group feels like one when you can see the people in it. Soft
// warm tints, picked deterministically by name, so the same person is
// always the same colour — quietly alive, never loud.
const AVATAR_TINTS = [
  { bg: "rgba(236, 23, 143, 0.12)", fg: "#ec178f" }, // pink
  { bg: "rgba(13, 148, 136, 0.12)", fg: "#0d9488" }, // teal
  { bg: "rgba(234, 88, 12, 0.12)",  fg: "#ea580c" }, // amber
  { bg: "rgba(124, 58, 237, 0.12)", fg: "#7c3aed" }, // violet
  { bg: "rgba(20, 120, 200, 0.12)", fg: "#1478c8" }, // blue
];
function tintFor(name) {
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}
function initialsOf(name) {
  return String(name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
function FaceAvatar({ name, size = 28 }) {
  const t = tintFor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: t.bg, color: t.fg, fontWeight: 800, fontFamily: SF,
      fontSize: Math.round(size * 0.38), letterSpacing: "-0.02em",
    }}>{initialsOf(name)}</div>
  );
}
// "Pia, Cole & Nadia" / "Pia, Cole & 4 more" — the room said as a sentence.
function firstNames(list, max = 3) {
  const ns = (list || []).map((p) => String(p.name || "").split(/\s+/)[0]).filter(Boolean);
  if (ns.length === 0) return "";
  if (ns.length === 1) return ns[0];
  if (ns.length <= max) return ns.slice(0, -1).join(", ") + " & " + ns[ns.length - 1];
  return `${ns.slice(0, 2).join(", ")} & ${ns.length - 2} more`;
}

// ONE room body for everyone — a single flowing feed. Host and guest see the
// same stream; the host just reaches it through the owner endpoints (and can
// pin anyone's post). A guest reaches the same feed through the room endpoints,
// session-resolved (no email box). Posting text needs `post`; attaching photos/
// video needs `upload`; both land as posts you can reply to.
// A subject's display name — the always-on default channel reads "Room chat".
function subjectName(c) {
  return c?.isMain ? "Room chat" : (c?.name || "Subject");
}

// A cover can be an image OR a video — render the right element so a video
// cover shows its frames as the banner thumbnail instead of a broken <img>.
function isVideoUrl(u) {
  return /\.(mp4|mov|m4v|webm|ogg)(\?|#|$)/i.test(String(u || ""));
}

function RoomSpace({ eventId, roster, isHost, permissions, meName, mePersonId, lobbyOpen, initialChannels, initialMessages, initialCoPresent }) {
  // The room narrows on the lifecycle: before the doors it's the lobby (everyone
  // who RSVP'd can prep); once the event starts only people who pulled up remain.
  // The subtitle says which one you're looking at, honestly, instead of always
  // claiming "only people who pulled up" even while the lobby is open.
  const circleLabel = lobbyOpen
    ? "the lobby — everyone who's RSVP'd"
    : "a closed circle — only people who pulled up";
  // The view payload carries the Main feed for first paint; the FIRST
  // loadMessages call (always the initial Main load) consumes it instead of
  // re-fetching. Every later call — polls, channel switches — hits the wire.
  const preloadRef = useRef({ used: false, messages: initialMessages });
  const api = useMemo(() => {
    const base = isHost ? `/host/events/${eventId}` : `/p/${eventId}`;
    const msgs = (r) => (r.ok ? r.json().then((d) => d.messages || []) : []);
    const qs = (cid) => (cid ? `?channelId=${cid}` : "");
    return {
      loadChannels: () => authenticatedFetch(`${base}/channels`).then((r) => (r.ok ? r.json().then((d) => d.channels || []) : [])),
      // Host holds the pen on subjects (the guest endpoint is read-only).
      createChannel: (name) => authenticatedFetch(`/host/events/${eventId}/channels`, { method: "POST", body: JSON.stringify({ name }) }).then((r) => (r.ok ? r.json().then((d) => d.channels || null) : null)),
      loadMessages: (channelId) => {
        if (!preloadRef.current.used && Array.isArray(preloadRef.current.messages)) {
          preloadRef.current.used = true;
          return Promise.resolve(preloadRef.current.messages);
        }
        return authenticatedFetch(`${base}/space${qs(channelId)}`).then(msgs);
      },
      post: ({ body, parentId, media, pinned, channelId }) =>
        authenticatedFetch(`${base}/space`, { method: "POST", body: JSON.stringify({ body, parentId, media, pinned, channelId }) }).then(msgs),
      pin: (messageId, pinned) =>
        authenticatedFetch(`${base}/space/${messageId}/pin`, { method: "POST", body: JSON.stringify({ pinned }) }).then((r) => (r.ok ? r.json().then((d) => d.messages || null) : null)),
      // Edit your own post's text / remove a post. Same base switch (host vs
      // guest endpoints); both return the fresh feed so the room reconciles.
      editMessage: (messageId, body) =>
        authenticatedFetch(`${base}/space/${messageId}`, { method: "PATCH", body: JSON.stringify({ body }) }).then((r) => (r.ok ? r.json().then((d) => d.messages || null) : null)),
      deleteMessage: (messageId) =>
        authenticatedFetch(`${base}/space/${messageId}`, { method: "DELETE" }).then((r) => (r.ok ? r.json().then((d) => d.messages || null) : null)),
      // Any file, any size (up to the bucket cap): mint a signed URL and upload
      // the bytes straight to storage from the browser — never through the API.
      uploadMedia: async (file) => {
        const r = await authenticatedFetch(`${base}/media/sign`, { method: "POST", body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.ok) throw new Error(d.reason || "sign_failed");
        const { error } = await supabase.storage.from("event-images").uploadToSignedUrl(d.path, d.token, file);
        if (error) throw error;
        return { url: d.url, type: d.type };
      },
      searchGifs: (q) => authenticatedFetch(`${base}/gifs${q ? `?q=${encodeURIComponent(q)}` : ""}`).then((r) => (r.ok ? r.json() : { disabled: false, gifs: [] })).catch(() => ({ disabled: false, gifs: [] })),
    };
  }, [eventId, isHost]);

  const here = roster?.pulledUp || [];
  // Each capability follows the host's Room access grid for the viewer's state
  // (the host themselves always has all of them). Pulled-up read is inviolable.
  const canRead = isHost || permissions?.read !== false;
  const canPost = isHost || permissions?.post === true;
  const canUpload = isHost || permissions?.upload === true;
  const canDownload = isHost || permissions?.download === true;

  // Subjects (channels). "Room chat" (Main) is always there; the host can open
  // more with the + and everyone can switch between them.
  const [channels, setChannels] = useState(() => initialChannels || []);
  const [activeId, setActiveId] = useState(() => ((initialChannels || []).find((c) => c.isMain) || (initialChannels || [])[0])?.id || null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  // "See who's here" for GUESTS — gated on the host's seeWho rule, computed
  // server-side into the view payload (the server enforces it; co-presence is
  // keyed to the viewer's own pull-up). The host has its own roster faces below.
  const [coPresent, setCoPresent] = useState(() => (!isHost && Array.isArray(initialCoPresent) ? initialCoPresent : []));

  // The view payload seeds channels at mount; this fetch only runs as the
  // fallback when the page was reached without one (view failed / stale).
  useEffect(() => {
    if (Array.isArray(initialChannels)) return;
    let alive = true;
    api.loadChannels().then((chs) => {
      if (!alive) return;
      setChannels(chs);
      setActiveId((cur) => cur || (chs.find((c) => c.isMain) || chs[0])?.id || null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [api, initialChannels]);

  useEffect(() => {
    if (isHost || permissions?.seeWho !== true) { setCoPresent([]); return; }
    if (Array.isArray(initialCoPresent)) { setCoPresent(initialCoPresent); return; }
    let alive = true;
    authenticatedFetch(`/p/${eventId}/interior`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setCoPresent(d.coPresent || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [eventId, isHost, permissions?.seeWho, initialCoPresent]);

  async function addSubject() {
    const name = newName.trim();
    if (!name) { setAdding(false); setNewName(""); return; }
    const fresh = await api.createChannel(name).catch(() => null);
    if (Array.isArray(fresh)) {
      setChannels(fresh);
      const made = fresh.find((c) => !c.isMain && c.name === name);
      if (made) setActiveId(made.id);
    }
    setNewName(""); setAdding(false);
  }

  const several = channels.length > 1;
  const pill = (active) => ({
    display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 999,
    fontSize: 13, fontWeight: active ? 750 : 600, cursor: "pointer", whiteSpace: "nowrap",
    border: `1px solid ${active ? colors.accent : colors.border}`,
    background: active ? colors.accent : colors.surface,
    color: active ? "#fff" : colors.text, fontFamily: SF,
  });

  return (
    <div style={{ marginBottom: "24px", border: `1px solid ${colors.borderStrong}`, borderRadius: "18px", padding: "18px 20px", background: colors.background, boxShadow: "0 1px 2px rgba(10,10,10,0.03), 0 12px 32px rgba(10,10,10,0.06)" }}>
      {/* Subject bar — "Room chat" is the default; the + opens more (host only).
          When there are several, each is its own clearly-marked tab. */}
      <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ width: 28, height: 28, borderRadius: "9px", background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <MessageSquare size={15} color={colors.accent} strokeWidth={2.4} />
        </div>

        {channels.map((c) => {
          const active = c.id === activeId;
          // With a single subject it reads as a plain title; once there are
          // several, every one is a switchable tab so it's obvious there's more.
          if (!several) {
            return (
              <div key={c.id} style={{ fontSize: "15px", fontWeight: 750, color: colors.text, letterSpacing: "-0.01em" }}>
                {subjectName(c)}
                <span style={{ fontSize: "12.5px", fontWeight: 500, color: colors.textFaded, letterSpacing: 0 }}> · {circleLabel}</span>
              </div>
            );
          }
          return (
            <button key={c.id} onClick={() => setActiveId(c.id)} style={pill(active)} title={subjectName(c)}>
              {subjectName(c)}
            </button>
          );
        })}

        {/* + new subject — host only */}
        {isHost && !adding && (
          <button onClick={() => setAdding(true)} title="New subject" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 999, border: `1px dashed ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", flexShrink: 0 }}>
            <Plus size={15} />
          </button>
        )}
        {isHost && adding && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input
              autoFocus value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubject(); } if (e.key === "Escape") { setAdding(false); setNewName(""); } }}
              onBlur={() => { if (!newName.trim()) { setAdding(false); setNewName(""); } }}
              placeholder="Subject name…"
              style={{ width: 150, padding: "5px 11px", borderRadius: 999, border: `1px solid ${colors.accent}`, background: colors.surface, color: colors.text, fontSize: 13, outline: "none", fontFamily: SF }}
            />
            <button onMouseDown={(e) => { e.preventDefault(); addSubject(); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 999, border: "none", background: colors.accent, color: "#fff", cursor: "pointer" }}><Plus size={15} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); setAdding(false); setNewName(""); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 999, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer" }}><X size={14} /></button>
          </div>
        )}
      </div>

      {/* Subtitle when there are several subjects (the single-subject case keeps
          it inline above). */}
      {several && (
        <div style={{ fontSize: "12.5px", fontWeight: 500, color: colors.textFaded, marginBottom: 14, marginLeft: 37 }}>
          {circleLabel}
        </div>
      )}

      {/* The people in the circle — faces (host's roster view). */}
      {isHost && here.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "11px", marginTop: several ? 0 : 12, marginBottom: "14px", paddingBottom: "14px", borderBottom: `1px solid ${colors.borderFaint}` }}>
          <div style={{ display: "flex" }}>
            {here.slice(0, 6).map((p, i) => (
              <div key={p.id} style={{ marginLeft: i === 0 ? 0 : "-8px", borderRadius: "50%", boxShadow: `0 0 0 2px ${colors.surface}` }}>
                <FaceAvatar name={p.name} size={30} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: "13px", color: colors.textMuted, lineHeight: 1.4 }}>
            <b style={{ color: colors.text }}>{firstNames(here)}</b> {here.length === 1 ? "is" : "are"} here
            <span style={{ color: colors.textFaded }}> · and you</span>
          </div>
        </div>
      )}

      {/* "Who's here" for guests — only when the host allows it (seeWho) and
          there are co-present people the viewer can see. */}
      {!isHost && coPresent.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "11px", marginTop: several ? 0 : 12, marginBottom: "14px", paddingBottom: "14px", borderBottom: `1px solid ${colors.borderFaint}` }}>
          <div style={{ display: "flex" }}>
            {coPresent.slice(0, 6).map((p, i) => (
              <div key={p.id} style={{ marginLeft: i === 0 ? 0 : "-8px", borderRadius: "50%", boxShadow: `0 0 0 2px ${colors.surface}` }}>
                <FaceAvatar name={p.name} size={30} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: "13px", color: colors.textMuted, lineHeight: 1.4 }}>
            <b style={{ color: colors.text }}>{firstNames(coPresent)}</b> {coPresent.length === 1 ? "is" : "are"} here
            <span style={{ color: colors.textFaded }}> · and you</span>
          </div>
        </div>
      )}

      <RoomConversation key={activeId || "main"} channelId={activeId} canRead={canRead} canPost={canPost} canUpload={canUpload} canDownload={canDownload} canPinAny={isHost} api={api} meName={meName} mePersonId={mePersonId} meIsHost={isHost} />
    </div>
  );
}

// Roster — who's in the room, on the lifecycle: RSVP'd (coming) first, then
// pull-up-only (showed). The shared area's "who's here", not a CRM of threads.
// RosterStrip — presence as a small global line under the title: a face-pile
// per state + a quiet count. The full member list lives in Guests; here it's
// just "who's around", glanceable.
function RosterStrip({ roster, inBar = false }) {
  if (!roster) return null;
  const up = roster.pulledUp || [];
  const coming = roster.coming || [];
  if (!up.length && !coming.length) return null;

  const Cluster = ({ people, label, accent }) => {
    if (!people.length) return null;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
        <div style={{ display: "flex" }}>
          {people.slice(0, 5).map((p, i) => (
            <div key={p.id} title={p.name} style={{ marginLeft: i === 0 ? 0 : "-7px", borderRadius: "50%", boxShadow: "0 0 0 2px #fff" }}>
              <FaceAvatar name={p.name} size={26} />
            </div>
          ))}
          {people.length > 5 && (
            <div style={{ marginLeft: "-7px", width: 26, height: 26, borderRadius: "50%", boxShadow: "0 0 0 2px #fff", background: colors.surfaceMuted, color: colors.textMuted, fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SF }}>+{people.length - 5}</div>
          )}
        </div>
        <span style={{ fontSize: "12.5px", fontWeight: accent ? 700 : 600, color: accent ? colors.accent : colors.textMuted }}>
          {people.length} {label}
        </span>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap", marginTop: inBar ? 0 : "14px" }}>
      <Cluster people={up} label="pulled up" accent />
      <Cluster people={coming} label="coming" />
    </div>
  );
}

// The guest's face of the same presence bar — the phase-narrowed room roster
// the server already seeWho-gated (co-present people, viewer excluded). Before
// the doors that's everyone coming; once the event starts, who pulled up.
function GuestPresenceStrip({ people, lobbyOpen }) {
  if (!people?.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
      <div style={{ display: "flex" }}>
        {people.slice(0, 5).map((p, i) => (
          <div key={p.id} title={p.name} style={{ marginLeft: i === 0 ? 0 : "-7px", borderRadius: "50%", boxShadow: "0 0 0 2px #fff" }}>
            <FaceAvatar name={p.name} size={26} />
          </div>
        ))}
        {people.length > 5 && (
          <div style={{ marginLeft: "-7px", width: 26, height: 26, borderRadius: "50%", boxShadow: "0 0 0 2px #fff", background: colors.surfaceMuted, color: colors.textMuted, fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SF }}>+{people.length - 5}</div>
        )}
      </div>
      <span style={{ fontSize: "12.5px", fontWeight: 700, color: colors.accent }}>
        {people.length} {lobbyOpen ? "coming" : "pulled up"}
      </span>
      <span style={{ fontSize: "12.5px", fontWeight: 600, color: colors.textFaded }}>· and you</span>
    </div>
  );
}

// The host's "Team" fold-down — assign roles to other arrangers right inside
// the room, next to Room access. Mirrors RoomAccessSettings' pill+fold so the
// two host controls read as one toolbar. Reuses EventHostsSection (add by
// email, role dropdown, pending invites). Owner/admin only.
function RoomTeamSettings({ eventId, open, setOpen }) {
  const pill = {
    display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px",
    borderRadius: 999, border: `1px solid ${open ? colors.accent : colors.border}`,
    background: open ? (colors.accentSoft || "rgba(236,23,143,0.08)") : "#fff",
    color: open ? colors.accent : colors.text, fontSize: 13, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  };
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} style={pill}>
        <Users size={15} /> Team
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div style={{ width: "100%", marginTop: 10 }}>
          <p style={{ fontSize: 12.5, color: colors.textMuted, lineHeight: 1.5, margin: "0 0 10px" }}>
            Give people a role so they can help run this room. Add by email — they'll get an invite and see the event when they sign in.
          </p>
          <EventHostsSection eventId={eventId} canManageHosts compact />
        </div>
      )}
    </>
  );
}

// The shared toolbar pill — same look as the Team/Room-access fold pills, so
// the top of the room reads as one row of host controls.
const TOOLBAR_PILL = {
  display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px",
  borderRadius: 999, border: `1px solid ${colors.border}`, background: "#fff",
  color: colors.text, fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
};

// The VIP fold — mint personal invite links right from the room, same
// pill+fold pattern as Team. Moved here from the old home-dashboard event
// panel (which is gone); shown only while the event hasn't ended.
function RoomVipSettings({ event, open, setOpen }) {
  const { showToast } = useToast();
  const pill = {
    display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px",
    borderRadius: 999, border: `1px solid ${open ? colors.accent : colors.border}`,
    background: open ? (colors.accentSoft || "rgba(236,23,143,0.08)") : "#fff",
    color: open ? colors.accent : colors.text, fontSize: 13, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  };
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} style={pill}>
        <Star size={15} /> VIP
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div style={{ width: "100%", marginTop: 10 }}>
          <VipInviteSection event={event} showToast={showToast} compact />
        </div>
      )}
    </>
  );
}

// Host sub-roles that actually RUN the room (get the chief-of-staff view +
// edit the room's access config). reception works the door; analytics only
// reads Insights — neither manages the room itself. room_curator is the role
// built to run the room: access grid, pages, welcome.
const ROOM_MANAGER_ROLES = ["owner", "admin", "co_host", "editor", "room_curator"];
// Who can assign other hosts: owner/admin only — mirrors backend canManageHosts.
const EVENT_ADMIN_ROLES = ["owner", "admin"];
// Who can edit the room welcome (front-door copy): owner/admin + room_curator —
// mirrors the backend canEditRoomWelcome gate. Editors run the room but don't
// reshape the welcome.
const WELCOME_EDIT_ROLES = ["owner", "admin", "room_curator"];

// The room's welcome — the host's greeting that everyone lands on. Shown to
// guests as a soft card under the cover; the host edits it inline (pencil →
// textarea → save). Empty + host = a gentle "add a welcome" prompt; empty +
// guest = nothing. Saves through the focused PUT /host/events/:id/room-welcome,
// so a one-line edit never runs the full event-update path.
function RoomWelcomeCard({ eventId, initial, canEdit, editing, setEditing, cardRef, onSavedChange, host }) {
  const [welcome, setWelcome] = useState(initial || "");
  const [draft, setDraft] = useState(initial || "");
  const [saving, setSaving] = useState(false);

  const startEdit = () => { setDraft(welcome); setEditing(true); };
  const save = async () => {
    setSaving(true);
    try {
      const res = await authenticatedFetch(`/host/events/${eventId}/room-welcome`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomWelcome: draft }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = await res.json();
      setWelcome(data.roomWelcome || "");
      setEditing(false);
      onSavedChange?.(!!data.roomWelcome);
    } catch {
      /* leave the editor open so the host can retry */
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div ref={cardRef} style={{ marginBottom: 22, padding: "16px 18px", borderRadius: 16, background: colors.accentSoft, border: `1px solid ${colors.accentBorder}` }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.accentText, marginBottom: 8, display: "flex", alignItems: "center", gap: 7 }}>
          <Sparkles size={15} color={colors.accent} strokeWidth={2.3} /> Your welcome — a personal hello
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          rows={3}
          maxLength={600}
          placeholder="Greet them like you would at the door — short and warm. “So glad you’re here. Tag your shots and grab anyone’s.”"
          style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: "12px 14px", borderRadius: 12, border: `1px solid ${colors.border}`, background: "#fff", color: colors.text, fontSize: 14.5, lineHeight: 1.5, fontFamily: SF, outline: "none" }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
          <button onClick={() => setEditing(false)} disabled={saving} style={{ padding: "8px 16px", borderRadius: 999, border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: SF }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "8px 18px", borderRadius: 999, border: "none", background: colors.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1, boxShadow: colors.accentShadow, fontFamily: SF }}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    );
  }

  // Empty: guests see nothing; the host sees a soft prompt to add one.
  if (!welcome) {
    if (!canEdit) return null;
    return (
      <button
        ref={cardRef}
        onClick={startEdit}
        style={{ width: "100%", textAlign: "left", marginBottom: 22, padding: "14px 16px", borderRadius: 16, background: colors.surface, border: `1px dashed ${colors.border}`, color: colors.textMuted, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: SF, display: "flex", alignItems: "center", gap: 9 }}
      >
        <Sparkles size={16} color={colors.accent} strokeWidth={2.2} />
        Write a personal hello your guests land on
      </button>
    );
  }

  // Set: a personal note from the HOST. Their face + name make it feel like a
  // greeting at the door, and the message reads as a headline, not body copy.
  const hostName = host?.name || "Your host";
  return (
    <div ref={cardRef} style={{ marginBottom: 22, padding: "20px 22px", borderRadius: 18, background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, position: "relative" }}>
      {canEdit && (
        <button
          onClick={startEdit}
          aria-label="Edit welcome message"
          style={{ position: "absolute", top: 14, right: 14, width: 28, height: 28, borderRadius: 999, border: `1px solid ${colors.accentBorder}`, background: "#fff", color: colors.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <Pencil size={13} strokeWidth={2.3} />
        </button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        {host?.avatar
          ? <img src={host.avatar} alt={hostName} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `1px solid ${colors.accentBorder}` }} />
          : <FaceAvatar name={hostName} size={36} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 750, color: colors.text, fontFamily: SF, lineHeight: 1.1 }}>{hostName}</div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.accentText, fontFamily: SF }}>your host</div>
        </div>
      </div>
      <div style={{ fontSize: 22, lineHeight: 1.25, fontWeight: 800, letterSpacing: "-0.02em", color: colors.text, whiteSpace: "pre-wrap", fontFamily: SF, paddingRight: canEdit ? 24 : 0 }}>
        {welcome}
      </div>
    </div>
  );
}

export default function EventRoomPage() {
  const { id } = useParams();
  const { setEventNav, clearEventNav } = useEventNav();
  // One URL, one permission gate. `level` decides the view: a host runs the
  // chief-of-staff surface; everyone else gets the room they earned. `role`
  // refines the host side so analytics/reception don't get the wrong chrome.
  const { user } = useAuth();
  const { loading, level, role, reason, permissions, event, personId: mePersonId, roster: viewRoster, channels: viewChannels, messages: viewMessages, coPresent: viewCoPresent, products: viewProducts, content: viewContent, contentCan: viewContentCan, pages: viewPages } = useEventRoomView(id);
  const [roster, setRoster] = useState(null);
  const [managingProducts, setManagingProducts] = useState(false); // event-room product manager
  const isHost = level === "host";
  // Declare the host resource when the viewer runs this event — it's what
  // makes the floating Messages/coach bubble show on the room (and every
  // event page); guests declare nothing, so their room stays clean.
  useSetHostResource(isHost && id ? { type: "event", id } : null);
  // The scanned code/pass that proves this viewer is at the door. The presence
  // pass (minted server-side once a live code verifies) is stashed here so it
  // outlives the sign-in round-trip the 45s code never could.
  const scanKey = `pullup_scan_pass_${id}`;
  // Flips true once a door scan has terminally failed (stale code, no pass) so
  // we stop holding the "checking you in" screen and fall through to the gate.
  const [scanFailed, setScanFailed] = useState(false);

  // Room presence onto the analytics spine: one identified room_view per
  // room per page load, fired once the gate has resolved who this viewer is.
  // user_id + event_id make the afterlife metric joinable to the pull-up
  // truth; level rides as the role prop. Denied viewers are not a presence.
  const trackedRoomRef = useRef(null);
  useEffect(() => {
    if (!level || level === "no_access" || trackedRoomRef.current === id) return;
    trackedRoomRef.current = id;
    initTracking();
    track("room_view", { role: level }, { page: "room", eventId: id, userId: user?.id });
  }, [level, id, user]);
  const canManageRoom = ROOM_MANAGER_ROLES.includes(role);
  // Owner/admin assign other hosts (mirrors backend canManageHosts). Editors run
  // the room but don't reshape the team or the front-door copy.
  const canEditEvent = EVENT_ADMIN_ROLES.includes(role);
  // The welcome card: owner/admin + room curator (mirrors canEditRoomWelcome).
  const canEditWelcome = WELCOME_EDIT_ROLES.includes(role);
  const [welcomeEditing, setWelcomeEditing] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [vipOpen, setVipOpen] = useState(false);
  const [sharing, setSharing] = useState(false); // → EventShareModal (page + room links)
  // The room is now tabbed (Wall · Chat · Shop). Wall is the hero + default;
  // which others appear is the host's Pages config (live-overridable on save).
  const [activeTab, setActiveTab] = useState("wall");
  const [pagesOverride, setPagesOverride] = useState(null);
  // An unverified viewer (no session) tapping "Verify my email" on the preview
  // swaps to the real auth wall — the canonical verified-entry flow.
  const [previewVerify, setPreviewVerify] = useState(false);

  // The host view needs the roster data; load it once the gate confirms we own
  // the event. A GUEST gets no management nav (no myRole → no Guests/Insights/
  // Edit tabs), but the shell still needs to know where to send them on the way
  // out: the HOST's person room, not their own home. So we hand the shell a
  // guest-flavoured nav carrying just the host's room pointer. Analytics-only
  // gets bounced to Insights, so it clears entirely.
  useEffect(() => {
    if (level == null) return; // still resolving
    if (role === "analytics") { clearEventNav(); return; }
    if (!isHost) {
      const h = event?.host;
      if (h?.roomId) setEventNav({ guest: true, hostRoomId: h.roomId, hostName: h.name || null });
      else clearEventNav();
      return;
    }
    // The roster rides the view payload — no second fetch.
    const d = viewRoster;
    if (!d) return;
    setRoster(d);
    // Carry the REAL sub-role to the shell so the tab set matches the role.
    setEventNav({ title: d.event?.title || event?.title || "Event", status: d.event?.ended ? "PASSED" : (d.event?.status || "LIVE"), guestsCount: d.pulledUpCount, myRole: role, kind: event?.kind || d.event?.kind || "event" });
  }, [level, role, isHost, id, setEventNav, clearEventNav, event, viewRoster]);

  // QR door scan → pull-up. Runs whether or not we're signed in yet: a fresh
  // scan carries ?w=&s=; once signed in we replay the stored presence pass (the
  // code is long dead by then). The two-phase dance:
  //   1. Logged out + live code → server proves presence, hands back a pass and
  //      says `needs_identify`. We stash the pass; the AuthGate below renders
  //      (user is null) so the guest signs in — the pass waits in localStorage.
  //   2. Signed in (now, or returning from the auth round-trip) → we POST the
  //      pass, the pull-up records, and we land clean in the room.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const w = p.get("w"), s = p.get("s");
    let storedPass = null;
    try { storedPass = localStorage.getItem(scanKey); } catch { /* ignore */ }
    // Prefer the pass — on the post-sign-in replay the original code is stale.
    const body = storedPass ? { pass: storedPass } : (w && s ? { w: Number(w), s } : null);
    if (!body) return;
    let cancelled = false;
    authenticatedFetch(`/p/${id}/pullup`, { method: "POST", body: JSON.stringify(body) })
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (cancelled || !d) return;
        if (d.ok) {
          try { localStorage.removeItem(scanKey); } catch { /* ignore */ }
          window.location.replace(`/events/${id}/room`); // clean URL → refetch access
          return;
        }
        if (d.reason === "needs_identify" && d.pass) {
          // Presence proven, identity pending — keep the pass for after sign-in.
          try { localStorage.setItem(scanKey, d.pass); } catch { /* ignore */ }
          return;
        }
        // Stale screenshot or dead pass — give up; the normal gate takes over.
        try { localStorage.removeItem(scanKey); } catch { /* ignore */ }
        setScanFailed(true);
      })
      .catch(() => { if (!cancelled) setScanFailed(true); });
    return () => { cancelled = true; };
  }, [id, user, scanKey]);

  if (loading) {
    return <LoadingScreen label="opening the room" />;
  }

  // Analytics-only collaborators don't run the room — send them to Insights.
  if (isHost && role === "analytics") {
    return <Navigate to={`/app/events/${id}/analytics`} replace />;
  }

  // A community has NO room of its own — it IS the host's main room. The host
  // manages it via Signups + Insights; there's no separate room surface. Send
  // them to their main room.
  if (isHost && event?.kind === "community" && user?.id) {
    return <Navigate to={`/r/${user.id}`} replace />;
  }

  // ONE auth gate + ONE permission gate. Identity is ALWAYS required — even a
  // scanned live QR doesn't waive it: you must be a verified session to pull up
  // (the code proves you're at the door, the session proves who you are). The
  // live code only waives the PERMISSION gate, so a verified walk-in with no
  // prior RSVP can still pull up at the door.
  const hasLiveCode = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("w");
  let storedPass = null;
  try { storedPass = typeof window !== "undefined" ? localStorage.getItem(scanKey) : null; } catch { /* ignore */ }
  // A door scan is still resolving while we hold a live code or a stashed pass
  // and it hasn't failed — the effect above is recording the pull-up right now.
  const scanInFlight = (hasLiveCode || !!storedPass) && !scanFailed;
  // Unverified (no session) but the room allows a peek → the read-only PREVIEW:
  // the room's shell + a verify badge, every social surface locked. Tapping
  // verify swaps to the real auth wall. A door scan mid-flight skips the peek —
  // that path verifies via the light DoorVerify below and lands them inside.
  if (level === "preview" && !scanInFlight) {
    if (previewVerify) return <AuthGate redirectTo={`/events/${id}/room${typeof window !== "undefined" ? window.location.search : ""}`} />;
    return <RoomPreview event={event} onVerify={() => setPreviewVerify(true)} />;
  }
  if (!user || level === "no_session") {
    // At the door (a scan is in flight) → the light guest step-2: verify it's
    // you with an email code, never the host onboarding modal. Verifying mints a
    // session; the scan effect above then replays the pass and lands them in the
    // room. Anywhere else with no session → the standard auth wall.
    if (scanInFlight) return <DoorVerify eventTitle={event?.title || null} />;
    return <AuthGate redirectTo={`/events/${id}/room${typeof window !== "undefined" ? window.location.search : ""}`} />;
  }
  if (level === "no_access") {
    // Signed in but not yet pulled up. If a scan is mid-flight, hold the door a
    // beat rather than flashing the denial — the effect will land them inside.
    if (scanInFlight) return <LoadingScreen label="checking you in" />;
    return <AccessGate reason={reason} event={event} eventId={id} />;
  }

  // Host AND guest fall through to the SAME room below — what differs is only
  // what each is allowed to see/do, driven by isHost + permissions.
  const when = event?.startsAt ? new Date(event.startsAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : null;
  // Doors-open boundary: before starts_at the room is the lobby (RSVP'd can prep);
  // at/after start it narrows to people who pulled up. No date = forever-lobby.
  const startsMs = event?.startsAt ? new Date(event.startsAt).getTime() : null;
  const lobbyOpen = startsMs == null || Date.now() < startsMs;
  const hasCover = !!event?.cover;
  const meName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "You";

  return (
    <div style={{ display: "flex", height: "100vh", paddingTop: "calc(58px + env(safe-area-inset-top, 0px))", boxSizing: "border-box" }}>
      <div style={{ flex: "1 1 100%", overflowY: "auto", minWidth: 0 }}>
        <div style={{ maxWidth: "1040px", margin: "0 auto", padding: "28px 20px 60px" }}>
          {/* Top actions — sit ABOVE the event so they read as a toolbar of
              things you DO to it, not part of the event content. Quick CTAs
              (Room access rides along as a host-only fold-down) + partner shelf. */}
          <div style={{ marginBottom: 14 }}>
            <EventQuickActions
              slug={event?.slug}
              title={event?.title}
              startsAt={event?.startsAt}
              endsAt={event?.endsAt}
              location={event?.location}
              trailing={canManageRoom ? (
                <>
                  {/* THE page — what the host just made, one pink click away.
                      Far left + accent shade on purpose: "show me my event" is
                      the first instinct after creating it. */}
                  {event?.slug && (
                    <a
                      href={`/e/${event.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        ...TOOLBAR_PILL,
                        textDecoration: "none",
                        background: colors.accentSoft,
                        border: `1px solid ${colors.accentBorder}`,
                        color: colors.accent,
                        fontWeight: 700,
                      }}
                    >
                      <ExternalLink size={15} /> Event page
                    </a>
                  )}
                  <RoomAccessSettings eventId={id} />
                  <RoomPagesSettings eventId={id} pages={pagesOverride || viewPages} onChange={setPagesOverride} />
                  {canEditEvent && <RoomTeamSettings eventId={id} open={teamOpen} setOpen={setTeamOpen} />}
                  {canEditEvent && event && !hasEventEnded(event.startsAt, event.endsAt) && (
                    <RoomVipSettings event={event} open={vipOpen} setOpen={setVipOpen} />
                  )}
                  {/* Share — the old home hover-panel's Share & Track, living
                      where the event lives. (Messaging = the floating dock,
                      bottom-right on every event page for hosts.) */}
                  {event?.slug && (
                    <button type="button" onClick={() => setSharing(true)} style={TOOLBAR_PILL}>
                      <Share2 size={15} /> Share
                    </button>
                  )}
                </>
              ) : null}
            />
          </div>

          {sharing && event && <EventShareModal event={event} onClose={() => setSharing(false)} />}

          {/* Event identity — ONE unified banner: cover backdrop + scrim,
              title/meta overlaid, an attached presence bar for the roster. A
              missing cover falls back to the soft gradient with ink text. */}
          <div style={{ marginBottom: "22px", borderRadius: "18px", overflow: "hidden", border: `1px solid ${colors.border}`, boxShadow: "0 1px 2px rgba(10,10,10,0.03), 0 10px 30px rgba(10,10,10,0.05)" }}>
            <div style={{ position: "relative", height: hasCover ? 196 : 132, background: hasCover ? "#1a1016" : "linear-gradient(135deg, #fde7f3 0%, #f4f4f5 55%, #e7f9f5 100%)" }}>
              {hasCover && (isVideoUrl(event.cover)
                ? <video src={event.cover} muted autoPlay loop playsInline preload="metadata" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                : <img src={transformedImageUrl(event.cover, { width: 720 })} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              )}
              {hasCover && (
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 28%, rgba(0,0,0,0.34) 64%, rgba(0,0,0,0.66) 100%)" }} />
              )}
              <div style={{ position: "absolute", left: 22, right: 22, bottom: 16 }}>
                <h1 style={{ fontSize: "27px", fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.02em", lineHeight: 1.1, fontFamily: SF, color: hasCover ? "#fff" : colors.text, textShadow: hasCover ? "0 1px 14px rgba(0,0,0,0.45)" : "none" }}>
                  {event?.title || "The Room"}
                </h1>
                <div style={{ fontSize: "13.5px", fontWeight: 500, color: hasCover ? "rgba(255,255,255,0.92)" : colors.textMuted, textShadow: hasCover ? "0 1px 10px rgba(0,0,0,0.45)" : "none" }}>
                  {[when, event?.location].filter(Boolean).join(" · ") || " "}
                </div>
              </div>
            </div>
            {isHost && (roster?.pulledUp?.length || roster?.coming?.length) ? (
              <div style={{ padding: "11px 20px", background: colors.surface, borderTop: `1px solid ${colors.borderFaint}` }}>
                <RosterStrip roster={roster} inBar />
              </div>
            ) : !isHost && permissions?.seeWho === true && (viewCoPresent || []).length > 0 ? (
              /* Guests get the same presence bar when the host's Room access
                 allows it (seeWho) — who's coming before the doors, who pulled
                 up after. Server-gated list; the client only renders it. */
              <div style={{ padding: "11px 20px", background: colors.surface, borderTop: `1px solid ${colors.borderFaint}` }}>
                <GuestPresenceStrip people={viewCoPresent} lobbyOpen={lobbyOpen} />
              </div>
            ) : null}
          </div>

          {/* The host's greeting — sits right under the banner, ABOVE the page
              tabs (it's the room's hello, not one of the pages). Everyone who
              lands sees it; the host edits it inline. */}
          <RoomWelcomeCard eventId={id} initial={event?.roomWelcome} canEdit={canEditWelcome} editing={welcomeEditing} setEditing={setWelcomeEditing} host={event?.host} />

          {/* ── PAGE TABS — jump between the room's surfaces. The Wall is the hero
              and the default; Chat & Shop appear per the host's Pages config (the
              Shop tab also self-hides for guests when there's nothing in it). The
              wall fills the page; chat/shop sit at a readable measure. ── */}
          {(() => {
            const pg = pagesOverride || viewPages || { wall: true, chat: true, shop: true };
            const productCount = (viewProducts || []).length;
            const showChat = pg.chat && (isHost || permissions?.read !== false);
            const showShop = pg.shop && (canManageRoom || productCount > 0);
            const tabs = [
              { key: "wall", label: "Wall", Icon: Images },
              ...(showChat ? [{ key: "chat", label: "Chat", Icon: MessageSquare }] : []),
              ...(showShop ? [{ key: "shop", label: "Shop", Icon: ShoppingBag }] : []),
            ];
            const tab = tabs.some((t) => t.key === activeTab) ? activeTab : "wall";
            return (
              <>
                {tabs.length > 1 && (
                  <div style={{ display: "flex", gap: 7, marginBottom: 22, flexWrap: "wrap" }}>
                    {tabs.map(({ key, label, Icon }) => {
                      const on = key === tab;
                      return (
                        <button
                          key={key}
                          onClick={() => setActiveTab(key)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 999, border: `1px solid ${on ? colors.accent : colors.border}`, background: on ? colors.accent : colors.background, color: on ? "#fff" : colors.text, fontSize: 13.5, fontWeight: on ? 750 : 600, fontFamily: SF, cursor: "pointer", transition: "background 0.12s, border-color 0.12s" }}
                        >
                          <Icon size={15} strokeWidth={2.2} /> {label}
                          {key === "wall" && viewContent?.length ? (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: on ? "rgba(255,255,255,0.22)" : colors.surfaceMuted, color: on ? "#fff" : colors.textMuted }}>{viewContent.length}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* WALL — the hero, full page width */}
                {tab === "wall" && (
                  <RoomContentWall
                    eventId={id}
                    initial={viewContent || []}
                    can={viewContentCan || { upload: isHost || permissions?.upload === true, download: isHost || permissions?.download === true }}
                    meName={meName}
                    isHost={isHost}
                  />
                )}

                {/* CHAT — the live conversation, at a readable measure */}
                {tab === "chat" && showChat && (
                  <div style={{ maxWidth: 760, margin: "0 auto" }}>
                    <RoomSpace eventId={id} roster={roster} isHost={isHost} permissions={permissions} meName={meName} mePersonId={mePersonId} lobbyOpen={lobbyOpen} initialChannels={viewChannels} initialMessages={viewMessages} initialCoPresent={viewCoPresent} />
                  </div>
                )}

                {/* SHOP — products placed in the room; host gets the manage affordance */}
                {tab === "shop" && showShop && (
                  <div style={{ maxWidth: 760, margin: "0 auto" }}>
                    <RoomProductShowcase
                      products={viewProducts || []}
                      isHost={canManageRoom}
                      theme="light"
                      scope="event"
                      heading="Shop"
                      prefill={{ name: meName, email: user?.email || "" }}
                      onManage={() => setManagingProducts(true)}
                    />
                    {managingProducts && (
                      <RoomProductManager scope="event" eventId={id} onClose={() => setManagingProducts(false)} onChanged={() => { /* refreshes on next room-view load */ }} />
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
      {/* Install nudge — same room, role-aware copy. Only renders if the visitor
          can actually install (prompt captured / iOS Safari) and hasn't snoozed. */}
      <InstallPrompt
        headline={isHost ? "Keep this room in your pocket" : "Get the app for this event"}
        subtext={
          isHost
            ? "Add PullUp to your home screen — your room, one tap away."
            : "Add PullUp to your home screen for your spot, updates and the photos."
        }
      />
    </div>
  );
}
