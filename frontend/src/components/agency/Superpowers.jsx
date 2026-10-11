import { useMemo, useState } from "react";
import { Activity, ArrowRight, Check, DoorOpen, Plus, Smartphone, Users } from "lucide-react";
import { trackEvent } from "../../lib/analytics.js";
import { BASE_MONTHLY, CONTACT, SUPERPOWERS } from "./agencyData.js";
import { Reveal } from "./Reveal.jsx";

/* Add-ons on top of the retained engine: tap a card to switch a superpower
   on, the monthly total follows, and the CTA carries the picks into the email. */
const ICONS = { crm: Users, room: DoorOpen, tracking: Activity, app: Smartphone };
const usd = (n) => `$${n.toLocaleString("en-US")}`;

export function Superpowers() {
  const [on, setOn] = useState(() => new Set());
  const picked = useMemo(() => SUPERPOWERS.filter((p) => on.has(p.id)), [on]);
  const total = BASE_MONTHLY + picked.reduce((a, p) => a + p.price, 0);
  const anyFrom = picked.some((p) => p.from);

  const toggle = (id) => {
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      trackEvent("superpower_toggle", { id, on: next.has(id) });
      return next;
    });
  };

  const subject = picked.length
    ? `PullUp + ${picked.map((p) => p.name).join(" + ")}`
    : "PullUp — the core engine";
  const body = [
    "Hi PullUp,",
    "",
    "I'd like to talk about:",
    `- The core engine (${usd(BASE_MONTHLY)}/month)`,
    ...picked.map((p) => `- ${p.name} (${p.from ? "from " : ""}+${usd(p.price)}/month)`),
    "",
    "Who we are:",
    "",
  ].join("\n");
  const href = `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <section id="superpowers" className="pc-section pc-rule sp" data-pc-section="superpowers" data-pc-order="6">
      <div className="pc-wrap">
        <p className="pc-label"><span>04</span>Superpowers</p>
        <Reveal>
          <h2 className="pc-h2 sp-h2">Add superpowers.</h2>
        </Reveal>
        <Reveal delay={0.06}>
          <p className="sp-lede">
            The core engine is where every brand and creator starts. Then switch on the
            powers you need — and switch them off when you don't.
          </p>
        </Reveal>

        <div className="sp-grid">
          {SUPERPOWERS.map((p, i) => {
            const Icon = ICONS[p.id];
            const active = on.has(p.id);
            return (
              <Reveal key={p.id} delay={i * 0.06}>
                <button
                  type="button"
                  className={`sp-card${active ? " is-on" : ""}`}
                  aria-pressed={active}
                  onClick={() => toggle(p.id)}
                >
                  <span className="sp-top">
                    <span className="sp-icon"><Icon size={22} strokeWidth={1.75} /></span>
                    <span className="sp-by">{p.by}</span>
                    <span className="sp-switch" aria-hidden="true"><span /></span>
                  </span>
                  <span className="sp-name">{p.name}</span>
                  <span className="sp-line">{p.line}</span>
                  <span className="sp-items">
                    {p.items.map((item) => (
                      <span key={item} className="sp-item">
                        <Check size={15} strokeWidth={2} />
                        {item}
                      </span>
                    ))}
                  </span>
                  <span className="sp-price">
                    <span className="sp-price-v">
                      {p.from && <small>from </small>}+{usd(p.price)}
                    </span>
                    <span className="sp-price-c">/ month</span>
                    <span className="sp-add">
                      {active ? <Check size={16} strokeWidth={2.25} /> : <Plus size={16} strokeWidth={2.25} />}
                      {active ? "Added" : "Add"}
                    </span>
                  </span>
                </button>
              </Reveal>
            );
          })}
        </div>

        <div className="sp-total" aria-live="polite">
          <div className="sp-total-sum">
            <p className="sp-total-k">
              Core engine {usd(BASE_MONTHLY)}
              {picked.map((p) => ` + ${p.name}`).join("")}
            </p>
            <p className="sp-total-v" key={total}>
              {anyFrom && <small>from </small>}
              {usd(total)}
              <span> / month</span>
            </p>
          </div>
          <a
            className="pc-btn pc-btn-light"
            href={href}
            onClick={() => trackEvent("cta_click", { location: "superpowers", picks: picked.map((p) => p.id).join(",") })}
          >
            {picked.length ? `Start with ${picked.length === 1 ? "this power" : `these ${picked.length} powers`}` : "Start with the core"}
            <ArrowRight size={18} strokeWidth={1.75} />
          </a>
        </div>
      </div>
    </section>
  );
}
