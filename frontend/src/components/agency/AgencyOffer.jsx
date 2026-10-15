import { ArrowUpRight, Check } from "lucide-react";
import { trackEvent } from "../../lib/analytics.js";
import { OFFER } from "./agencyData.js";
import { useLocalized, useT } from "./i18n.js";
import { openRequest } from "./request.js";
import { Reveal } from "./Reveal.jsx";

// The one offer — $3,000 a month, everything included. Landing (after What
// you get) and the end of every case page.
export function AgencyOffer({
  id,
  chapter, // [n, label] — renders the landing chapter opener
  source = "landing",
  heading = "Your brand could be the next story.",
  sub = "We take on a few brands and creators at a time. Your daily work and your vision are already the best material you have — we turn them into content that grows.",
}) {
  const t = useT();
  const offer = useLocalized(OFFER);
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
          <div className="pc-offer pc-offer-one">
            <div className="pc-offer-main">
              <p className="pc-offer-name">{offer.label}</p>
              <p className="pc-offer-price">
                {offer.price}
                <span>{offer.cadence}</span>
              </p>
              <p className="pc-offer-body">{offer.line}</p>
              <dl className="pc-offer-terms">
                {offer.terms.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                className="pc-btn pc-offer-cta"
                onClick={() => {
                  trackEvent("cta_click", { location: "offer", source });
                  openRequest({ source: `offer_${source}` });
                }}
              >
                {offer.cta}
                <ArrowUpRight size={18} strokeWidth={1.75} />
              </button>
            </div>
            <div className="pc-offer-inc">
              <p className="pc-offer-inc-k">{t("What's included")}</p>
              <ul>
                {offer.includes.map((x) => (
                  <li key={x}>
                    <Check size={18} strokeWidth={2.25} />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
