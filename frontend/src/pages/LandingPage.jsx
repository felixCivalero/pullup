import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { initTracking, trackPageView } from "../lib/track.js";
import { AgencyShell } from "../components/agency/AgencyShell.jsx";
import { LANDING_CSS } from "../components/agency/landingParts.jsx";
import { FOUNDER_CSS } from "../components/agency/FounderNetwork.jsx";
import { FelixContent, FELIX_CSS } from "./FelixContent.jsx";
import { CASE_STACK_CSS } from "../components/agency/CaseStack.jsx";
import { TESTIMONIALS_CSS } from "../components/agency/Testimonials.jsx";
import { useT } from "../components/agency/i18n.js";

/* The public front door: Felix, in first person (FelixContent.jsx) — the
   cases, what clients say, who he is, his network, the one offer. This file adds
   /login's auth modal on top. */

const TITLE = "I build brands. Growth that lasts.";

/* ─── component ─── */
export function LandingPage() {
  const location = useLocation();

  useEffect(() => {
    initTracking();
    trackPageView("landing");
  }, []);
  const t = useT();
  useEffect(() => {
    const prev = document.title;
    document.title = `Felix Civalero Stolpe — ${t(TITLE)}`;
    return () => {
      document.title = prev;
    };
  }, [t]);

  // Arriving via a link from another page (/#stories, /#deck …) lands on it.
  useEffect(() => {
    const target = { "#stories": "stories", "#cases": "stories", "#work": "stories", "#why": "offer", "#services": "offer", "#how": "offer", "#tech": "tech", "#superpowers": "offer", "#offer": "offer", "#talent": "stories", "#toolkit": "stories", "#deck": "offer", "#felix": "offer", "#about": "offer", "#network": "stories", "#words": "words", "#start": "offer" }[location.hash];
    if (!target) return;
    const t = setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => clearTimeout(t);
  }, [location.hash]);

  return (
    <AgencyShell css={LANDING_CSS + FOUNDER_CSS + FELIX_CSS + CASE_STACK_CSS + TESTIMONIALS_CSS} home>
      <FelixContent />
    </AgencyShell>
  );
}
