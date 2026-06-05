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
// Rendered against REAL data: access resolves via useEventAccess
// (GET /events/:id/access), and the room itself reads live endpoints —
// RoomConversation (topics/space), Darkroom (peer-shared photos), and the
// roster. No fixtures. (The old seeded mock components were removed.)

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams, Navigate } from "react-router-dom";
import { useEventNav } from "../contexts/EventNavContext.jsx";
import { useAuth } from "../contexts/AuthContext";
import { useEventAccess } from "../lib/useEventAccess.js";
import { AccessGate } from "../components/AccessGate.jsx";
import { AuthGate } from "../components/auth/AuthGate.jsx";
import { EventQuickActions } from "../components/EventQuickActions.jsx";
import { HostPartnerLinks } from "../components/HostPartnerLinks.jsx";
import { colors } from "../theme/colors.js";
import { authenticatedFetch } from "../lib/api.js";
import { RoomAccessSettings } from "../components/RoomAccessSettings.jsx";
import RoomConversation from "../components/room/RoomConversation.jsx";
import { InstallPrompt } from "../components/pwa/InstallPrompt.jsx";
import { MessageSquare, Folder, FolderPlus } from "lucide-react";

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

// ─── Storage: the room renders from YOUR cloud, never ours ───────────
//
// The federated stance made literal: content lives in the connected cloud
// (Drive / iCloud / Dropbox), PullUp holds only the ledger and renders. The
// real OAuth rail is the backend brick still to come — this wires the FRONT
// of it: the connect moment + the per-folder sharing verb. State is local
// (no backend yet), but the grammar is real.

// Where the bytes can live. "floor" is PullUp's thin temporary holding —
// the thing we actively want to empty as people connect their own cloud.
const STORAGE_PROVIDERS = [
  { key: "gdrive", label: "Google Drive", hint: "an app-folder, only we touch it" },
  { key: "icloud", label: "iCloud Photos", hint: "your Apple library" },
  { key: "dropbox", label: "Dropbox", hint: "your own folder" },
  { key: "floor", label: "PullUp floor", hint: "temporary — move it home later" },
];

// The verb a folder grants by default. A bead inherits its folder's verb
// unless someone changes it. See = look only · Ask = request to keep ·
// Take = yours forever (the irrevocable gift) · Pay = a copy, coming soon.
const SHARE_VERBS = {
  see:  { label: "See",        note: "look, don't keep",  color: colors.textSubtle, bg: colors.surfaceMuted,  border: colors.border },
  ask:  { label: "Ask",        note: "request to keep",   color: colors.secondary,  bg: colors.secondarySoft, border: colors.secondaryBorder },
  take: { label: "Take",       note: "yours to keep",     color: colors.accent,     bg: colors.accentSoft,    border: colors.accentBorder },
  pay:  { label: "Pay · soon", note: "buy a copy",        color: colors.textFaded,  bg: "transparent",        border: colors.border, soon: true },
};
const VERB_CYCLE = ["see", "ask", "take", "pay"];

function VerbChip({ verb, onCycle }) {
  const v = SHARE_VERBS[verb];
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onCycle(); }}
      title={`${v.label} — ${v.note} (tap to change)`}
      style={{
        alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px",
        fontSize: "10.5px", fontWeight: 700, color: v.color, background: v.bg,
        border: `1px solid ${v.border}`, borderRadius: "999px", padding: "2px 8px",
        cursor: "pointer", lineHeight: 1.4, fontFamily: SF,
        opacity: v.soon ? 0.7 : 1,
      }}
    >
      {v.label}
    </button>
  );
}

