import { useState, useEffect } from "react";
import { authenticatedFetch } from "./api.js";

// THE permission gate (frontend). One hook every surface uses to learn the
// viewer's level for an event — host | guest_pullup | guest_rsvp | no_access —
// plus the `reason` when they're out, so the UI can say it nicely and point the
// way in. Resolves by session server-side (authenticatedFetch sends the token
// when there is one); for a logged-out guest we pass the email they RSVP'd /
// pulled up with (pullup_email) so the lobby still recognises them. The endpoint
// never 401s, so this is safe whether or not you're signed in.
export function useEventAccess(eventId) {
  const [state, setState] = useState({
    loading: true,
    level: null,
    role: null,
    reason: null,
    phase: null,
    event: null,
    permissions: null,
  });

  useEffect(() => {
    if (!eventId) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    let alive = true;
    let email = "";
    try {
      email = localStorage.getItem("pullup_email") || "";
    } catch {}
    const qs = email ? `?email=${encodeURIComponent(email)}` : "";
    const fail = () =>
      alive &&
      setState({ loading: false, level: "no_access", role: null, reason: "error", phase: null, event: null, permissions: null });

    authenticatedFetch(`/events/${eventId}/access${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (!d) return fail();
        setState({
          loading: false,
          level: d.level,
          role: d.role,
          reason: d.reason,
          phase: d.phase,
          event: d.event,
          permissions: d.permissions,
        });
      })
      .catch(fail);

    return () => {
      alive = false;
    };
  }, [eventId]);

  return state;
}
