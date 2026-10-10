import { ArrowUpRight } from "lucide-react";
import { trackEvent } from "../../lib/analytics.js";
import { OFFER, mailto } from "./agencyData.js";
import { Reveal } from "./Reveal.jsx";

// The closing offer — the one package, on the landing and every case page.
export function AgencyOffer({
  id,
  source = "landing",
  heading = "Your business does incredible work behind closed doors.",
  sub = "Stop letting your marketing team guess what that work looks like. Restructure your organization around a Production Core.",
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
              <a
                className="pc-btn pc-btn-light"
                href={mailto(`${OFFER.name} — trust period`)}
                onClick={() => trackEvent("cta_click", { location: "offer_trust_period", source })}
              >
                {OFFER.cta}
                <ArrowUpRight size={18} strokeWidth={1.75} />
              </a>
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
