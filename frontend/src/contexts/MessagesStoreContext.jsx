// MessagesStoreContext — the host's contacts, loaded ONCE per session and kept
// alive above the whole app. The Messages dock used to hold this in component
// state, so every unmount (close the dock, change page) meant a fresh
// "Loading…" fetch. Now the provider owns the data + the realtime feed:
//
//   · load() fetches /host/room once (deduped); the dock renders instantly
//     from cache ever after.
//   · A host-scoped person_events subscription keeps the list live: inbound
//     replies append to threads and float people up; delivery ticks patch in
//     place; a row from a person we don't know yet (new signup, new thread)
//     quietly re-pulls the room — new contacts arrive without a reload.
//   · Focus refetch is the socket-drop safety net; logout wipes the store.
//
// The hook lives in useMessagesStore.js (fast-refresh friendly split, same
// pattern as HostResourceContext).
import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "../lib/api.js";
import { useRoomRealtime } from "../lib/useRoomRealtime.js";
import { useAuth } from "./AuthContext";

// eslint-disable-next-line react-refresh/only-export-components
export const MessagesStoreContext = createContext(null);

export function MessagesStoreProvider({ children }) {
  const { user } = useAuth();
  const [people, setPeople] = useState(null); // null = never loaded
  const [roomEvents, setRoomEvents] = useState([]);
  const loadedRef = useRef(false);
  const inFlightRef = useRef(null);
  // Mirror for stale-closure-free existence checks inside realtime callbacks.
  const peopleRef = useRef(null);
  useEffect(() => { peopleRef.current = people; }, [people]);
  // Keys (clientId + server id) of bubbles the dock created this session, so a
  // realtime echo of an own send doesn't double-append. Shared with the dock.
  const sentKeysRef = useRef(new Set());

  const load = useCallback(() => {
    if (inFlightRef.current) return inFlightRef.current;
    inFlightRef.current = (async () => {
      try {
        const r = await authenticatedFetch("/host/room");
        const d = r.ok ? await r.json() : null;
        setPeople(d?.people || []);
        setRoomEvents(d?.events || []);
        loadedRef.current = true;
      } catch {
        setPeople((ps) => ps || []); // keep whatever we had; first load falls to empty
      } finally {
        inFlightRef.current = null;
      }
    })();
    return inFlightRef.current;
  }, []);

  // Load once, on first demand (the dock calls this on mount).
  const ensureLoaded = useCallback(() => {
    if (!loadedRef.current) load();
  }, [load]);

  // Safety net: realtime is the live path, but if the tab was backgrounded and
  // the socket dropped, refetch on focus so nothing is missed.
  useEffect(() => {
    const onFocus = () => { if (loadedRef.current) load(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // Account switch / logout → the store is someone else's data. Wipe it.
  useEffect(() => {
    if (!user) {
      setPeople(null);
      setRoomEvents([]);
      loadedRef.current = false;
      sentKeysRef.current = new Set();
    }
  }, [user]);

  // ── Live: the one subscription that outlives every page/dock unmount. ──
  useRoomRealtime({
    enabled: !!user,
    onMessage: ({ eventType, row }) => {
      if (!loadedRef.current) return;
      if (eventType === "UPDATE") {
        // A tick moved (sent → delivered → read / failed). Patch in place.
        setPeople((ps) => ps && ps.map((p) => p.id !== row.personId ? p : { ...p, thread: (p.thread || []).map((m) => (m.id === row.id ? { ...m, status: row.status } : m)) }));
        return;
      }
      // INSERT
      if (row.from === "you") {
        // The dock's own send echoing back — it reconciles its optimistic copy
        // itself; we just remember the server id and don't double-append. An
        // outbound from ANOTHER device (unknown key) falls through and appends.
        if (row.clientId && sentKeysRef.current.has(row.clientId)) {
          sentKeysRef.current.add(row.id);
          return;
        }
        if (sentKeysRef.current.has(row.id)) return;
      }
      // New person we don't have yet → pull the room fresh (this is how a new
      // contact lands live); otherwise append to their thread + float them up.
      if (!(peopleRef.current || []).some((p) => p.id === row.personId)) { load(); return; }
      setPeople((ps) => ps && ps.map((p) => {
        if (p.id !== row.personId) return p;
        if ((p.thread || []).some((m) => m.id === row.id)) return p;
        return {
          ...p,
          thread: [...(p.thread || []), { ...row, time: "now" }],
          lastMessage: { from: row.from, text: row.text || "", time: "now" },
          lastMessageAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          awaitingReply: row.from !== "you",
        };
      }));
    },
    // Notable non-message beats (rsvp / waitlist_join / attended) from someone
    // not in the list = a brand-new contact → pull them in live.
    onNotable: ({ row }) => {
      if (!loadedRef.current || !row?.person_id) return;
      if (!(peopleRef.current || []).some((p) => p.id === row.person_id)) load();
    },
  });

  return (
    <MessagesStoreContext.Provider value={{ people, setPeople, roomEvents, ensureLoaded, reload: load, sentKeys: sentKeysRef }}>
      {children}
    </MessagesStoreContext.Provider>
  );
}
