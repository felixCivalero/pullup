import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../lib/env.js";
import { getVisitorId, trackEvent } from "../lib/analytics.js";
import { initTracking, trackPageView } from "../lib/track.js";
import { AgencyShell } from "../components/agency/AgencyShell.jsx";
import { FunnelWorld, FUNNEL_CSS } from "../components/agency/FunnelWorld.jsx";
import { QuoteReel, QUOTE_CSS } from "../components/agency/QuoteReel.jsx";
import { CaseStack, CASE_STACK_CSS } from "../components/agency/CaseStack.jsx";
import { LANDING_CSS } from "../components/agency/landingParts.jsx";
import { MailLink } from "../components/agency/MailLink.jsx";
import { openRequest } from "../components/agency/request.js";
import { useT } from "../components/agency/i18n.js";
import { HOME_TITLE } from "./homeMeta.js";

/* The front door sells the whole brand world: four steps from the first
   glance to the customer who comes back. No people on this page: it speaks as
   PullUp (Felix 2026-11-03). The
   free site check is step one's door: anyone types their site and gets an
   honest answer, grouped by the first three steps. ?site=x.se runs it on
   arrival, for links in sales mail. The result measures readiness, never what
   an AI would really answer: say it that way. */

const STEPS = [
  { key: "found", name: "Get found.", line: "Google and AI. A site, data and tracking that ChatGPT, Claude and Google can read, trust and recommend." },
  { key: "seen", name: "Get seen.", line: "Film, photo and short video for social, made by people who do it for a living. Content that builds the brand and sells." },
  { key: "chosen", name: "Get chosen.", line: "A site and shop that turn a look into a purchase, with ads, email and measurement that show what actually sells." },
  { key: "back", name: "Come back.", line: "Events, photo walks and community. Moments people show up for, and bring their friends to." },
];
const CHECKED = STEPS.filter((s) => s.key !== "back");

// The AI in the check's headline, one after the other. Each has its crawler in
// the site check (backend lib/siteCheck.js), so the question stays honest.
const AIS = ["ChatGPT", "Claude", "Gemini", "Perplexity", "Copilot", "Meta AI"];

function FlipHeadline() {
  const t = useT();
  const [at, setAt] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const id = setInterval(() => setAt((i) => (i + 1) % AIS.length), 2000);
    return () => clearInterval(id);
  }, []);

  const [before, after] = t("Can ChatGPT find you?").split("ChatGPT");
  return (
    <h3>
      {before}
      <span className="ho-flip"><span key={AIS[at]}>{AIS[at]}</span></span>
      {after}
    </h3>
  );
}

function meeting(location) {
  trackEvent("cta_click", { location });
  openRequest({ source: location });
}