function StorageFolders() {
  const [provider, setProvider] = useState(null);   // null = not connected yet
  const [picking, setPicking] = useState(false);
  const [verbs, setVerbs] = useState({ all: "see", group: "take", after: "see" });

  const connected = STORAGE_PROVIDERS.find((p) => p.key === provider);
  const folders = [
    { key: "all", label: "All photos", hint: "everything dropped here" },
    { key: "group", label: "Group shot", hint: "the one with everyone" },
    { key: "after", label: "Afters", hint: "what happened later" },
    { key: "add", label: "+ New folder", hint: "", add: true },
  ];

  const cycleVerb = (key) => setVerbs((prev) => {
    const cur = prev[key] || "see";
    const next = VERB_CYCLE[(VERB_CYCLE.indexOf(cur) + 1) % VERB_CYCLE.length];
    return { ...prev, [key]: next };
  });

  // A slim files bar — folders as chips, like a Slack/Discord channel's files.
  // Not a big grid just because it's photos; it rides inside the room card.
  const chip = (add, dim) => ({
    display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px",
    borderRadius: 999, fontFamily: SF, fontSize: 12.5, fontWeight: 650, cursor: "pointer",
    border: `1px ${add ? "dashed" : "solid"} ${colors.border}`,
    background: add ? "transparent" : colors.surface,
    color: add ? colors.textMuted : colors.text, opacity: dim ? 0.55 : 1, whiteSpace: "nowrap",
  });

  return (
    <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${colors.borderFaint}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: colors.textSubtle, textTransform: "uppercase", letterSpacing: "0.07em", marginRight: 2 }}>Files</span>

        {folders.map((f) =>
          f.add ? (
            <button key={f.key} type="button" style={chip(true, false)} title="New folder">
              <FolderPlus size={13} /> New folder
            </button>
          ) : (
            <span key={f.key} style={chip(false, !connected)}>
              <Folder size={13} style={{ color: colors.textFaded, flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{f.label}</span>
              {connected && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); cycleVerb(f.key); }}
                  title="Who can do what with this folder"
                  style={{ border: "none", background: "transparent", padding: 0, marginLeft: 2, fontSize: 11, fontWeight: 700, color: colors.accent, cursor: "pointer", fontFamily: SF }}
                >
                  {verbs[f.key] || "see"}
                </button>
              )}
            </span>
          )
        )}

        {/* Connect state — small, on the right */}
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SF,
            fontSize: 11.5, fontWeight: 650, cursor: "pointer", borderRadius: 999, padding: "4px 10px",
            border: `1px solid ${connected ? colors.secondaryBorder : colors.accentBorder}`,
            background: connected ? colors.secondarySoft : colors.accentSoft,
            color: connected ? colors.secondary : colors.accent,
          }}
        >
          {connected ? (
            <><span style={{ width: 5, height: 5, borderRadius: "50%", background: colors.secondary }} /> {connected.label}</>
          ) : "Connect storage"}
        </button>
      </div>

      {/* Provider picker — small inline row, only while choosing */}
      {picking && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {STORAGE_PROVIDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => { setProvider(p.key); setPicking(false); }}
              style={{
                padding: "6px 11px", borderRadius: 10, cursor: "pointer", fontFamily: SF, fontSize: 12.5, fontWeight: 650,
                border: `1px solid ${p.key === provider ? colors.accentBorder : colors.border}`,
                background: p.key === provider ? colors.accentSoft : "transparent", color: colors.text,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* The thesis, once, small — only while unconnected and not choosing */}
      {!connected && !picking && (
        <div style={{ fontSize: 11.5, color: colors.textFaded, marginTop: 8, lineHeight: 1.5 }}>
          Your photos live in <b style={{ color: colors.textMuted }}>your</b> cloud — PullUp just renders the room from them.
        </div>
      )}
    </div>
  );
}

// The host's view of the event's COLLECTIVE conversation, organised into TOPICS
// (host holds the pen — can open new topics). Real data, above the mockup below.
// The host's window into the darkroom — what guests shared at the event. Hidden
// until there's something to show (it fills as people drop photos in the room).
// The darkroom — peer-shared photos. Same block for host and guest; the host
// reads via the owner endpoint, a guest reads (and, if their tier allows it,
// uploads) via the room endpoints — all session-resolved, no email box.
function Darkroom({ eventId, isHost, canUpload }) {
  const [photos, setPhotos] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const load = useCallback(() => {
    const req = isHost
      ? authenticatedFetch(`/host/events/${eventId}/darkroom`).then((r) => (r.ok ? r.json().then((d) => d.photos || []) : []))
      : authenticatedFetch(`/p/${eventId}/interior`).then((r) => (r.ok ? r.json().then((d) => d.photos || []) : []));
    req.then(setPhotos).catch(() => setPhotos([]));
  }, [eventId, isHost]);
  useEffect(() => { load(); }, [load]);

  async function add(file) {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
      const r = await authenticatedFetch(`/p/${eventId}/upload`, { method: "POST", body: JSON.stringify({ dataUrl }) });
      if (r.ok) load();
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const has = photos && photos.length > 0;
  if (!canUpload && !has) return null; // read-only + empty → nothing to show
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: colors.textFaded, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          The darkroom{has ? ` · ${photos.length}` : ""}
        </span>
        {canUpload && (
          <>
            <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={(e) => add(e.target.files?.[0])} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ fontSize: 12, fontWeight: 700, color: colors.accent, background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, borderRadius: 999, padding: "5px 12px", cursor: uploading ? "wait" : "pointer" }}>
              {uploading ? "Adding…" : "+ Add photo"}
            </button>
          </>
        )}
      </div>
      {has ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
          {photos.slice(0, 12).map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer" title={p.by || ""} style={{ aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: colors.surfaceMuted, display: "block" }}>
              {p.url && <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </a>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: colors.textMuted }}>No photos yet — drop the first one.</div>
      )}
    </div>
  );
}

