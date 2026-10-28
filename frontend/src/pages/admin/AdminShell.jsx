import { useEffect, useState } from "react";
import { Navigate, NavLink, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { supabase } from "../../lib/supabase.js";
import { authenticatedFetch } from "../../lib/api.js";
import { isOwnerEmail, useSession } from "../../lib/owner.js";
import { BrandContext, setCurrentBrandId, useBrandId } from "../../lib/brand.js";
import { ToastProvider } from "../../components/Toast.jsx";
import { BrandSwitcher } from "../../components/admin/BrandSwitcher.jsx";
import { Onboarding } from "../../components/admin/Onboarding.jsx";

/* Every /admin page renders inside this: the sign-in gate + the top bar.
   Any signed-in person is an organiser and gets their events, CRM, mail and
   the assistants they've connected; the owner also gets his own pages
   (marked owner below). The server confirms the session (/admin/me) once per
   user; a session it refuses is signed out. It also says which brands the
   account runs: a new account (no brand yet) gets the start (Onboarding),
   everyone else the brand switcher, and each page is drawn for the brand
   picked there. `fill` = the page takes the whole viewport under the bar. */
const NAV = [
  ["/admin", "Statistik", "owner"],
  ["/admin/sales", "Sälj", "owner"],
  ["/admin/projects", "Projekt", "owner"],
  ["/admin/events", "Event"],
  ["/admin/people", "CRM"],
  ["/admin/mail", "Mejl"],
  ["/admin/agents", "Agenter"],
  ["/admin/archi", "Archi", "owner"],
];
// Side project, not the main work: kept apart on the right, in orange.
const SIDE = ["/admin/stockholm", "Stockholm"];
const OWNER_PATHS = ["/admin/sales", "/admin/projects", "/admin/archi", "/admin/stockholm"];
const ownerPage = (path) => path === "/admin" || path === "/admin/" || OWNER_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

// The server check runs once per signed-in user, not on every page switch:
// what it said about the account is kept here.
let verified = { userId: null, me: null };

export function AdminShell({ title, fill = false, children }) {
  const session = useSession();
  const { pathname } = useLocation();
  const [server, setServer] = useState("checking"); // checking | ok | refused
  const [loadedMe, setMe] = useState(null);
  const brandId = useBrandId();
  const owner = !!session && isOwnerEmail(session.user?.email);
  const isVerified = !!session && session.user?.id === verified.userId;
  const me = loadedMe || (isVerified ? verified.me : null);

  // Felix's own browser: his clicks on the links in his outreach mail must
  // not show up in Sälj as a prospect's visit (lib/track.js reads this).
  useEffect(() => {
    if (!owner) return;
    try { localStorage.setItem("pullup.self", "1"); } catch { /* storage blocked */ }
  }, [owner]);

  useEffect(() => {
    const prev = document.title;
    document.title = `${title} — Admin`;
    return () => { document.title = prev; };
  }, [title]);

  // The account: brands, the brand in use (kept in step with the server's
  // pick), whether anything's been made yet.
  async function loadMe() {
    const res = await authenticatedFetch("/admin/me");
    if (res.status === 401 || res.status === 403) return { refused: true };
    if (!res.ok) return { me: null };
    const data = await res.json();
    verified = { userId: session.user.id, me: data };
    setMe(data);
    if (data.brands?.length && !data.brands.some((b) => b.id === brandId)) setCurrentBrandId(data.brand || data.brands[0].id);
    return { me: data };
  }

  useEffect(() => {
    if (!session) return undefined;
    if (isVerified) return undefined;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set once the request answers
    loadMe()
      .then(({ refused }) => {
        if (!alive) return;
        if (refused) {
          setServer("refused");
          supabase.auth.signOut();
        } else {
          setServer("ok"); // an API hiccup doesn't lock the owner out
        }
      })
      .catch(() => alive && setServer("ok"));
    return () => { alive = false; };
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // While the session and the server check resolve: say so, never a blank page.
  const waiting = <p style={{ font: "14px -apple-system, sans-serif", color: "#6e6e73", padding: 24, margin: 0 }}>Laddar…</p>;
  if (session === undefined) return waiting;
  if (!session || server === "refused") return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />;
  if (server === "checking" && !isVerified) return waiting;
  if (!owner && ownerPage(pathname)) return <Navigate to="/admin/events" replace />;
  const brands = me?.brands || [];
  const starting = !!me && !owner && brands.length === 0;
  const current = brands.find((b) => b.id === brandId) || brands.find((b) => b.id === me?.brand) || brands[0] || null;

  return (
    <ToastProvider>
      <div className={`ad${fill ? " ad-fill" : ""}`}>
        <style>{ADMIN_CSS}</style>
        <header className="ad-bar">
          <nav>
            {!starting && NAV.filter(([, , only]) => owner || only !== "owner").map(([to, label]) => (
              <NavLink key={to} to={to} end={to === "/admin"} className={({ isActive }) => (isActive ? "is-on" : undefined)}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ad-side">
            {brands.length > 0 && <BrandSwitcher brands={brands} current={brandId || me?.brand} onChange={loadMe} onSignOut={() => supabase.auth.signOut()} />}
            {owner && <NavLink to={SIDE[0]} className={({ isActive }) => `ad-stockholm${isActive ? " is-on" : ""}`}>{SIDE[1]}</NavLink>}
            <button type="button" className={brands.length > 0 ? "ad-out has-menu" : "ad-out"} onClick={() => supabase.auth.signOut()} aria-label="Logga ut" title="Logga ut">
              <span className="ad-out-text">Logga ut</span>
              <LogOut className="ad-out-icon" size={17} />
            </button>
          </div>
        </header>
        {starting ? (
          <main className="ad-main"><Onboarding email={session.user?.email} onDone={loadMe} /></main>
        ) : (
          // Pages that show one brand's things redraw when it changes (App.jsx, ByBrand).
          <main className="ad-main">
            <BrandContext.Provider value={current}>{children}</BrandContext.Provider>
          </main>
        )}
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
    .ad-out.has-menu { display: none; }
    .ad-bar nav a { font-size: 13.5px; padding: 7px 9px; }
  }
  .ad-fill .ad-main { position: fixed; top: 56px; left: 0; right: 0; bottom: 0; overflow: hidden; }
`;
