import { ArrowUpRight } from "lucide-react";
import { trackEvent } from "../../lib/analytics.js";
import { OFFERS, mailto } from "./agencyData.js";
import { Reveal } from "./Reveal.jsx";

// The closing offer — the same two doors on the landing and every case page.
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
        <div className="pc-offers">
          {OFFERS.map((o, i) => (
            <Reveal key={o.name} delay={i * 0.08}>
              <div className="pc-offer">
                <p className="pc-offer-name">{o.name}</p>
                <p className="pc-offer-price">
                  {o.price}
                  <span>{o.cadence}</span>
                </p>
                <p className="pc-offer-body">{o.body}</p>
                <a
                  className={`pc-btn ${i === 0 ? "pc-btn-light" : "pc-btn-ghost"}`}
                  href={mailto(o.name)}
                  onClick={() =>
                    trackEvent("cta_click", {
                      location: `offer_${i === 0 ? "blueprint" : "retained"}`,
                      source,
                    })
                  }
                >
                  {o.cta}
                  <ArrowUpRight size={18} strokeWidth={1.75} />
                </a>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
