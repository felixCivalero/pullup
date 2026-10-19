// The logged-in side of the site has exactly one account. The real gate is
// server-side (requireOwner on every /admin route); this is the client's copy
// of the rule so the UI never shows the admin to anyone else.
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";

export const OWNER_EMAIL = "felix@pullup.se";

export const isOwnerEmail = (email) => (email || "").trim().toLowerCase() === OWNER_EMAIL;

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
