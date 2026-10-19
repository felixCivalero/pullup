import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { API_BASE } from "../lib/env.js";
import { isOwnerEmail, useSession } from "../lib/owner.js";
import { LOGIN_CSS } from "./LoginPage.jsx";

/* /admin — Felix's side of the site. Empty for now; the tools for client
   work get built here. Entry is checked twice: the session's email here, and
   the server's own owner check (/admin/me) — a session the server refuses is
   signed out. */
export function AdminPage() {
  const session = useSession();
  const [server, setServer] = useState("checking"); // checking | ok | refused

  useEffect(() => {
    const prev = document.title;
    document.title = "Admin";
    return () => { document.title = prev; };
  }, []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    fetch(`${API_BASE}/admin/me`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((res) => {
        if (!alive) return;
        if (res.ok) setServer("ok");
        else if (res.status === 401 || res.status === 403) {
          setServer("refused");
          supabase.auth.signOut();
        } else setServer("ok"); // API hiccup — the session itself is still the owner's
      })
      .catch(() => alive && setServer("ok"));
    return () => { alive = false; };
  }, [session]);

  // Any other account that somehow holds a session is signed out on sight.
  const stranger = !!session && !isOwnerEmail(session.user?.email);
  useEffect(() => {
    if (stranger) supabase.auth.signOut();
  }, [stranger]);

  if (session === undefined) return null;
  if (!session || stranger || server === "refused") return <Navigate to="/login" replace />;
  if (server === "checking") return null;

  return (
    <main className="lg ad">
      <style>{LOGIN_CSS + ADMIN_CSS}</style>
      <header>
        <h1>Admin</h1>
        <button type="button" className="lg-back" onClick={() => supabase.auth.signOut()}>Logga ut</button>
      </header>
    </main>
  );
}

const ADMIN_CSS = `
  .ad { place-items: start stretch; padding: 24px clamp(16px, 5vw, 56px); }
  .ad header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
  .ad h1 { margin: 0; }
`;
