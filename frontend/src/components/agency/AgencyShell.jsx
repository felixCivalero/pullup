import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { trackEvent } from "../../lib/analytics.js";
import { track } from "../../lib/track.js";
import { EyesCursor } from "../EyesCursor.jsx";
import { AGENCY_CSS } from "./agencyCss.js";
import { CASES, CONTACT, casePath } from "./agencyData.js";

/* The frame every agency page sits in: tone-aware nav (Work + Log in), the
   eyes cursor, scroll-depth tracking for [data-pc-section] beats, and the
   footer with every case linked. Pages pass their own CSS via `css`. */
export function AgencyShell({ children, css = "", hideCursor = false, cursor = true }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
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
  const goWork = () => {
    trackEvent("cta_click", { location: "nav_work" });
    if (onHome) document.getElementById("work")?.scrollIntoView({ behavior: "smooth", block: "start" });
    else navigate("/#work");
  };

  // Every agency page ends with the deck gate (#deck) — jump there in place.
  const goDeck = () => {
    if (!document.getElementById("deck")) {
      navigate("/#deck");
      return;
    }
    trackEvent("cta_click", { location: "nav_deck" });
    document.getElementById("deck")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
            <button
              type="button"
              className="pc-nav-link"
              aria-current={pathname === "/manifesto" ? "page" : undefined}
              onClick={() => {
                trackEvent("cta_click", { location: "nav_manifesto" });
                navigate("/manifesto");
              }}
            >
              Manifesto
            </button>
            <button type="button" className="pc-nav-link" onClick={goWork}>
              Work
            </button>
            <button type="button" className="pc-nav-link pc-nav-deck" onClick={goDeck}>
              Deck
            </button>
            <button
              type="button"
              className="pc-nav-link pc-nav-canvas"
              aria-current={pathname.startsWith("/canvas") ? "page" : undefined}
              onClick={() => {
                trackEvent("cta_click", { location: "nav_canvas" });
                navigate("/canvas");
              }}
            >
              Canvas
            </button>
            <button
              type="button"
              className="pc-nav-login"
              onClick={() => {
                trackEvent("cta_click", { location: "nav_login" });
                navigate("/login");
              }}
            >
              Log in
            </button>
          </div>
        </header>

        {children}

        <footer className="pc-footer" data-pc-tone="dark">
          <span>PullUp &copy; {new Date().getFullYear()}</span>
          <nav aria-label="Work">
            {CASES.map((c) => (
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
              href="/manifesto"
              onClick={(e) => {
                e.preventDefault();
                navigate("/manifesto");
              }}
            >
              Manifesto
            </a>
            <a
              className="pc-footer-work"
              href="/canvas"
              onClick={(e) => {
                e.preventDefault();
                navigate("/canvas");
              }}
            >
              Canvas
            </a>
          </nav>
          <nav aria-label="Legal">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/cookies">Cookies</a>
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </nav>
        </footer>
      </div>
      {cursor && <EyesCursor hidden={hideCursor} />}
    </div>
  );
}
