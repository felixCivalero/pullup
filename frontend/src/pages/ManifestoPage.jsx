import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { AgencyShell } from "../components/agency/AgencyShell.jsx";
import { AgencyOffer } from "../components/agency/AgencyOffer.jsx";
import { Reveal } from "../components/agency/Reveal.jsx";
import { MANIFESTO, MANIFESTO_LOOP, MANIFESTO_OPENER } from "../components/agency/manifesto.js";
import { initTracking, trackPageView } from "../lib/track.js";

/* /manifesto — what PullUp believes. Typographic, one principle per beat. */
export default function ManifestoPage() {
  const navigate = useNavigate();

  useEffect(() => {
    initTracking();
    trackPageView("manifesto");
    window.scrollTo(0, 0);
    const prev = document.title;
    document.title = "The PullUp Manifesto";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <AgencyShell css={CSS}>
      <section className="pc-dark mf-hero" data-pc-tone="dark" data-pc-section="manifesto_hero" data-pc-order="1">
        <div className="pc-wrap">
          <Reveal><p className="pc-eyebrow">The PullUp Manifesto</p></Reveal>
          <Reveal delay={0.08}><h1 className="mf-h">{MANIFESTO_OPENER.title}</h1></Reveal>
          <Reveal delay={0.16}><p className="mf-lede">{MANIFESTO_OPENER.body}</p></Reveal>
        </div>
      </section>

      <section className="pc-section mf-list" data-pc-section="manifesto_principles" data-pc-order="2">
        <ol className="pc-wrap mf-ol">
          {MANIFESTO.map((m, i) => (
            <li key={m.t}>
              <Reveal>
                <span className="mf-n">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h2 className="mf-t">{m.t}</h2>
                  <p className="mf-b">{m.b}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <section className="pc-section pc-rule mf-loop" data-pc-section="manifesto_loop" data-pc-order="3">
        <div className="pc-wrap">
          <p className="pc-label">The loop</p>
          <Reveal>
            <h2 className="pc-h2">Operations and marketing are not two departments. They are one loop.</h2>
          </Reveal>
          <ol className="mf-loop-ol">
            {MANIFESTO_LOOP.map((l, i) => (
              <li key={l.k}>
                <Reveal delay={i * 0.08}>
                  <p className="mf-loop-k">{String(i + 1).padStart(2, "0")} · {l.k}</p>
                  <h3>{l.t}</h3>
                  <p className="mf-loop-b">{l.b}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="pc-dark mf-close" data-pc-tone="dark" data-pc-section="manifesto_close" data-pc-order="4">
        <div className="pc-wrap">
          <Reveal><p className="mf-close-t">{MANIFESTO_OPENER.close}</p></Reveal>
          <Reveal delay={0.08}>
            <p className="mf-sign">— PullUp</p>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="mf-links">
              <a
                className="pc-caselink"
                href="/#work"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/#work");
                }}
              >
                See it in the work <ArrowRight size={16} strokeWidth={1.75} />
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <AgencyOffer source="manifesto" />
    </AgencyShell>
  );
}

const CSS = `
  .mf-hero { min-height: 92svh; display: flex; align-items: flex-end; padding: 140px 0 clamp(64px, 9vw, 120px); }
  .mf-h { font-size: clamp(42px, min(7.4vw, 11vh), 112px); font-weight: 600; line-height: 0.98; letter-spacing: -0.045em; max-width: 15ch; }
  .mf-lede { margin-top: clamp(28px, 4vh, 44px); max-width: 58ch; font-size: clamp(18px, 1.7vw, 22px); line-height: 1.55; color: rgba(255,255,255,0.72); }

  .mf-ol { list-style: none; margin: 0 auto; }
  .mf-ol li { border-top: 1px solid var(--pc-line); }
  .mf-ol li:last-child { border-bottom: 1px solid var(--pc-line); }
  .mf-ol .pc-reveal {
    display: grid; grid-template-columns: 1fr; gap: 12px 0;
    padding: clamp(36px, 5vw, 64px) 0;
  }
  @media (min-width: 900px) { .mf-ol .pc-reveal { grid-template-columns: 160px 1fr; } }
  .mf-n { font-size: 15px; font-weight: 500; letter-spacing: 0.08em; color: var(--pc-grey); font-variant-numeric: tabular-nums; padding-top: 12px; }
  .mf-t { font-size: clamp(32px, 4.6vw, 64px); font-weight: 600; line-height: 1.02; letter-spacing: -0.035em; max-width: 18ch; }
  .mf-b { margin-top: 18px !important; font-size: clamp(18px, 1.6vw, 21px); line-height: 1.55; color: #333; max-width: 56ch; }

  .mf-loop .pc-h2 { max-width: 20ch; }
  .mf-loop-ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr; border-top: 1px solid #000; }
  @media (min-width: 900px) {
    .mf-loop-ol { grid-template-columns: repeat(3, 1fr); }
    .mf-loop-ol > li + li { border-left: 1px solid var(--pc-line); padding-left: clamp(20px, 2.4vw, 36px); }
    .mf-loop-ol > li:not(:last-child) { padding-right: clamp(20px, 2.4vw, 36px); }
  }
  .mf-loop-ol > li { padding-top: 28px; padding-bottom: 28px; border-bottom: 1px solid var(--pc-line); }
  .mf-loop-k { font-size: 13px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pc-grey); margin-bottom: 14px !important; }
  .mf-loop-ol h3 { font-size: clamp(26px, 2.8vw, 36px); font-weight: 600; letter-spacing: -0.03em; margin-bottom: 10px !important; }
  .mf-loop-b { font-size: 17px; line-height: 1.55; color: #333; }

  .mf-close { padding: clamp(96px, 14vw, 180px) 0; }
  .mf-close-t { font-size: clamp(40px, 6.6vw, 96px); font-weight: 600; line-height: 1; letter-spacing: -0.045em; max-width: 14ch; }
  .mf-sign { margin-top: 28px !important; font-size: 18px; color: rgba(255,255,255,0.55); }
  .mf-links { margin-top: 12px; }

  @media (max-width: 640px) {
    .mf-hero { min-height: 88svh; padding: 112px 0 56px; }
    .mf-h { font-size: clamp(36px, 10.4vw, 48px); }
    .mf-lede { font-size: 17px; }
    .mf-n { padding-top: 0; }
  }
`;
