import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowRight } from "lucide-react";
import { trackEvent } from "../../lib/analytics.js";
import { DECK_PATH, DECK_PDF } from "./agencyData.js";
import { Reveal } from "./Reveal.jsx";
import { useT } from "./i18n.js";

/* The booklet, open: read it on /booklet or take the PDF. No email gate. */
export function DeckTeaser({ source = "landing" }) {
  const navigate = useNavigate();
  const t = useT();
  const open = (e) => {
    e.preventDefault();
    trackEvent("cta_click", { location: `deck_teaser_${source}` });
    navigate(DECK_PATH);
  };

  return (
    <section id="deck" className="pc-section pc-rule pc-deck" data-pc-section="deck" data-pc-order="85">
      <div className="pc-wrap pc-deck-in">
        <div className="pc-deck-copy">
          <p className="pc-label">{t("The booklet · open")}</p>
          <Reveal>
            <h2 className="pc-h2">{t("Where do we want to go — and who do we need to be to get there?")}</h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="pc-deck-lede">
              {t("Getting there isn't a plan you finish — it's a decision you take every day: who we are. A brand is held by many people, so that decision has to be taken together. The booklet shows how one system aligns them, from a founder to a global brand.")}
            </p>
          </Reveal>
          <div className="pc-deck-actions">
            <a className="pc-btn pc-btn-dark" href={DECK_PATH} onClick={open}>
              {t("Read the booklet")}
              <ArrowRight size={18} strokeWidth={1.75} />
            </a>
            <a
              className="pc-btn pc-btn-line"
              href={DECK_PDF}
              download="The Production Core - PullUp booklet.pdf"
              onClick={() => trackEvent("deck_download", { source })}
            >
              PDF
              <ArrowDown size={18} strokeWidth={1.75} />
            </a>
          </div>
        </div>

        <a href={DECK_PATH} onClick={open} className="pc-deck-stack" aria-label={t("Read the booklet")}>
          <img src="/deck-preview/system.webp" alt="" className="pc-deck-slide s3" loading="lazy" decoding="async" />
          <img src="/deck-preview/who.webp" alt="" className="pc-deck-slide s2" loading="lazy" decoding="async" />
          <img src="/deck-preview/cover.webp" alt="" className="pc-deck-slide s1" loading="lazy" decoding="async" />
        </a>
      </div>
    </section>
  );
}
