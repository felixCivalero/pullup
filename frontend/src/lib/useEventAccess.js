import { useState, useEffect } from "react";
import { authenticatedFetch } from "./api.js";

// THE permission gate (frontend). One hook every surface uses to learn the
// viewer's level for an event — host | guest_pullup | guest_rsvp | no_access —
// plus the `reason` when they're out, so the UI can say it nicely and point the
// way in. Resolves by the VERIFIED session only (authenticatedFetch sends the
// token when there is one). A logged-out viewer has no trusted identity → the
// endpoint returns no_session and the surface shows the AuthGate ("verify your
// account"). We deliberately no longer pass a raw `?email=`: an unverified
// email must never grant access (it let anyone probe another person's room).
// The endpoint never 401s, so this is safe whether or not you're signed in.
export function useEventAccess(eventId) {
  const [state, setState] = useState({
    loading: true,
    level: null,
    role: null,
    realHost: false,
    reason: null,
    phase: null,
    event: null,
    permissions: null,
    personId: null,
  });

  useEffect(() => {
    if (!eventId) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    let alive = true;
    const fail = () =>
      alive &&
      setState({ loading: false, level: "no_access", role: null, realHost: false, reason: "error", phase: null, event: null, permissions: null, personId: null });

    authenticatedFetch(`/events/${eventId}/access`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (!d) return fail();
        setState({
          loading: false,
          level: d.level,
          role: d.role,
          realHost: !!d.realHost,
          reason: d.reason,
          phase: d.phase,
          event: d.event,
          permissions: d.permissions,
          personId: d.personId || null,
        });
      })
      .catch(fail);

    return () => {
      alive = false;
    };
  }, [eventId]);

  return state;
}
