import { useEffect, useState } from "react";
import { getConsent, setConsent } from "../../lib/consent.js";
import { useT } from "./i18n.js";

/* The cookie question, asked once: a small card at the bottom, one line of
   text and two equal buttons — Av / På. Either answer closes it; the choice
   can be changed on /cookies. It waits a moment so it never covers the hero
   as the page opens. On a phone it is one slim row (question + Read more,
   buttons beside it), so it never hides a fifth of the screen. */
export function ConsentBanner() {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (getConsent() !== null) return undefined;
    // The front page's film and sentence get the first screen to themselves:
    // there the card waits for the first scroll.
    if (window.location.pathname === "/") {
      const onScroll = () => setOpen(true);
      window.addEventListener("scroll", onScroll, { once: true, passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }
    const id = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(id);
  }, []);

  if (!open) return null;
  const choose = (on) => {
    setConsent(on);
    setOpen(false);
  };
  return (
    <div className="cb" role="dialog" aria-live="polite" aria-label={t("Cookies")}>
      <style>{CB_CSS}</style>
      <p className="cb-h">{t("Allow cookie?")}</p>
      <p className="cb-p">
        <span className="cb-long">{t("One cookie that only counts how many different people visit. Nothing else.")}{" "}</span>
        <a href="/cookies">{t("Read more")}</a>
      </p>
      <div className="cb-seg">
        <button type="button" onClick={() => choose(false)}>{t("Off")}</button>
        <button type="button" onClick={() => choose(true)}>{t("On")}</button>
      </div>
    </div>
  );
}

const CB_CSS = `
  .cb {
    position: fixed; z-index: 60; left: 16px; bottom: 16px; width: min(360px, calc(100vw - 32px)); box-sizing: border-box;
    padding: 16px 16px 14px; border-radius: 20px; background: rgba(255,255,255,0.92); color: #0a0a0a;
    -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px);
    border: 1px solid rgba(0,0,0,0.08); box-shadow: 0 12px 40px rgba(0,0,0,0.16);
    font-family: inherit; animation: cb-in 0.5s cubic-bezier(0.16,1,0.3,1);
  }
  @keyframes cb-in { from { opacity: 0; transform: translateY(16px); } }
  @media (prefers-reduced-motion: reduce) { .cb { animation: none; } }
  .cb-h { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
  .cb-p { margin: 4px 0 0; font-size: 13.5px; line-height: 1.45; color: #555; }
  .cb-p a { color: inherit; text-underline-offset: 2px; }
  .cb-seg { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 3px; padding: 3px; border-radius: 12px; background: #efeff0; }
  .cb-seg button {
    font: inherit; font-size: 14px; font-weight: 600; padding: 9px 0; border: 0; border-radius: 9px;
    background: transparent; color: #0a0a0a; cursor: pointer; transition: background-color 0.15s ease;
  }
  .cb-seg button:hover { background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
  @media (pointer: coarse) { .cb-seg button { min-height: 44px; } }
  @media (max-width: 600px) {
    .cb {
      left: 10px; right: 10px; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); width: auto;
      padding: 8px 8px 8px 14px; border-radius: 16px;
      display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 10px;
    }
    .cb-h, .cb-p { grid-column: 1; }
    .cb-h { font-size: 14px; }
    .cb-p { margin: 1px 0 0; font-size: 12.5px; }
    .cb-long { display: none; }
    .cb-seg { grid-column: 2; grid-row: 1 / span 2; margin: 0; grid-template-columns: auto auto; }
    .cb-seg button { padding: 0 16px; min-height: 44px; }
  }
`;