// ONE room body for everyone. Host and guest see the same room — the host just
// reaches it through the owner endpoints (and holds the pen: create topics,
// connect storage, the roster faces). A guest reaches the same conversation +
// darkroom through the room endpoints, session-resolved (no email box).
function RoomSpace({ eventId, roster, isHost, permissions, meName }) {
  const api = useMemo(() => (isHost ? {
    loadChannels: () => authenticatedFetch(`/host/events/${eventId}/channels`).then((r) => (r.ok ? r.json().then((d) => d.channels || []) : [])),
    loadMessages: (cid) => authenticatedFetch(`/host/events/${eventId}/space?channelId=${cid}`).then((r) => (r.ok ? r.json().then((d) => d.messages || []) : [])),
    post: (cid, body) => authenticatedFetch(`/host/events/${eventId}/space`, { method: "POST", body: JSON.stringify({ body, channelId: cid }) }).then((r) => (r.ok ? r.json().then((d) => d.messages || []) : [])),
    createTopic: (name) => authenticatedFetch(`/host/events/${eventId}/channels`, { method: "POST", body: JSON.stringify({ name }) }).then((r) => (r.ok ? r.json().then((d) => d.channels || null) : null)),
  } : {
    loadChannels: () => authenticatedFetch(`/p/${eventId}/channels`).then((r) => (r.ok ? r.json().then((d) => d.channels || []) : [])),
    loadMessages: (cid) => authenticatedFetch(`/p/${eventId}/space?channelId=${cid}`).then((r) => (r.ok ? r.json().then((d) => d.messages || []) : [])),
    post: (cid, body) => authenticatedFetch(`/p/${eventId}/space`, { method: "POST", body: JSON.stringify({ body, channelId: cid }) }).then((r) => (r.ok ? r.json().then((d) => d.messages || []) : [])),
    createTopic: null, // host holds the pen
  }), [eventId, isHost]);

  const here = roster?.pulledUp || [];
  const canPost = isHost || permissions?.post !== false;

  return (
    <div style={{ marginBottom: "24px", border: `1px solid ${colors.borderStrong}`, borderRadius: "18px", padding: "18px 20px", background: colors.background, boxShadow: "0 1px 2px rgba(10,10,10,0.03), 0 12px 32px rgba(10,10,10,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: here.length ? "13px" : "14px" }}>
        <div style={{ width: 28, height: 28, borderRadius: "9px", background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <MessageSquare size={15} color={colors.accent} strokeWidth={2.4} />
        </div>
        <div style={{ fontSize: "15px", fontWeight: 750, color: colors.text, letterSpacing: "-0.01em" }}>
          The Room
          <span style={{ fontSize: "12.5px", fontWeight: 500, color: colors.textFaded, letterSpacing: 0 }}> · a closed circle — only people who pulled up</span>
        </div>
      </div>

      {/* The people in the circle — faces (host's roster view). */}
      {isHost && here.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "11px", marginBottom: "14px", paddingBottom: "14px", borderBottom: `1px solid ${colors.borderFaint}` }}>
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

      {/* Connect-storage / folders are the host's pen. */}
      {isHost && <StorageFolders />}

      <RoomConversation canCreateTopic={isHost} canPost={canPost} sidebar api={api} meName={meName} meIsHost={isHost} />

      <Darkroom eventId={eventId} isHost={isHost} canUpload={!isHost && permissions?.upload === true} />
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

// Host sub-roles that actually RUN the room (get the chief-of-staff view +
// edit the room's access config). reception works the door; analytics only
// reads Insights — neither manages the room itself.
const ROOM_MANAGER_ROLES = ["owner", "admin", "co_host", "editor"];

export default function EventRoomPage() {
  const { id } = useParams();
  const { setEventNav, clearEventNav } = useEventNav();
  // One URL, one permission gate. `level` decides the view: a host runs the
  // chief-of-staff surface; everyone else gets the room they earned. `role`
  // refines the host side so analytics/reception don't get the wrong chrome.
  const { user } = useAuth();
  const { loading, level, role, reason, permissions, event } = useEventAccess(id);
  const [roster, setRoster] = useState(null);
  const isHost = level === "host";
  const canManageRoom = ROOM_MANAGER_ROLES.includes(role);

  // The host view needs the roster data; load it once the gate confirms we own
  // the event. For everyone else (and analytics-only, who get sent to Insights),
  // drop any host event-nav so the shell shows no Guests/Insights/Edit tabs.
  useEffect(() => {
    if (level == null) return; // still resolving
    if (!isHost || role === "analytics") { clearEventNav(); return; }
    let alive = true;
    authenticatedFetch(`/host/events/${id}/roster`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setRoster(d);
        // Carry the REAL sub-role to the shell so the tab set matches the role.
        setEventNav({ title: d.event?.title || event?.title || "Event", status: d.event?.ended ? "PASSED" : (d.event?.status || "LIVE"), guestsCount: d.pulledUpCount, myRole: role });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [level, role, isHost, id, setEventNav, clearEventNav, event]);

  // QR walk-in: a logged-in viewer who scanned the host's live code records the
  // pull-up, then re-enters clean (replaces the old email box).
  useEffect(() => {
    if (!user) return;
    const p = new URLSearchParams(window.location.search);
    const w = p.get("w"), s = p.get("s");
    if (!w || !s) return;
    authenticatedFetch(`/p/${id}/pullup`, { method: "POST", body: JSON.stringify({ w: Number(w), s }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok) window.location.replace(`/events/${id}/room`); })
      .catch(() => {});
  }, [id, user]);

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", color: colors.textMuted, fontFamily: SF }}>
        Opening the room…
      </div>
    );
  }

  // Analytics-only collaborators don't run the room — send them to Insights.
  if (isHost && role === "analytics") {
    return <Navigate to={`/app/events/${id}/analytics`} replace />;
  }

  // ONE auth gate + ONE permission gate. Identity is ALWAYS required — even a
  // scanned live QR doesn't waive it: you must be a verified session to pull up
  // (the code proves you're at the door, the session proves who you are). The
  // live code only waives the PERMISSION gate, so a verified walk-in with no
  // prior RSVP can still pull up at the door.
  const hasLiveCode = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("w");
  // No session (real logged-out, or the admin "No session" lens) → the auth wall.
  // Carries ?w=&s= through, so after verifying, the scan retries with identity.
  if (!user || level === "no_session") {
    return <AuthGate redirectTo={`/events/${id}/room${typeof window !== "undefined" ? window.location.search : ""}`} />;
  }
  if (level === "no_access" && !hasLiveCode) {
    return <AccessGate reason={reason} event={event} eventId={id} />;
  }

  // Host AND guest fall through to the SAME room below — what differs is only
  // what each is allowed to see/do, driven by isHost + permissions.
  const when = event?.startsAt ? new Date(event.startsAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : null;
  const hasCover = !!event?.cover;
  const meName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "You";

  return (
    <div style={{ display: "flex", height: "100vh", paddingTop: "58px", boxSizing: "border-box" }}>
      <div style={{ flex: "1 1 100%", overflowY: "auto", minWidth: 0 }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: "28px 20px 60px" }}>
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
              trailing={canManageRoom ? <RoomAccessSettings eventId={id} /> : null}
            />
          </div>

          {isHost && <HostPartnerLinks event={event} />}
          {/* Event identity — ONE unified banner: cover backdrop + scrim,
              title/meta overlaid, an attached presence bar for the roster. A
              missing cover falls back to the soft gradient with ink text. */}
          <div style={{ marginBottom: "22px", borderRadius: "18px", overflow: "hidden", border: `1px solid ${colors.border}`, boxShadow: "0 1px 2px rgba(10,10,10,0.03), 0 10px 30px rgba(10,10,10,0.05)" }}>
            <div style={{ position: "relative", height: hasCover ? 196 : 132, background: hasCover ? "#1a1016" : "linear-gradient(135deg, #fde7f3 0%, #f4f4f5 55%, #e7f9f5 100%)" }}>
              {hasCover && (
                <img src={event.cover} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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
            ) : null}
          </div>

          <RoomSpace eventId={id} roster={roster} isHost={isHost} permissions={permissions} meName={meName} />
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
