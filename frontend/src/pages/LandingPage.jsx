import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { AuthGate, resolveNext } from "../components/auth/AuthGate.jsx";
import { supabase } from "../lib/supabase.js";
import { resolveStoredSession } from "../lib/validateStoredSession.mjs";
import { initTracking, trackPageView } from "../lib/track.js";
import { AgencyShell } from "../components/agency/AgencyShell.jsx";
import { LANDING_CSS } from "../components/agency/landingParts.jsx";
import { FOUNDER_CSS } from "../components/agency/FounderNetwork.jsx";
import { FelixContent, FELIX_CSS } from "./FelixContent.jsx";
import { CASE_STACK_CSS } from "../components/agency/CaseStack.jsx";
import { useT } from "../components/agency/i18n.js";

/* The public front door: Felix, in first person (FelixContent.jsx) — the
   cases, what clients say, who he is, his network, the one offer. This file adds
   /login's auth modal on top. */

const TITLE = "I develop the people behind brands. Growth that lasts.";

/* ─── component ─── */
export function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // /login floats the auth modal over the page; everything else is the page.
  const view = useMemo(
    () => (location.pathname === "/login" ? "login" : "hero"),
    [location.pathname],
  );

  useEffect(() => {
    initTracking();
    trackPageView("landing");
  }, []);
  const t = useT();
  useEffect(() => {
    const prev = document.title;
    document.title = `PullUp — ${t(TITLE)}`;
    return () => {
      document.title = prev;
    };
  }, [t]);

  // Arriving via a link from another page (/#stories, /#deck …) lands on it.
  useEffect(() => {
    const target = { "#stories": "stories", "#cases": "stories", "#work": "stories", "#why": "about", "#services": "about", "#how": "about", "#superpowers": "offer", "#offer": "offer", "#talent": "network", "#toolkit": "network", "#deck": "about", "#felix": "about", "#about": "about", "#network": "network", "#words": "words", "#start": "offer" }[location.hash];
    if (!target) return;
    const t = setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => clearTimeout(t);
  }, [location.hash]);

  // The one auth check — only on the login action. A stored session is
  // validated server-side: valid → straight into the room; dead → cleared so
  // the form shows cleanly; unknown (network blip) → left untouched.
  useEffect(() => {
    if (view !== "login") return;
    let cancelled = false;
    (async () => {
      const { status } = await resolveStoredSession({
        auth: {
          getSession: () => supabase.auth.getSession(),
          getUser: () => supabase.auth.getUser(),
          refreshSession: () => supabase.auth.refreshSession(),
        },
      });
      if (cancelled) return;
      if (status === "valid") {
        navigate(resolveNext(searchParams), { replace: true });
      } else if (status === "dead") {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, navigate, searchParams]);

  // The auth modal locks the screen; the page itself scrolls freely.
  useEffect(() => {
    const cls = "pullup-auth-locked";
    if (view === "hero") document.body.classList.remove(cls);
    else document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [view]);

  return (
    <>
      <AgencyShell css={LANDING_CSS + FOUNDER_CSS + FELIX_CSS + CASE_STACK_CSS} hideCursor={view === "login"} home>
        <FelixContent />
      </AgencyShell>
      {view === "login" && (
        <AuthGate
          initialMode="login"
          redirectTo={resolveNext(searchParams)}
          onDismiss={() => navigate("/")}
          onSignupIntent={() => navigate("/start")}
        />
      )}
    </>
  );
}
