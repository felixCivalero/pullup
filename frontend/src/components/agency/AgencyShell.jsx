import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { trackEvent } from "../../lib/analytics.js";
import { track } from "../../lib/track.js";
import { EyesCursor } from "../EyesCursor.jsx";
import { AGENCY_CSS } from "./agencyCss.js";
import { CONTACT, DECK_PATH, SERIES, casePath } from "./agencyData.js";
import { RequestDialog } from "./RequestDialog.jsx";
import { ScrollLine } from "./ScrollLine.jsx";
import { openRequest, rememberArrival } from "./request.js";
import { LangSwitch } from "./LangSwitch.jsx";
import { useT } from "./i18n.js";

/* The frame every agency page sits in: tone-aware nav (Services · Booklet · Cases), the
   eyes cursor, scroll-depth tracking for [data-pc-section] beats, and the
   footer with every case linked. Pages pass their own CSS via `css`. */
// The nav follows the landing page, in order — each link lands on its section
// (from other pages via /#id). Narrow screens keep Results + Offer.
const NAV = [
  ["stories", "Results"],
  ["services", "How we work", "pc-nav-wide"],
  ["toolkit", "Toolkit", "pc-nav-wide"],
  ["offer", "Offer"],
  ["deck", "Booklet", "pc-nav-booklet"],
];

export function AgencyShell({ children, css = "", hideCursor = false, cursor = true }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const t = useT();
  const [scrolled, setScrolled] = useState(false);
  const [navDark, setNavDark] = useState(true);
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
      setNavDark(dark);
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

  // First touch of the visit — so a later request can say where it came from.
  useEffect(() => {
    rememberArrival();
  }, []);

  // Phone browser chrome matches the black heroes.
  useEffect(() => {
    const theme = document.querySelector('meta[name="theme-color"]');
    const prev = theme?.getAttribute("content");
    theme?.setAttribute("content", "#000000");
    return () => {
      if (theme && prev) theme.setAttribute("content", prev);
    };
  }, []);

  const onHome = pathname === "/" || pathname === "/login";
  const goHome = () => {
    if (onHome) window.scrollTo({ top: 0, behavior: "smooth" });
    else navigate("/");
  };
  // Same-page sections scroll in place; from other pages, land on them.
  const goSection = (id, location) => {
    trackEvent("cta_click", { location });
    if (onHome) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    else navigate(`/#${id}`);
  };

  return (
    <div className="agency-root">
      <style>{AGENCY_CSS + css}</style>
      <div className="pc">
        <header
          ref={navRef}
          className={`pc-nav${scrolled ? " is-scrolled" : ""}${navDark ? " is-dark" : " is-light"}`}
        >
          <button type="button" className="pc-nav-brand" onClick={goHome} aria-label="PullUp — home">
            <img src="/pullup-textlogo.svg" alt="PullUp" />
          </button>
          <div className="pc-nav-actions">
            {NAV.map(([id, label, cls]) => (
              <button
                key={id}
                type="button"
                className={`pc-nav-link${cls ? ` ${cls}` : ""}`}
                onClick={() => goSection(id, `nav_${id}`)}
              >
                {t(label)}
              </button>
            ))}
            <button
              type="button"
              className="pc-nav-signin"
              onClick={() => {
                trackEvent("cta_click", { location: "nav_login" });
                navigate("/login");
              }}
            >
              {t("Log in")}
            </button>
            <LangSwitch />
            <button
              type="button"
              className="pc-nav-cta"
              onClick={() => {
                trackEvent("cta_click", { location: "nav_build" });
                openRequest({ source: "nav" });
              }}
            >
              {t("Build with us")}
            </button>
          </div>
        </header>

        <ScrollLine />
        {children}

        <footer className="pc-footer" data-pc-tone="dark">
          <span>PullUp &copy; {new Date().getFullYear()}</span>
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
          <nav aria-label="PullUp">
            <a
              className="pc-footer-work"
              href={DECK_PATH}
              onClick={(e) => {
                e.preventDefault();
                goSection("deck", "footer_booklet");
              }}
            >
              {t("Booklet")}
            </a>
            <a
              className="pc-footer-work"
              href="/canvas"
              onClick={(e) => {
                e.preventDefault();
                navigate("/canvas");
              }}
            >
              {t("Canvas")}
            </a>
            <a
              className="pc-footer-work"
              href="/login"
              onClick={(e) => {
                e.preventDefault();
                navigate("/login");
              }}
            >
              {t("Log in")}
            </a>
          </nav>
          <nav aria-label="Legal">
            <a href="/privacy">{t("Privacy")}</a>
            <a href="/terms">{t("Terms")}</a>
            <a href="/cookies">{t("Cookies")}</a>
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </nav>
        </footer>
        <RequestDialog />
      </div>
      {cursor && <EyesCursor hidden={hideCursor} />}
    </div>
  );
}
