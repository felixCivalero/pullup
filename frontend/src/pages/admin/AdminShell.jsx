import { useEffect, useState } from "react";
import { Navigate, NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import { supabase } from "../../lib/supabase.js";
import { authenticatedFetch } from "../../lib/api.js";
import { isOwnerEmail, useSession } from "../../lib/owner.js";
import { ToastProvider } from "../../components/Toast.jsx";

/* Every /admin page renders inside this: the owner gate + the top bar.
   Entry is checked twice — the session's email here, and the server's own
   owner check (/admin/me); a session the server refuses is signed out.
   `fill` = the page takes the whole viewport under the bar (the timeline). */
const NAV = [
  ["/admin", "Statistik"],
  ["/admin/sales", "Sälj"],
  ["/admin/timeline", "Tidslinje"],
];
// Side project, not the main work: kept apart on the right, in orange.
const SIDE = ["/admin/stockholm", "Stockholm"];

// The server check runs once per signed-in user, not on every page switch.
let verifiedUserId = null;

export function AdminShell({ title, fill = false, children }) {
  const session = useSession();
  const [server, setServer] = useState("checking"); // checking | ok | refused
  const stranger = !!session && !isOwnerEmail(session.user?.email);
  const verified = !!session && session.user?.id === verifiedUserId;

  useEffect(() => {
    const prev = document.title;
    document.title = `${title} — Admin`;
    return () => { document.title = prev; };
  }, [title]);

  useEffect(() => {
    if (stranger) supabase.auth.signOut();
  }, [stranger]);

  useEffect(() => {
    if (!session || stranger || verified) return undefined;
    let alive = true;
    authenticatedFetch("/admin/me")
      .then((res) => {
        if (!alive) return;
        if (res.status === 401 || res.status === 403) {
          setServer("refused");
          supabase.auth.signOut();
        } else {
          if (res.ok) verifiedUserId = session.user.id;
          setServer("ok"); // an API hiccup doesn't lock the owner out
        }
      })
      .catch(() => alive && setServer("ok"));
    return () => { alive = false; };
  }, [session, stranger, verified]);

  if (session === undefined) return null;
  if (!session || stranger || server === "refused") return <Navigate to="/login" replace />;
  if (server === "checking" && !verified) return null;

  return (
    <ToastProvider>
      <div className={`ad${fill ? " ad-fill" : ""}`}>
        <style>{ADMIN_CSS}</style>
        <header className="ad-bar">
          <nav>
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? "is-on" : undefined)}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ad-side">
            <NavLink to={SIDE[0]} className={({ isActive }) => `ad-stockholm${isActive ? " is-on" : ""}`}>{SIDE[1]}</NavLink>
            <button type="button" onClick={() => supabase.auth.signOut()} aria-label="Logga ut" title="Logga ut">
              <span className="ad-out-text">Logga ut</span>
              <LogOut className="ad-out-icon" size={17} />
            </button>
          </div>
        </header>
        <main className="ad-main">{children}</main>
      </div>
    </ToastProvider>
  );
}

const ADMIN_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap');
  body { margin: 0; background: #fff; }
  .ad { min-height: 100dvh; color: #0a0a0a; font-family: "Inter Tight", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; }
  .ad-bar { position: sticky; top: 0; z-index: 50; height: 56px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 0 clamp(16px, 4vw, 40px); background: rgba(255,255,255,0.92); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(0,0,0,0.08); }
  .ad-bar nav { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; }
  .ad-bar nav a { padding: 7px 12px; border-radius: 999px; font-size: 14px; font-weight: 600; color: #6e6e73; text-decoration: none; white-space: nowrap; }
  .ad-bar nav a:hover { color: #0a0a0a; }
  .ad-bar nav a.is-on { background: #0a0a0a; color: #fff; }
  .ad-side { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
  .ad-stockholm { padding: 7px 12px; border-radius: 999px; font-size: 14px; font-weight: 600; text-decoration: none; white-space: nowrap; color: #D9480F; background: rgba(217,72,15,0.08); }
  .ad-stockholm:hover { background: rgba(217,72,15,0.14); }
  .ad-stockholm.is-on { background: #D9480F; color: #fff; }
  .ad-bar button { font: inherit; font-size: 13px; color: #6e6e73; background: none; border: 0; cursor: pointer; white-space: nowrap; }
  .ad-bar button:hover { color: #0a0a0a; }
  .ad-out-icon { display: none; }
  @media (max-width: 520px) {
    .ad-bar { gap: 8px; }
    .ad-bar nav { gap: 0; min-width: 0; }
    .ad-bar nav a, .ad-stockholm { padding: 7px 10px; }
    .ad-side { gap: 8px; }
    .ad-out-text { display: none; }
    .ad-out-icon { display: block; }
  }
  .ad-fill .ad-main { position: fixed; top: 56px; left: 0; right: 0; bottom: 0; overflow: hidden; }
`;
