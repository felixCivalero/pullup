// Anyone can have an account (an organiser of their own events); one account
// is the owner, who also has the pages only Felix uses. The real gates are
// server-side (requireUser / requireOwner); this is the client's copy of the
// owner rule, so the UI only shows those pages to him.
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";

export const OWNER_EMAIL = "felix@pullup.se";

export const isOwnerEmail = (email) => (email || "").trim().toLowerCase() === OWNER_EMAIL;

// Where a signed-in person lands: the owner on his statistics, an organiser
// on their events.
export const homeFor = (email) => (isOwnerEmail(email) ? "/admin" : "/admin/events");

// A ?next= to return to after signing in: only our own pages, never another site.
export const safeNext = (next) => (typeof next === "string" && /^\/(?!\/)[\w\-/?=&%.]*$/.test(next) ? next : null);

// The current Supabase session, kept live. `undefined` while it loads.
export function useSession() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next || null));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return session;
}
