import { useEffect, useRef, useState } from "react";
import { Activity, ArrowRight, Check, DoorOpen, Plus, Smartphone, Users } from "lucide-react";
import { trackEvent } from "../../lib/analytics.js";
import { BASE_MONTHLY, BUNDLE_OFF, SUPERPOWERS, bundleOff, monthlyPlan, powerPrice } from "./agencyData.js";
import { openRequest } from "./request.js";
import { Reveal } from "./Reveal.jsx";

/* Add-ons on top of the retained engine: tap a card to switch a superpower
   on. The more you add, the less each one costs (BUNDLE_OFF) — cards show
   what they'd cost if added now, the bar climbs the ladder and counts the
   savings, and the CTA opens the request form with the picks. */
const ICONS = { crm: Users, room: DoorOpen, tracking: Activity, app: Smartphone };
const usd = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (f) => `${Math.round(f * 100)}%`;

// Eases a number toward its target so prices roll instead of jump.
function useTween(target, ms = 450) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    if (a === target) return undefined;
    let raf;
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const v = a + (target - a) * (1 - Math.pow(1 - t, 3));
      from.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

function Price({ value, list, from }) {
  const v = useTween(value);
  return (
    <span className="sp-price-v">
      {from && <small>from </small>}+{usd(v)}
      {list > value && <s className="sp-was">{usd(list)}</s>}
    </span>
  );
}

export function Superpowers() {
  const [on, setOn] = useState(() => new Set());
  const plan = monthlyPlan([...on]);
  const total = useTween(plan.total);
  const saved = useTween(plan.saved);
  const nextOff = plan.n < SUPERPOWERS.length ? bundleOff(plan.n + 1) : 0;

  const toggle = (id) => {
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      trackEvent("superpower_toggle", { id, on: next.has(id) });
      return next;
    });
  };

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
            powers you need — and the more you add, the less each one costs. All four:{" "}
            <strong>{pct(BUNDLE_OFF[BUNDLE_OFF.length - 1])} off every power.</strong>
          </p>
        </Reveal>

        <div className="sp-grid">
          {SUPERPOWERS.map((p, i) => {
            const Icon = ICONS[p.id];
            const active = on.has(p.id);
            // On: what it costs in the current bundle. Off: what it would cost if added now.
            const count = active ? plan.n : plan.n + 1;
            const price = powerPrice(p, count);
            const off = bundleOff(count);
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
                    <Price value={price} list={p.price} from={p.from} />
                    <span className="sp-price-c">/ month</span>
                    <span className="sp-add">
                      {active ? <Check size={16} strokeWidth={2.25} /> : <Plus size={16} strokeWidth={2.25} />}
                      {active ? "Added" : "Add"}
                    </span>
                  </span>
                  <span className={`sp-deal${off > 0 ? " is-shown" : ""}`} aria-hidden={off === 0}>
                    {off > 0 && (active ? `Bundle price · −${pct(off)}` : `Add now · −${pct(off)} on every power`)}
                  </span>
                </button>
              </Reveal>
            );
          })}
        </div>

        <div className="sp-total" aria-live="polite">
          <div className="sp-total-sum">
            <ol className="sp-ladder" aria-label="Bundle discount">
              {SUPERPOWERS.map((_, i) => {
                const n = i + 1;
                return (
                  <li key={n} className={`${plan.n >= n ? "is-hit" : ""}${plan.n === n ? " is-now" : ""}`}>
                    <span className="sp-ladder-n">{n}</span>
                    <span className="sp-ladder-off">{bundleOff(n) > 0 ? `−${pct(bundleOff(n))}` : "list"}</span>
                  </li>
                );
              })}
            </ol>
            <p className="sp-total-v">
              {plan.from && <small>from </small>}
              {usd(total)}
              <span> / month</span>
            </p>
            <p className="sp-total-k">
              {plan.n === 0 && `Core engine ${usd(BASE_MONTHLY)} — add a power to start the bundle.`}
              {plan.n > 0 && plan.saved > 0 && <>You save <b>{usd(saved)}</b> / month. </>}
              {plan.n > 0 && nextOff > plan.off && `One more → −${pct(nextOff)} on every power.`}
              {plan.n === SUPERPOWERS.length && "Every power, best price."}
            </p>
          </div>
          <button
            type="button"
            className="pc-btn pc-btn-light"
            onClick={() => {
              trackEvent("cta_click", { location: "superpowers", picks: plan.picked.map((p) => p.id).join(",") });
              openRequest({ source: "superpowers", powers: plan.picked.map((p) => p.id) });
            }}
          >
            {plan.n ? `Start with ${plan.n === 1 ? "this power" : `these ${plan.n} powers`}` : "Start with the core"}
            <ArrowRight size={18} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </section>
  );
}
