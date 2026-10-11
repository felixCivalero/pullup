import { ArrowUpRight } from "lucide-react";
import { trackEvent } from "../../lib/analytics.js";
import { OFFER } from "./agencyData.js";
import { openRequest } from "./request.js";
import { Reveal } from "./Reveal.jsx";

// The closing offer — the one package, at the end of every case page.
export function AgencyOffer({
  id,
  source = "landing",
  heading = "Your brand could be the next story.",
  sub = "We take on a few brands and creators at a time. Your daily work and your vision are already the best material you have — we turn them into content that grows.",
}) {
  return (
    <section
      id={id}
      className="pc-section pc-dark pc-close"
      data-pc-tone="dark"
      data-pc-section="offer"
      data-pc-order="90"
    >
      <div className="pc-wrap">
        <Reveal>
          <h2 className="pc-h2 pc-h2-xl">{heading}</h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="pc-close-sub">{sub}</p>
        </Reveal>
        <Reveal delay={0.12}>
          <div className="pc-offer pc-offer-one">
            <div className="pc-offer-main">
              <p className="pc-offer-name">{OFFER.name}</p>
              <p className="pc-offer-price">
                {OFFER.price}
                <span>{OFFER.cadence}</span>
              </p>
              <p className="pc-offer-body">{OFFER.body}</p>
              <button
                type="button"
                className="pc-btn pc-btn-light"
                onClick={() => {
                  trackEvent("cta_click", { location: "offer_trust_period", source });
                  openRequest({ source: `offer_${source}` });
                }}
              >
                {OFFER.cta}
                <ArrowUpRight size={18} strokeWidth={1.75} />
              </button>
            </div>
            <dl className="pc-offer-terms">
              {OFFER.terms.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
