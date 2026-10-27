import { ArrowUpRight } from "lucide-react";
import { trackEvent } from "../../lib/analytics.js";
import { useT } from "./i18n.js";
import { openRequest } from "./request.js";
import { Reveal } from "./Reveal.jsx";

// The end of every case page: no price (Felix 2026-10-27 — every brand needs
// its own deal), just the way into a 20-minute meeting.
export function AgencyOffer({
  id,
  chapter, // [n, label] — renders the landing chapter opener
  source = "landing",
  heading = "Your brand could be the next story.",
  sub = "No ready-made package. Every brand is different, so we start with a quick meeting and see if there's something we can grow together.",
}) {
  const t = useT();
  return (
    <section
      id={id}
      className="pc-section pc-dark pc-close"
      data-pc-tone="dark"
      data-pc-section="offer"
      data-pc-order="90"
    >
      <div className="pc-wrap">
        {chapter && (
          <p className="ch-label">
            <span className="ch-n">{chapter[0]}</span>
            <span className="ch-l">{t(chapter[1])}</span>
          </p>
        )}
        <Reveal>
          <h2 className="pc-h2 pc-h2-xl">{t(heading)}</h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="pc-close-sub">{t(sub)}</p>
        </Reveal>
        <Reveal delay={0.12}>
          <button
            type="button"
            className="pc-btn pc-offer-cta"
            onClick={() => {
              trackEvent("cta_click", { location: "offer", source });
              openRequest({ source: `offer_${source}` });
            }}
          >
            {t("Book a meeting")}
            <ArrowUpRight size={18} strokeWidth={1.75} />
          </button>
        </Reveal>
      </div>
    </section>
  );
}
