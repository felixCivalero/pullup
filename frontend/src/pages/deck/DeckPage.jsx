import { useEffect, useLayoutEffect, useRef } from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { AgencyShell } from "../../components/agency/AgencyShell.jsx";
import { CONTACT, DECK_PDF, mailto } from "../../components/agency/agencyData.js";
import { trackEvent } from "../../lib/analytics.js";
import slidesHtml from "./slides.html?raw";
import "./deck.css";

/* The deck, open to read — no email gate. slides.html is the single source:
   this page renders it (each slide scaled into a 16:9 frame, reflowed on
   phones) and docs/deck/build.mjs prints the same markup to the PDF. */
const SLIDES = slidesHtml.split(/(?=<section)/).filter((s) => s.startsWith("<section"));

const CSS = `
  .dk-head { padding: calc(64px + env(safe-area-inset-top, 0px) + clamp(48px, 8vw, 104px)) 0 clamp(40px, 6vw, 72px); }
  .dk-title { font-size: clamp(40px, 6.4vw, 88px); font-weight: 600; line-height: 0.98; letter-spacing: -0.04em; max-width: 15ch; }
  .dk-lede { margin-top: 24px; font-size: clamp(17px, 1.6vw, 20px); line-height: 1.55; color: #333; max-width: 52ch; }
  .dk-actions { margin-top: 32px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .dk-meta { font-size: 13px; color: var(--pc-grey); }
  .dk-slides { display: grid; gap: clamp(16px, 2.4vw, 32px); padding-bottom: clamp(72px, 10vw, 128px); }
  .dk-end { border-top: 1px solid var(--pc-line); padding: clamp(48px, 7vw, 88px) 0 clamp(72px, 10vw, 120px); display: flex; flex-wrap: wrap; gap: 12px; }
  @media (max-width: 640px) { .dk-actions .pc-btn, .dk-end .pc-btn { width: 100%; } }
`;

export default function DeckPage() {
  const listRef = useRef(null);

  // --k scales every 1920×1080 slide to its frame's width.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const fit = () => {
      const w = list.querySelector(".deck-frame")?.clientWidth || list.clientWidth;
      list.style.setProperty("--k", String(w / 1920));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(list);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    document.title = "The Production Core — the deck · PullUp";
    trackEvent("deck_view", {});
  }, []);

  const download = (location) => trackEvent("deck_download", { source: `deck_page_${location}` });

  return (
    <AgencyShell css={CSS}>
      <main>
        <header className="dk-head" data-pc-section="deck_head" data-pc-order="1">
          <div className="pc-wrap">
            <p className="pc-label">The deck</p>
            <h1 className="dk-title">The Production Core</h1>
            <p className="dk-lede">
              Where do we want to go — and who do we need to be to get there? A brand is held by many
              people, so the answer is a decision they take together, every day. Read it here, or take the PDF.
            </p>
            <div className="dk-actions">
              <a className="pc-btn pc-btn-dark" href={DECK_PDF} download onClick={() => download("top")}>
                Download PDF
                <ArrowDown size={18} strokeWidth={1.75} />
              </a>
              <span className="dk-meta">{SLIDES.length} slides</span>
            </div>
          </div>
        </header>

        <div className="pc-wrap">
          <div className="dk-slides deck" ref={listRef} data-pc-section="deck_slides" data-pc-order="2">
            {SLIDES.map((html, i) => (
              <div key={i} className="deck-frame" dangerouslySetInnerHTML={{ __html: html }} />
            ))}
          </div>
          <div className="dk-end">
            <a className="pc-btn pc-btn-dark" href={mailto("The Production Core — trust period")}>
              Start the trust period
              <ArrowRight size={18} strokeWidth={1.75} />
            </a>
            <a className="pc-btn pc-btn-line" href={DECK_PDF} download onClick={() => download("end")}>
              Download PDF
              <ArrowDown size={18} strokeWidth={1.75} />
            </a>
            <a className="pc-btn pc-btn-line" href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </div>
        </div>
      </main>
    </AgencyShell>
  );
}
