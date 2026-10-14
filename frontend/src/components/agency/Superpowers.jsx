import { useEffect, useRef, useState } from "react";
import { Activity, ArrowRight, Check, DoorOpen, Plus, Smartphone, Sparkles, Users } from "lucide-react";
import { trackEvent } from "../../lib/analytics.js";
import { BASE_MONTHLY, FULL_SERVICE, SUPERPOWERS, bundleOff, monthlyPlan, powerPrice } from "./agencyData.js";
import { openRequest } from "./request.js";
import { Reveal } from "./Reveal.jsx";
import { useT } from "./i18n.js";

/* Add-ons on top of the retained engine: tap a card to switch a superpower
   on. The more you add, the less each one costs (BUNDLE_OFF) — cards show
   what they'd cost if added now, the bar climbs the ladder and counts the
   savings, and the CTA opens the request form with the picks. All four on
   = the Full Service package at one fixed price. */
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
  const t = useT();
  const v = useTween(value);
  return (
    <span className="sp-price-v">
      {from && <small>{t("from")} </small>}+{usd(v)}
      {list > value && <s className="sp-was">{usd(list)}</s>}
    </span>
  );
}

export function Superpowers() {
  const t = useT();
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

  const allOn = () => {
    setOn(new Set(plan.full ? [] : SUPERPOWERS.map((p) => p.id)));
    trackEvent("superpower_full_service", { on: !plan.full });
  };

  return (
    <section id="superpowers" className="pc-section pc-rule sp" data-pc-section="superpowers" data-pc-order="6">
      <div className="pc-wrap">
        <p className="pc-label"><span>04</span>{t("Superpowers")}</p>
        <Reveal>
          <h2 className="pc-h2 sp-h2">{t("Add superpowers.")}</h2>
        </Reveal>
        <Reveal delay={0.06}>
          <p className="sp-lede">
            {t("Everything in \"What you get\" is the core — {price} a month. Then switch on the powers you need, and the more you add, the less each one costs. Or take everything as one Full Service package.", { price: usd(BASE_MONTHLY) })}
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <button type="button" className={`sp-full${plan.full ? " is-on" : ""}`} aria-pressed={plan.full} onClick={allOn}>
            <span className="sp-full-icon"><Sparkles size={22} strokeWidth={1.75} /></span>
            <span className="sp-full-copy">
              <span className="sp-full-k">{plan.full ? t("You're on") : t("Want it all?")}</span>
              <span className="sp-full-name">{FULL_SERVICE.name}</span>
              <span className="sp-full-line">
                {t("The core engine and all four superpowers — we run the whole thing with you. One fixed price.")}
              </span>
            </span>
            <span className="sp-full-price">
              <span className="sp-full-v">{usd(FULL_SERVICE.price)}</span>
              <span className="sp-full-c">{t("/ month · everything")}</span>
              <span className="sp-add">
                {plan.full ? <Check size={16} strokeWidth={2.25} /> : <Plus size={16} strokeWidth={2.25} />}
                {plan.full ? t("Selected") : t("Get everything")}
              </span>
            </span>
          </button>
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
                  <span className="sp-line">{t(p.line)}</span>
                  <span className="sp-items">
                    {p.items.map((item) => (
                      <span key={item} className="sp-item">
                        <Check size={15} strokeWidth={2} />
                        {t(item)}
                      </span>
                    ))}
                  </span>
                  <span className="sp-price">
                    {plan.full ? (
                      <span className="sp-price-v">
                        {t("Included")}<s className="sp-was">{usd(p.price)}</s>
                      </span>
                    ) : (
                      <>
                        <Price value={price} list={p.price} from={p.from} />
                        <span className="sp-price-c">{t("/ month")}</span>
                      </>
                    )}
                    <span className="sp-add">
                      {active ? <Check size={16} strokeWidth={2.25} /> : <Plus size={16} strokeWidth={2.25} />}
                      {active ? t("Added") : t("Add")}
                    </span>
                  </span>
                  <span className={`sp-deal${off > 0 ? " is-shown" : ""}`} aria-hidden={off === 0}>
                    {off > 0 &&
                      (plan.full
                        ? t("Included in {name}", { name: FULL_SERVICE.name })
                        : active
                          ? t("Bundle price · −{pct}", { pct: pct(off) })
                          : count === SUPERPOWERS.length
                            ? t("Add now · unlocks {name}", { name: FULL_SERVICE.name })
                            : t("Add now · −{pct} on every power", { pct: pct(off) }))}
                  </span>
                </button>
              </Reveal>
            );
          })}
        </div>

        <div className={`sp-total${plan.full ? " is-full" : ""}`} aria-live="polite">
          <div className="sp-total-sum">
            <ol className="sp-ladder" aria-label={t("Bundle discount")}>
              {SUPERPOWERS.map((_, i) => {
                const n = i + 1;
                return (
                  <li key={n} className={`${plan.n >= n ? "is-hit" : ""}${plan.n === n ? " is-now" : ""}`}>
                    <span className="sp-ladder-n">{n}</span>
                    <span className="sp-ladder-off">
                      {n === SUPERPOWERS.length ? FULL_SERVICE.name : bundleOff(n) > 0 ? `−${pct(bundleOff(n))}` : t("list")}
                    </span>
                  </li>
                );
              })}
            </ol>
            {plan.full && <p className="sp-total-badge"><Sparkles size={14} strokeWidth={2} />{FULL_SERVICE.name}</p>}
            <p className="sp-total-v">
              {plan.from && <small>{t("from")} </small>}
              {usd(total)}
              <span> {t("/ month")}</span>
            </p>
            <p className="sp-total-k">
              {plan.n === 0 && t("Core engine {price} — add a power to start the bundle.", { price: usd(BASE_MONTHLY) })}
              {plan.n > 0 && plan.saved > 0 && <>{t("You save")} <b>{usd(saved)}</b> {t("/ month")}. </>}
              {plan.n > 0 && plan.n === SUPERPOWERS.length - 1 && t("One more → {name}, {price} fixed.", { name: FULL_SERVICE.name, price: usd(FULL_SERVICE.price) })}
              {plan.n > 0 && plan.n < SUPERPOWERS.length - 1 && nextOff > plan.off && t("One more → −{pct} on every power.", { pct: pct(nextOff) })}
              {plan.full && t("{name} — everything, one fixed price.", { name: FULL_SERVICE.name })}
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
            {plan.full
              ? t("Start {name}", { name: FULL_SERVICE.name })
              : plan.n
                ? plan.n === 1 ? t("Start with this power") : t("Start with these {n} powers", { n: plan.n })
                : t("Start with the core")}
            <ArrowRight size={18} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </section>
  );
}