function Result({ result }) {
  const t = useT();
  const misses = result.items.filter((i) => !i.ok).length;
  return (
    <div className="ho-result">
      <div className="ho-score">
        <strong>{result.score}</strong>
        <span>{t("of 100")}</span>
        <p><b>{result.domain}</b><br />{misses ? t(`${misses} things to fix`) : t("Nothing to fix. Impressive.")}</p>
        <button type="button" onClick={() => meeting("check_result")}>{t("Let's fix it")}</button>
      </div>
      <div className="ho-groups">
        {CHECKED.map((o) => (
          <section key={o.key}>
            <h3>{t(o.name)}</h3>
            <ul>
              {result.items.filter((i) => i.group === o.key).map((i) => (
                <li key={i.label} className={i.ok ? "is-ok" : "is-miss"}>
                  <i aria-hidden="true">{i.ok ? "✓" : "×"}</i>
                  <span><b>{i.label}</b>{i.fix && <em>{i.fix}</em>}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="ho-note">{t("This reads your public front page. It shows how ready the site is, not what an AI would answer.")}</p>
    </div>
  );
}

// The hero's two free tools, drawn as superpowers you pick up on the spot:
// the site check runs right in its card, the event tool is one tap away.
function PowerIcon({ kind }) {
  return kind === "scan" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.6" className="is-fill" /><path d="M12 12 19 5" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4Z" /><path d="M14 6v12" strokeDasharray="1.5 2.2" /></svg>
  );
}

function PowerHead({ title, kind }) {
  const t = useT();
  return (
    <div className="ho-power-head">
      <i className="ho-power-icon"><PowerIcon kind={kind} /></i>
      <h2>{t(title)}</h2>
      <b><i className="ho-led" aria-hidden="true" />{t("Free")}</b>
    </div>
  );
}

// The site check's answer, wherever on the page it was asked: a centred
// window on desktop, a sheet from the bottom on phones. It opens the moment
// the check starts (reading…), then shows the score or what went wrong.
function CheckPopup({ open, state, asked, result, errors, onClose }) {
  const t = useT();
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const back = document.activeElement;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    panel.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      back?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ho-pop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ho-pop-panel" ref={panel} role="dialog" aria-modal="true" aria-label={t("Test your site")} tabIndex={-1}>
        <div className="ho-pop-bar">
          <span><i className="ho-led" aria-hidden="true" />{state === "working" ? t("Reading…") : asked}</span>
          <button type="button" onClick={onClose} aria-label={t("Close")}>×</button>
        </div>
        <div className="ho-pop-body" role="status" aria-live="polite">
          {state === "working" && (
            <div className="ho-pop-wait">
              <p>{asked}</p>
              <div className="ho-pop-scan" aria-hidden="true"><i /></div>
              <small>{t("20 seconds. No sign-up.")}</small>
            </div>
          )}
          {state === "done" && result && <Result result={result} />}
          {errors[state] && (
            <div className="ho-pop-wait">
              <p>{t(errors[state])}</p>
              {state === "unreadable" && <button type="button" className="ho-pop-cta" onClick={() => { onClose(); meeting("check_unreadable"); }}>{t("Book a meeting")}</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function HomePage() {
  const t = useT();
  const [site, setSite] = useState("");
  const [heroSite, setHeroSite] = useState("");
  const [state, setState] = useState("idle");
  const [result, setResult] = useState(null);
  const [count, setCount] = useState(null);
  const [popOpen, setPopOpen] = useState(false);
  const [asked, setAsked] = useState("");
  const closePop = useCallback(() => setPopOpen(false), []);
  const checkRef = useRef(null);

  const check = useCallback(async (value, source) => {
    setAsked(String(value).trim().replace(/^https?:\/\//i, "").replace(/\/$/, ""));
    setPopOpen(true);
    setState("working");
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/site-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site: value, source, visitId: getVisitorId() }),
      });
      const data = await res.json().catch(() => ({}));
      // Statistik: what was typed and how it went, on this visit's journey.
      const typed = String(value).trim().slice(0, 200);
      trackEvent("input", { form: "site_check", value: typed, result: res.ok ? data.score : data.error || "failed" });
      if (!res.ok) throw new Error(data.error || "failed");
      setResult(data);
      setState("done");
      trackEvent("cta_click", { location: "check_done" });
    } catch (err) {
      setState(err.message === "invalid_site" ? "invalid" : err.message === "rate_limited" ? "limited" : "unreadable");
    }
  }, []);

  useEffect(() => {
    initTracking();
    trackPageView("landing");
    document.title = HOME_TITLE;
    fetch(`${API_BASE}/stockholm/events`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.events?.length) setCount(d.events.length); })
      .catch(() => {});
    const preset = new URLSearchParams(window.location.search).get("site");
    if (!preset) return undefined;
    const id = setTimeout(() => {
      setSite(preset);
      check(preset, "link");
    }, 0);
    return () => clearTimeout(id);
  }, [check]);


  const ERRORS = {
    invalid: "That doesn't look like a website. Try yourbrand.se",
    limited: "That's a lot of checks. Try again in a while.",
    unreadable: "We couldn't read that site. It may block visitors like us. Book a meeting and we'll look by hand.",
  };

  return (
    <AgencyShell css={LANDING_CSS + CASE_STACK_CSS + FUNNEL_CSS + QUOTE_CSS + HOME_CSS} brand>
      <div className="ho">
        <FunnelWorld>
          <h1 aria-label={t("Creative powerhouse.")}>
            {t("Creative powerhouse.").split(" ").map((word, i) => (
              <span key={i} className="ho-rise" aria-hidden="true"><span style={{ animationDelay: `${0.25 + i * 0.12}s` }}>{word}</span></span>
            ))}
          </h1>
          <div className="ho-powers">
            <p className="ho-powers-lead">{t("Try our free tools")}<span aria-hidden="true">↓</span></p>
            <form
              className="ho-power is-site"
              onSubmit={(e) => {
                e.preventDefault();
                if (!heroSite.trim()) return;
                trackEvent("cta_click", { location: "home_hero_check" });
                check(heroSite, "home_hero");
              }}
            >
              <PowerHead title="See if AI can find you." kind="scan" />
              <div className="ho-power-field">
                <input
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  aria-label={t("Your website")}
                  placeholder={t("yourbrand.se")}
                  value={heroSite}
                  onChange={(e) => setHeroSite(e.target.value)}
                />
                <button type="submit" disabled={state === "working"}>{state === "working" ? t("Reading…") : t("Test")}</button>
              </div>
            </form>
            <Link className="ho-power is-event" to="/eventverktyg" onClick={() => trackEvent("cta_click", { location: "home_hero_event" })}>
              <PowerHead title="Fill the room." kind="ticket" />
              <span className="ho-power-go">{t("Create an event")} <span aria-hidden="true">→</span></span>
            </Link>
          </div>
        </FunnelWorld>

        <QuoteReel />

        <section className="ho-cases" id="stories" data-pc-section="stories" data-pc-order="3">
          <CaseStack
            head={
              <>
                <small className="ho-kicker">{t("A selection")}</small>
                <h2 className="ho-h2">{t("Hand-picked client cases.")}</h2>
              </>
            }
          />
        </section>

        <section className="ho-meet" id="offer" data-pc-tone="dark" data-pc-section="offer" data-pc-order="4">
          <small className="ho-kicker">{t("Next step")}</small>
          <h2>{t("Book a meeting.")}</h2>
          <p>{t("Every brand has its own starting point and its own goals. Let's meet and see if there's a chance to grow together.")}</p>
          <form
            className="ho-meet-form"
            onSubmit={(e) => {
              e.preventDefault();
              const email = new FormData(e.currentTarget).get("email");
              trackEvent("cta_click", { location: "home_meet" });
              // Statistik: that the field was used — never the address.
              trackEvent("input", { form: "meet_email" });
              openRequest({ source: "home_meet", email });
            }}
          >
            <input type="email" name="email" inputMode="email" autoComplete="email" required aria-label={t("Your email")} placeholder={t("you@yourbrand.se")} />
            <button type="submit">{t("Book a meeting")}</button>
          </form>
          <p className="ho-meet-alt">{t("Or email us:")} <MailLink className="ho-mail" /></p>
        </section>

        <section className="ho-tools" data-pc-section="tools" data-pc-order="5">
          <h2>{t("Get started with our free tools.")}</h2>
          <div className="ho-tools-grid">
            <div className="ho-site" ref={checkRef} id="test">
              <small>{t("Test your site")}</small>
              <FlipHeadline />
              <p>{t("Your next customer asks an AI before they ask Google. See how ready your brand is, in 20 seconds.")}</p>
              <form onSubmit={(e) => { e.preventDefault(); if (site.trim()) check(site, "home"); }}>
                <input
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  aria-label={t("Your website")}
                  placeholder={t("yourbrand.se")}
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                />
                <button type="submit" disabled={state === "working"}>{state === "working" ? t("Reading…") : t("Check my site")}</button>
              </form>
              <small>{t("Free. No sign-up.")}</small>
            </div>
            <Link className="ho-tool" to="/eventverktyg" onClick={() => trackEvent("cta_click", { location: "home_create" })}>
              <small>{t("Create an event")}</small>
              <h3>{t("Your event, ready to share.")}</h3>
              <p>{t("Event page, sign-ups, confirmations with a calendar invite, waitlist and guest list. Free.")}</p>
              <span>{t("Create an event")} →</span>
            </Link>
            <Link className="ho-tool" to="/stockholm" onClick={() => trackEvent("cta_click", { location: "home_find" })}>
              <small>{t("Find culture")}</small>
              <h3>{t("Everything on in Stockholm.")}</h3>
              <p>{count ? t(`${count} things on right now. Filter for what you like and get it by email every Thursday.`) : t("Music, art and stage in one place. Filter for what you like and get it by email every Thursday.")}</p>
              <span>{t("See events")} →</span>
            </Link>
          </div>
        </section>

      </div>
      <CheckPopup open={popOpen} state={state} asked={asked} result={result} errors={ERRORS} onClose={closePop} />
    </AgencyShell>
  );
}

const PAD = "padding-left: clamp(20px, 3.4vw, 48px); padding-right: clamp(20px, 3.4vw, 48px);";

const HOME_CSS = `
  .ho { background: #fff; color: #0a0a0a; }
  .ho button { font: inherit; cursor: pointer; }

  .ho-rise { display: inline-block; overflow: hidden; padding: 0 .1em .22em 0; margin: 0 .12em -.22em 0; vertical-align: top; }
  .ho-rise > span { display: inline-block; animation: ho-rise 1s cubic-bezier(.16,1,.3,1) both; }
  @keyframes ho-rise { from { transform: translateY(110%) rotate(4deg); } to { transform: none; } }
  .fw-hero > p, .ho-powers { animation: ho-fade .9s .9s cubic-bezier(.16,1,.3,1) both; }
  @keyframes ho-fade { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .ho-rise > span, .fw-hero > p, .ho-powers { animation: none; } }
  .fw-hero h1 { margin: 0 0 24px; max-width: 7em; font-size: clamp(54px, 10.6vw, 184px); line-height: .88; letter-spacing: -0.065em; font-weight: 700; }
  .fw-hero > p { margin: 0 0 32px; max-width: 30em; font-size: clamp(18px, 2vw, 26px); line-height: 1.25; letter-spacing: -0.02em; font-weight: 500; }
  /* ─── the two free tools: grey hardware panels, old-school technical ─── */
  .ho-powers { --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace; display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 12px; max-width: 880px; margin-top: 8px; }
  .ho-powers-lead { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; margin: 0 0 6px; font-size: clamp(20px, 1.9vw, 28px); line-height: 1.1; letter-spacing: -0.025em; font-weight: 600; }
  .ho-powers-lead span { display: grid; place-items: center; width: 1.3em; height: 1.3em; border: 2px solid currentColor; border-radius: 50%; font-size: .7em; font-weight: 700; animation: ho-nudge 2.2s ease-in-out infinite; }
  @keyframes ho-nudge { 50% { transform: translateY(3px); } }
  .ho-power { position: relative; display: grid; align-content: start; gap: 14px; margin: 0; padding: 14px 14px 14px; border-radius: 10px; color: #111; text-decoration: none;
    background: linear-gradient(180deg, #e4e3df 0%, #cfcec9 100%);
    border: 1px solid #8f8e89;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.85), inset 0 -2px 0 rgba(0,0,0,.12), 0 18px 40px -20px rgba(70,0,40,.6);
    transition: transform .3s cubic-bezier(.16,1,.3,1), box-shadow .3s ease; }
  /* hairline rule under the head, like a panel seam */
  .ho-power-head { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,.14); box-shadow: 0 1px 0 rgba(255,255,255,.7); }
  .ho-power:hover, .ho-power:focus-within { transform: translateY(-2px); box-shadow: inset 0 1px 0 rgba(255,255,255,.85), inset 0 -2px 0 rgba(0,0,0,.12), 0 24px 46px -18px rgba(70,0,40,.7); }
  .ho-power-icon { flex: none; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 5px; background: #1a1a1a; color: #e4e3df; box-shadow: inset 0 1px 0 rgba(255,255,255,.18); }
  .ho-power-icon svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .ho-power-icon .is-fill { fill: currentColor; }
  .ho-power h2 { flex: 1; margin: 0; font-family: var(--mono); font-size: 13.5px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; line-height: 1.2; }
  .ho-power-head b { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border: 1px solid rgba(0,0,0,.35); border-radius: 4px; font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; background: rgba(255,255,255,.35); }
  .ho-led { width: 7px; height: 7px; border-radius: 50%; background: #ec178f; box-shadow: 0 0 0 1px rgba(0,0,0,.25), 0 0 8px #ec178f; animation: ho-led 2.4s ease-in-out infinite; }
  @keyframes ho-led { 50% { opacity: .45; } }
  .ho-power-field { display: flex; gap: 6px; }
  .ho-power-field input { flex: 1; min-width: 0; height: 46px; padding: 0 12px; border: 1px solid #7d7c77; border-radius: 6px; outline: 0; background: #f7f6f1; color: #111; font-family: var(--mono); font-size: 16px; letter-spacing: 0; box-shadow: inset 0 2px 3px rgba(0,0,0,.14); }
  .ho-power-field input::placeholder { color: #8a8984; }
  .ho-power-field input:focus { border-color: #111; box-shadow: inset 0 2px 3px rgba(0,0,0,.14), 0 0 0 2px #ec178f; }
  .ho-power-field button, .ho-power-go { flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 46px; padding: 0 18px; border: 1px solid #000; border-radius: 6px; background: linear-gradient(180deg, #2a2a2a, #0d0d0d); color: #f2f1ec; font-family: var(--mono); font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 2px 0 rgba(0,0,0,.25); transition: background .15s ease, transform .1s ease; }
  .ho-power-field button:hover, .ho-power.is-event:hover .ho-power-go { background: linear-gradient(180deg, #f43aa5, #d90f80); color: #111; border-color: #8a0a52; }
  .ho-power-field button:active, .ho-power-go:active { transform: translateY(1px); }
  .ho-power-field button:disabled { opacity: .7; }
  .ho-power-go { justify-self: start; }
  .ho-power-go span { transition: transform .25s ease; }
  .ho-power.is-event:hover .ho-power-go span { transform: translateX(3px); }
  .ho-power-note { font-family: var(--mono); font-size: 12px; color: #4a4945; }
  @media (max-width: 759px) {
    .fw-hero h1 { margin-bottom: 18px; }
    .ho-powers { grid-template-columns: 1fr; gap: 10px; }
    .ho-power.is-event { grid-template-columns: 1fr; }
  }
  @media (prefers-reduced-motion: reduce) { .ho-led, .ho-powers-lead span { animation: none; } }


  .ho-tools { ${PAD} padding-top: clamp(80px, 11vw, 150px); padding-bottom: clamp(56px, 8vw, 100px); background: #fff; }
  .ho-tools > h2 { margin: 0 0 clamp(28px, 4vw, 52px); max-width: 10em; font-size: clamp(44px, 7vw, 120px); line-height: .92; letter-spacing: -0.055em; font-weight: 700; }
  .ho-tools-grid { display: grid; gap: 12px; }
  .ho-tools-grid > * { min-width: 0; }
  @media (min-width: 900px) { .ho-tools-grid { grid-template-columns: 1fr 1fr; } .ho-site { grid-column: 1 / -1; } }
  .ho-site { padding: clamp(28px, 4.4vw, 64px); border-radius: 28px; background: radial-gradient(120% 120% at 80% 0%, #f43aa5 0%, #ec178f 55%, #d90f80 100%); color: #0a0a0a; scroll-margin-top: 80px; }
  .ho-site > small:first-child, .ho-tool small { display: block; margin: 0 0 16px; font-size: 15px; font-weight: 600; }
  .ho-tool { display: grid; align-content: space-between; gap: 14px; min-height: clamp(260px, 26vw, 360px); padding: clamp(28px, 3.4vw, 44px); border-radius: 28px; background: #0a0a0a; color: #fff; text-decoration: none; transition: background .25s ease, color .25s ease, transform .35s cubic-bezier(.16,1,.3,1); }
  .ho-tool:hover { background: #ec178f; color: #0a0a0a; transform: translateY(-4px); }
  .ho-tool small { color: #ec178f; transition: color .25s ease; }
  .ho-tool:hover small { color: #0a0a0a; }
  .ho-tool h3 { margin: 0; max-width: 10em; font-size: clamp(34px, 3.8vw, 60px); line-height: .95; letter-spacing: -0.05em; font-weight: 700; }
  .ho-tool p { margin: 0; max-width: 26em; font-size: 16px; line-height: 1.4; opacity: .72; }
  .ho-tool > span { font-size: 16px; font-weight: 600; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
  .ho-site h3 { margin: 0 0 18px; font-size: clamp(48px, 8.4vw, 140px); line-height: .88; letter-spacing: -0.06em; font-weight: 700; }
  .ho-flip { display: inline-block; vertical-align: top; overflow: hidden; padding: 0 .08em .16em 0; margin: 0 -.08em -.16em 0; white-space: nowrap; color: #fff; }
  .ho-flip span { display: inline-block; animation: ho-flip .5s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes ho-flip { from { transform: translateY(105%); } to { transform: none; } }
  @media (max-width: 759px) { .ho-flip { display: block; } }
  @media (prefers-reduced-motion: reduce) { .ho-flip span { animation: none; } }
  .ho-site > p { margin: 0 0 30px; max-width: 26em; font-size: clamp(18px, 2vw, 26px); line-height: 1.25; letter-spacing: -0.02em; font-weight: 500; }
  .ho-site form { display: flex; gap: 6px; width: 100%; max-width: 720px; padding: 6px; border-radius: 999px; background: #fff; box-shadow: 0 14px 40px rgba(90,0,50,.28); }
  .ho-site input { flex: 1; min-width: 0; height: 54px; padding: 0 20px; border: 0; outline: 0; background: transparent; color: #0a0a0a; font: inherit; font-size: clamp(17px, 2vw, 21px); font-weight: 500; letter-spacing: -0.02em; }
  .ho-site form button { flex: none; height: 54px; padding: 0 clamp(18px, 2.4vw, 30px); border: 0; border-radius: 999px; background: #0a0a0a; color: #fff; font-size: 16px; font-weight: 600; }
  .ho-site form button:hover { background: #2a2a2a; }
  .ho-site form + small { display: block; margin-top: 14px; font-size: 15px; font-weight: 500; }

  /* ─── the check's popup ─── */
  .ho-pop { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 24px; background: rgba(10,10,10,.5); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); animation: ho-pop-fade .25s ease both; }
  .ho-pop-panel { --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace; width: min(920px, 100%); max-height: min(86vh, 860px); display: flex; flex-direction: column; overflow: hidden; border-radius: 14px; background: #fff; color: #0a0a0a; outline: 0; box-shadow: 0 40px 100px -20px rgba(0,0,0,.55); animation: ho-pop-in .4s cubic-bezier(.16,1,.3,1) both; }
  .ho-pop-bar { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 10px 10px 16px; border-bottom: 1px solid #b9b8b3; background: linear-gradient(180deg, #e4e3df, #cfcec9); font-family: var(--mono); font-size: 13px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  .ho-pop-bar span { display: inline-flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ho-pop-bar button { flex: none; width: 34px; height: 34px; border: 1px solid #8f8e89; border-radius: 6px; background: #f7f6f1; color: #0a0a0a; font-size: 20px; line-height: 1; box-shadow: inset 0 1px 0 #fff; }
  .ho-pop-bar button:hover { background: #0a0a0a; color: #fff; }
  .ho-pop-body { overflow-y: auto; overscroll-behavior: contain; padding: clamp(20px, 3.4vw, 40px); }
  .ho-pop-wait { display: grid; gap: 16px; justify-items: start; padding: 12px 0 8px; }
  .ho-pop-wait p { margin: 0; font-size: clamp(22px, 2.6vw, 34px); line-height: 1.15; letter-spacing: -0.03em; font-weight: 700; word-break: break-word; }
  .ho-pop-wait small { font-family: var(--mono); font-size: 12px; color: #6e6e73; }
  .ho-pop-scan { position: relative; width: 100%; height: 8px; overflow: hidden; border: 1px solid #8f8e89; border-radius: 4px; background: #e4e3df; box-shadow: inset 0 1px 2px rgba(0,0,0,.15); }
  .ho-pop-scan i { position: absolute; inset: 0 auto 0 0; width: 30%; background: #ec178f; box-shadow: 0 0 12px #ec178f; animation: ho-pop-scan 1.4s ease-in-out infinite; }
  .ho-pop-cta { height: 48px; padding: 0 24px; border: 0; border-radius: 999px; background: #0a0a0a; color: #fff; font-size: 15px; font-weight: 600; }
  .ho-pop-cta:hover { background: #ec178f; }
  @keyframes ho-pop-fade { from { opacity: 0; } }
  @keyframes ho-pop-in { from { opacity: 0; transform: translateY(18px) scale(.98); } }
  @keyframes ho-pop-scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(340%); } }
  @media (max-width: 759px) {
    .ho-pop { place-items: end stretch; padding: 0; }
    .ho-pop-panel { width: 100%; max-height: 90svh; border-radius: 16px 16px 0 0; padding-bottom: env(safe-area-inset-bottom, 0px); animation: ho-pop-sheet .45s cubic-bezier(.16,1,.3,1) both; }
    @keyframes ho-pop-sheet { from { transform: translateY(100%); } }
  }
  @media (prefers-reduced-motion: reduce) { .ho-pop, .ho-pop-panel, .ho-pop-scan i { animation: none; } }
  .ho-result { background: #fff; }
  .ho-score { display: grid; grid-template-columns: auto auto 1fr auto; align-items: end; gap: 0 16px; padding-bottom: 24px; margin-bottom: 28px; border-bottom: 2px solid #0a0a0a; }
  .ho-score strong { font-size: clamp(84px, 11vw, 150px); line-height: .8; letter-spacing: -0.07em; font-weight: 700; color: #ec178f; }
  .ho-score > span { font-size: 17px; font-weight: 600; }
  .ho-score p { margin: 0; font-size: 17px; line-height: 1.3; }
  .ho-score button { height: 52px; padding: 0 28px; border: 0; border-radius: 999px; background: #0a0a0a; color: #fff; font-size: 16px; font-weight: 600; transition: background .2s ease, color .2s ease; }
  .ho-score button:hover { background: #ec178f; }
  @media (max-width: 759px) { .ho-score { grid-template-columns: auto 1fr; } .ho-score p, .ho-score button { grid-column: 1 / -1; margin-top: 14px; } }
  .ho-groups { display: grid; gap: 28px 24px; }
  @media (min-width: 900px) { .ho-groups { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .ho-groups h3 { margin: 0 0 10px; font-size: 26px; letter-spacing: -0.035em; font-weight: 700; }
  .ho-groups ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .ho-groups li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 6px; font-size: 15px; line-height: 1.35; }
  .ho-groups i { font-style: normal; font-weight: 700; }
  .ho-groups .is-ok { color: #6e6e73; }
  .ho-groups .is-ok b { font-weight: 400; }
  .ho-groups .is-miss i { color: #ec178f; }
  .ho-groups em { display: block; margin-top: 2px; font-style: normal; color: #55555a; }
  .ho-note { margin: 28px 0 0; font-size: 13px; color: #6e6e73; }





  .ho-kicker { display: block; font-size: 15px; font-weight: 600; color: #ec178f; }
  .ho-cases { padding-top: clamp(64px, 9vw, 120px); padding-bottom: clamp(56px, 8vw, 100px); background: #fff; }
  .ho-h2 { margin: 10px 0 0; font-size: clamp(40px, 6vw, 96px); line-height: .94; letter-spacing: -0.055em; font-weight: 700; }
  .cr.is-pinned .cr-head .ho-h2 { font-size: clamp(32px, min(3.6vw, 6svh), 56px); }
  .ho-cases .cr { --sc: #ec178f; --gut: clamp(20px, 3.4vw, 48px); }

  .ho-meet { ${PAD} padding-top: clamp(88px, 12vw, 168px); padding-bottom: clamp(56px, 8vw, 96px); background: #0a0a0a; color: #fff; }
  .ho-meet h2 { margin: 14px 0 22px; font-size: clamp(64px, 13vw, 220px); line-height: .86; letter-spacing: -0.065em; font-weight: 700; }
  .ho-meet > p { margin: 0 0 34px; max-width: 30em; font-size: clamp(18px, 2vw, 24px); line-height: 1.3; letter-spacing: -0.02em; color: rgba(255,255,255,.72); }
  .ho-meet-form { display: flex; gap: 6px; width: 100%; max-width: 640px; padding: 6px; border-radius: 999px; background: #fff; }
  .ho-meet-form input { flex: 1; min-width: 0; height: 56px; padding: 0 20px; border: 0; outline: 0; background: transparent; color: #0a0a0a; font: inherit; font-size: clamp(16px, 1.8vw, 19px); font-weight: 500; }
  .ho-meet-form button { flex: none; height: 56px; padding: 0 clamp(18px, 2.4vw, 30px); border: 0; border-radius: 999px; background: #ec178f; color: #0a0a0a; font-size: 16px; font-weight: 700; transition: background .2s ease; }
  .ho-meet-form button:hover { background: #0a0a0a; color: #fff; }
  .ho-meet-alt { margin: 16px 0 clamp(56px, 8vw, 104px); font-size: 15px; color: rgba(255,255,255,.6); }
  .ho-mail { color: #fff; font-size: 16px; font-weight: 600; text-decoration: none; }
  .ho-mail:hover { text-decoration: underline; text-underline-offset: 4px; }
`;
