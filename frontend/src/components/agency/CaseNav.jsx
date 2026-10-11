import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { trackEvent } from "../../lib/analytics.js";
import { SERIES, SPINE, casePath, storyCount, storyNo } from "./agencyData.js";

/* The shared story frame. CaseSpine answers Start → What we did → What we
   made → Result for one story, the same way on every card and case page.
   CaseRail lists every story with "you are here", so a reader can walk
   them all in order. */

export function CaseSpine({ spine, page = false }) {
  if (!spine) return null;
  return (
    <ol className={`pc-spine${page ? " is-page" : ""}`}>
      {SPINE.map(([k, label], i) => (
        <li key={k} className={k === "result" ? "is-result" : undefined}>
          <span className="pc-spine-k">
            <span className="pc-spine-n">{i + 1}</span>
            {label}
          </span>
          <span className="pc-spine-t">{spine[k]}</span>
        </li>
      ))}
    </ol>
  );
}

export function StoryMark({ slug }) {
  return (
    <span className="pc-storymark">
      Story {storyNo(slug)} <span>/ {storyCount}</span>
    </span>
  );
}

export function CaseRail({ slug }) {
  const navigate = useNavigate();
  return (
    <section className="pc-rail" data-pc-section="all_stories" data-pc-order="79">
      <div className="pc-wrap">
        <p className="pc-label">All stories · same four steps</p>
        <ol className="pc-rail-list">
          {SERIES.map((c) => {
            const here = c.slug === slug;
            return (
              <li key={c.slug}>
                <a
                  href={casePath(c.slug)}
                  className={`pc-rail-item${here ? " is-here" : ""}`}
                  aria-current={here ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    if (here) return;
                    trackEvent("cta_click", { location: "story_rail", from: slug, to: c.slug });
                    navigate(casePath(c.slug));
                  }}
                >
                  <span className="pc-rail-n">{storyNo(c.slug)}</span>
                  <span className="pc-rail-copy">
                    <span className="pc-rail-client">{c.client}</span>
                    <span className="pc-rail-result">{c.spine.result}</span>
                  </span>
                  <span className="pc-rail-go">
                    {here ? "You're here" : <ArrowRight size={18} strokeWidth={1.75} />}
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
