import { useState, useEffect } from "react";
import { authenticatedFetch, publicFetch } from "./api.js";
import { supabase } from "./supabase.js";

// Page-shaped load for the event Room: ONE call (GET /events/:id/room-view)
// returns the access verdict PLUS everything the page needs for first paint —
// roster (host), co-presence (guest, seeWho-gated), channels, and the Main
// feed. Same gate semantics as useEventAccess (which other surfaces keep
// using); this hook just rides the composed payload so the Room doesn't
// stitch 4 round-trips client-side. Message refresh stays on the /space poll.
export function useEventRoomView(eventId) {
  const [state, setState] = useState({
    loading: true,
    level: null,
    verified: false,
    role: null,
    realHost: false,
    reason: null,
    phase: null,
    event: null,
    permissions: null,
    personId: null,
    roster: null,
    channels: null,
    messages: null,
    coPresent: null,
    products: null,
    content: null,
    contentCan: null,
    pages: null,
  });

  useEffect(() => {
    if (!eventId) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    let alive = true;
    const fail = () =>
      alive &&
      setState({ loading: false, level: "no_access", verified: false, role: null, realHost: false, reason: "error", phase: null, event: null, permissions: null, personId: null, roster: null, channels: null, messages: null, coPresent: null, products: null, content: null, contentCan: null, pages: null });

    // Signed in → authenticatedFetch (session drives the verdict). No session →
    // publicFetch, so the endpoint can still answer with a read-only PREVIEW of
    // the room shell (verify-to-step-in) instead of a hard wall. The server
    // never trusts the anonymous caller with anything social.
    (async () => {
      let hasSession = false;
      try {
        const { data } = await supabase.auth.getSession();
        hasSession = !!data?.session?.access_token;
      } catch { /* treat as anonymous */ }
      return (hasSession ? authenticatedFetch : publicFetch)(`/events/${eventId}/room-view`);
    })()
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (!d?.access) return fail();
        const a = d.access;
        setState({
          loading: false,
          level: a.level,
          verified: !!a.verified,
          role: a.role,
          realHost: !!a.realHost,
          reason: a.reason,
          phase: a.phase,
          event: a.event,
          permissions: a.permissions,
          personId: a.personId || null,
          roster: d.roster || null,
          channels: Array.isArray(d.channels) ? d.channels : null,
          messages: Array.isArray(d.messages) ? d.messages : null,
          coPresent: Array.isArray(d.coPresent) ? d.coPresent : null,
          products: Array.isArray(d.products) ? d.products : null,
          content: Array.isArray(d.content) ? d.content : null,
          contentCan: d.contentCan || null,
          pages: a.pages || null,
        });
      })
      .catch(fail);

    return () => {
      alive = false;
    };
  }, [eventId]);

  return state;
}
