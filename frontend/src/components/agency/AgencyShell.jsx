import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { trackEvent } from "../../lib/analytics.js";
import { initTracking, track } from "../../lib/track.js";
import { initEngagement, setEngagementPage } from "../../lib/engagement.js";
import { EyesCursor } from "../EyesCursor.jsx";
import { AGENCY_CSS } from "./agencyCss.js";
import { FELIX_PATH, SERIES, casePath } from "./agencyData.js";
import { MailLink } from "./MailLink.jsx";
import { RequestDialog } from "./RequestDialog.jsx";
import { ConsentBanner } from "./ConsentBanner.jsx";
import { openRequest, rememberArrival } from "./request.js";
import { LangSwitch } from "./LangSwitch.jsx";
import { useT } from "./i18n.js";

/* The frame every agency page sits in: tone-aware nav (name · language · Work with me), the
   eyes cursor, scroll-depth tracking for [data-pc-section] beats, and the
   footer with every case linked. Pages pass their own CSS via `css`.
   `brand` = PullUp's own pages (/, /stockholm): the nav and footer speak as
   PullUp, not as Felix, and the name goes to /. */
export function AgencyShell({ children, css = "", hideCursor = false, cursor = true, home = false, brand = false }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const t = useT();
  const [scrolled, setScrolled] = useState(false);
  const [navDark, setNavDark] = useState(true);
  const [navBlend, setNavBlend] = useState(false);
  const navRef = useRef(null);

  // The bar takes the tone of whatever section sits under it — black over
  // [data-pc-tone="dark"] beats, white over the rest — so it never sits on text.
  useEffect(() => {
    let raf = null;
    const compute = () => {
      raf = null;
      setScrolled(window.scrollY > 8);
      const probe = (navRef.current?.getBoundingClientRect().bottom || 64) - 1;
      let dark = false;
      document.querySelectorAll("[data-pc-tone='dark']").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top <= probe && r.bottom > probe) dark = true;
      });
      // [data-pc-blend] scenes fade their own background; over them the bar
      // stays clear and follows their --pc-tone instead of flipping.
      let blend = false;
      document.querySelectorAll("[data-pc-blend]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top <= probe && r.bottom > probe) blend = true;
      });
      setNavDark(dark);
      setNavBlend(blend);
    };
    const onScroll = () => {
      if (raf == null) raf = requestAnimationFrame(compute);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    compute();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [pathname]);

  // Scroll depth: each named beat fires section_view once per page.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const seen = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target;
          const section = el.getAttribute("data-pc-section");
          if (!section || seen.has(section)) continue;
          seen.add(section);
          track("section_view", {
            section,
            page: pathname,
            order: Number(el.getAttribute("data-pc-order")) || 0,
          });
          observer.unobserve(el);
        }
      },
      { threshold: 0.2 },
    );
    document.querySelectorAll("[data-pc-section]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname]);

  // Reading time, depth, clicks and copies per page (lib/engagement.js).
  useEffect(() => {
    initTracking();
    initEngagement();
    setEngagementPage(pathname);
  }, [pathname]);

  // First touch of the visit — so a later request can say where it came from.
  useEffect(() => {
    rememberArrival();
  }, []);

  // `home` = this page carries the landing sections itself.
  const onHome = home;

  // Phone browser chrome matches the page top: white front page, black case heroes.
  useEffect(() => {
    const theme = document.querySelector('meta[name="theme-color"]');
    const prev = theme?.getAttribute("content");
    theme?.setAttribute("content", onHome ? "#ffffff" : "#000000");
    return () => {
      if (theme && prev) theme.setAttribute("content", prev);
    };
  }, [onHome]);
  const goHome = () => {
    if (onHome) window.scrollTo({ top: 0, behavior: "smooth" });
    else navigate(brand ? "/" : FELIX_PATH);
  };

  return (
    <div className="agency-root">
      <style>{AGENCY_CSS + css}</style>
      <div className="pc">
        <header
          ref={navRef}
          className={`pc-nav${scrolled ? " is-scrolled" : ""}${navBlend ? " is-blend" : navDark ? " is-dark" : " is-light"}${brand ? " is-brand" : ""}`}
        >
          {brand ? (
            <button type="button" className="pc-nav-brand pc-nav-name pc-nav-pullup" onClick={goHome} aria-label="PullUp — home">
              <img src="/pullup-textlogo.svg" alt="PullUp" />
            </button>
          ) : (
            <button type="button" className="pc-nav-brand pc-nav-name" onClick={goHome} aria-label="Felix Civalero Stolpe — home">
              Felix<span> Civalero Stolpe</span>
            </button>
          )}
          <div className="pc-nav-actions">
            <LangSwitch />
            {/* The event platform: free accounts, the first sign-in makes one. */}
            <a
              href="/login"
              className="pc-nav-login"
              onClick={(e) => {
                e.preventDefault();
                trackEvent("cta_click", { location: "nav_login" });
                navigate("/login");
              }}
            >
              {t("Log in")}
            </a>
            <button
              type="button"
              className="pc-nav-cta"
              onClick={() => {
                trackEvent("cta_click", { location: "nav_build" });
                openRequest({ source: "nav" });
              }}
            >
              {t(brand ? "Book a meeting" : "Work with me")}
            </button>
          </div>
        </header>

        {children}

        <footer className="pc-footer" data-pc-tone="dark">
          <span>{brand ? "PullUp" : "Felix Civalero Stolpe"} &copy; {new Date().getFullYear()}</span>
          <nav aria-label="Cases">
            {SERIES.map((c) => (
              <a
                key={c.slug}
                className="pc-footer-work"
                href={casePath(c.slug)}
                aria-current={pathname === casePath(c.slug) ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(casePath(c.slug));
                }}
              >
                {c.client}
              </a>
            ))}
          </nav>
          <nav aria-label="Legal">
            <a href="/">PullUp</a>
            <a href="/stockholm">{t("Find culture in Stockholm")}</a>
            <a href="/eventverktyg">{t("PullUp – free event pages")}</a>
            <a href={FELIX_PATH}>Felix Civalero Stolpe</a>
            <a href="https://www.instagram.com/itsfelixagain/" target="_blank" rel="noopener noreferrer">Instagram</a>
            <a href="/privacy">{t("Privacy")}</a>
            <a href="/terms">{t("Terms")}</a>
            <a href="/cookies">{t("Cookies")}</a>
            <MailLink />
          </nav>
        </footer>
        <RequestDialog />
        <ConsentBanner />
      </div>
      {cursor && <EyesCursor hidden={hideCursor} />}
    </div>
  );
}
