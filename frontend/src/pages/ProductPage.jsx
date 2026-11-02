import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { trackEvent } from "../lib/analytics.js";
import { initTracking, trackPageView } from "../lib/track.js";
import { AgencyShell } from "../components/agency/AgencyShell.jsx";
import { useT } from "../components/agency/i18n.js";
import { FAQ, PACKS, PRODUCT_TITLE } from "./productMeta.js";

/* /eventverktyg (also /pullup) — the free event tool's own page, in the
   agency's look: what it does, that it's free and why, how an AI can run it,
   the price of the one thing that costs, and a way to make an account. Every
   claim true of what's built (productMeta.js). Pre-rendered at build, so
   crawlers that don't run JavaScript read all of it. The FAQ stays Swedish:
   it is also the page's FAQPage data. */

const SIGNUP = `/login?ny=1&next=${encodeURIComponent("/admin/events/new")}`;
const LOGIN = `/login?next=${encodeURIComponent("/admin/events")}`;

const STEPS = [
  ["Create.", "Title, time, place and an image or video. The page is ready in a minute, in your own design."],
  ["Share.", "One link that looks sharp in Instagram, WhatsApp and Messenger."],
  ["Fill the room.", "Guests sign up with name and email, get a confirmation with a calendar invite, and you watch the list grow."],
];

const FEATURES = [
  ["The event page", "Title, time, place, text and a cover image or video, in your own design. Ready to share in a minute, with a sharp preview in Instagram, WhatsApp and Messenger."],
  ["Sign-up", "Guests write their name and email. No account, no app. They can also say yes to hearing about your next events."],
  ["Confirmation and calendar", "Everyone who signs up gets a confirmation email with the event and a calendar invite: Google Calendar, Apple and Outlook."],
  ["Spots and waitlist", "Set a maximum number of spots. When it's full, the next person lands on the waitlist, automatically."],
  ["Secret place or time", "Reveal the place or the date only when you want to. Until then, guests see your hint."],
  ["The guest list", "See who's coming, move people between signed up and waitlist, check off who came and export the list."],
  ["Your own CRM", "Everyone who has signed up to your events in one place: how many times they've come and who wants to hear more."],
  ["Several brands", "One login can run several brands, each with its own events, CRM and sends. Guests see the brand as host and sender."],
];

const WHY = [
  ["We're an agency, not a ticket site.", "We make our money building brands. The tool doesn't have to pay for itself, so we don't take a cut of your evening."],
  ["For the culture.", "Stockholm needs more evenings, not more fees. Clubs, galleries, bands and associations should be able to gather people without paying per guest."],
  ["Your guests are yours.", "We never sell your guests' details. You own the list and can export it whenever you like."],
];

function Mock() {
  const t = useT();
  const [n, setN] = useState(64);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const id = setInterval(() => setN((v) => (v >= 118 ? 64 : v + 1)), 140);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="et-mock" aria-hidden="true">
      <div className="et-phone">
        <div className="et-cover"><span>{t("Release party")}</span></div>
        <div className="et-page">
          <b>{t("Release party")}</b>
          <p>{t("Sat 7 Nov · 19:00 · Slakthusområdet")}</p>
          <div className="et-bar"><i style={{ width: `${(n / 120) * 100}%` }} /></div>
          <small>{t(`${n} of 120 coming`)}</small>
          <span className="et-rsvp">{t("Sign up")}</span>
        </div>
      </div>
      <div className="et-chip et-chip-1"><i>✓</i><span><b>{t("You're signed up")}</b>{t("Added to your calendar")}</span></div>
      <div className="et-chip et-chip-2">
        <b>{t("Guest list")}</b>
        <span><i className="is-on" />Alva Lind</span>
        <span><i className="is-on" />Omar Haddad</span>
        <span><i />Ellen Berg</span>
      </div>
      <div className="et-chip et-chip-3"><b>{t("Waitlist")}</b><span>{t("12 waiting")}</span></div>
    </div>
  );
}

export function ProductPage() {
  const t = useT();

  useEffect(() => {
    initTracking();
    trackPageView("pullup");
    const prev = document.title;
    document.title = PRODUCT_TITLE;
    return () => { document.title = prev; };
  }, []);

  const signup = (location) => () => trackEvent("cta_click", { location });

  return (
    <AgencyShell css={ET_CSS} brand>
      <div className="et">
        <section className="et-hero" data-pc-tone="dark" data-pc-section="hero" data-pc-order="1">
          <div>
            <small className="et-kicker">{t("The event tool · Free")}</small>
            <h1>{t("Fill the room. For free.")}</h1>
            <p>{t("Event page, sign-up, confirmations with a calendar invite, waitlist, guest list and your own CRM. Everything you need for people to show up, without paying a krona.")}</p>
            <div className="et-ctas">
              <Link className="et-btn is-pink" to={SIGNUP} onClick={signup("tool_hero")}>{t("Create a free account")}</Link>
              <a className="et-btn is-ghost" href="#how">{t("See how it works")}</a>
            </div>
            <small className="et-note">{t("No card. No trial. No limit on events or guests.")}</small>
          </div>
          <Mock />
        </section>

        <section className="et-how" id="how" data-pc-section="how" data-pc-order="2">
          <small className="et-kicker">{t("How it works")}</small>
          <ol>
            {STEPS.map(([title, line], i) => (
              <li key={title}>
                <span>0{i + 1}</span>
                <h2>{t(title)}</h2>
                <p>{t(line)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="et-features" data-pc-section="features" data-pc-order="3">
          <h2 className="et-h2">{t("Everything you need for people to come.")}</h2>
          <div className="et-grid">
            {FEATURES.map(([title, text]) => (
              <article key={title}>
                <h3>{t(title)}</h3>
                <p>{t(text)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="et-why" data-pc-section="why" data-pc-order="4">
          <small className="et-kicker is-ink">{t("Why is it free?")}</small>
          <h2 className="et-h2">{t("Because good evenings shouldn't cost per guest.")}</h2>
          <div className="et-why-grid">
            {WHY.map(([title, text]) => (
              <article key={title}>
                <h3>{t(title)}</h3>
                <p>{t(text)}</p>
              </article>
            ))}
          </div>
          <p className="et-honest">
            <b>{t("The only thing that costs:")}</b> {t("emailing many at once, like invitations and newsletters, because every email costs to send. 5,000 emails for 99 kr. Confirmations to your guests are always free.")}
          </p>
        </section>

        <section className="et-ai" data-pc-tone="dark" data-pc-section="ai" data-pc-order="5">
          <div>
            <small className="et-kicker">{t("For your AI")}</small>
            <h2 className="et-h2">{t("Tell your AI to put it on PullUp.")}</h2>
            <p>{t("Your AI assistant can do everything you can do here: create and publish the event, see who's coming and email them. Nothing more than you can, and you disconnect it whenever you like.")}</p>
            <p className="et-small">{t("Claude, ChatGPT and others: add a connector with the address")} <code>https://mcp.pullup.se</code>{t(", sign in and approve once.")}</p>
          </div>
          <div className="et-chat" aria-label={t("Example")}>
            <p className="et-you">{t("Put my release party on PullUp, Saturday 7 November at 19:00 at Slakthusområdet, max 120 guests.")}</p>
            <p className="et-bot">{t("Done. The event is saved as a draft. Want me to publish it and give you the link?")}</p>
          </div>
        </section>

        <section className="et-price" id="pris" data-pc-section="price" data-pc-order="6">
          <h2 className="et-h2">{t("Price")}</h2>
          <div className="et-plans">
            <article className="is-free">
              <h3>{t("Free")}</h3>
              <p className="et-amount">0 kr</p>
              <ul>
                <li>{t("Unlimited events and guests")}</li>
                <li>{t("Sign-up, confirmation email and calendar invite")}</li>
                <li>{t("Waitlist, guest list and CRM")}</li>
                <li>{t("Your AI as assistant")}</li>
              </ul>
              <Link className="et-btn is-pink" to={SIGNUP} onClick={signup("tool_price")}>{t("Create a free account")}</Link>
            </article>
            <article>
              <h3>{t("Email to many")}</h3>
              <p className="et-sub">{t("Invitations and newsletters to your guests. One email per recipient, and the credits never expire.")}</p>
              <table>
                <tbody>
                  {PACKS.map((p) => (
                    <tr key={p.mails}><td>{t(`${p.mails} emails`)}</td><td>{p.price}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="et-sub">{t("Prices excl. VAT. Confirmations to your guests are always free.")}</p>
            </article>
          </div>
        </section>

        <section className="et-faq" data-pc-section="faq" data-pc-order="7" lang="sv">
          <h2 className="et-h2">{t("Questions")}</h2>
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>

        <section className="et-end" data-pc-tone="dark" data-pc-section="signup" data-pc-order="8">
          <h2>{t("Your next event starts here.")}</h2>
          <div className="et-ctas">
            <Link className="et-btn is-pink" to={SIGNUP} onClick={signup("tool_end")}>{t("Create a free account")}</Link>
            <Link className="et-link" to={LOGIN}>{t("Already have an account? Log in")}</Link>
          </div>
        </section>
      </div>
    </AgencyShell>
  );
}

const PAD = "padding-left: clamp(20px, 3.4vw, 48px); padding-right: clamp(20px, 3.4vw, 48px);";

const ET_CSS = `
  .et { background: #fff; color: #0a0a0a; }
  .et-kicker { display: block; margin: 0 0 16px; font-size: 15px; font-weight: 600; color: #ec178f; }
  .et-kicker.is-ink { color: #0a0a0a; }
  .et-h2 { margin: 0 0 clamp(28px, 4vw, 48px); max-width: 13em; font-size: clamp(40px, 6.4vw, 104px); line-height: .94; letter-spacing: -0.055em; font-weight: 700; }
  .et-btn { display: inline-flex; align-items: center; height: 58px; padding: 0 32px; border-radius: 999px; font-size: 17px; font-weight: 700; text-decoration: none; transition: background .2s ease, color .2s ease, transform .3s cubic-bezier(.16,1,.3,1); }
  .et-btn.is-pink { background: #ec178f; color: #0a0a0a; }
  .et-btn.is-pink:hover { background: #fff; transform: translateY(-2px); }
  .et-btn.is-ghost { border: 2px solid rgba(255,255,255,.35); color: #fff; }
  .et-btn.is-ghost:hover { border-color: #fff; }
  .et-ctas { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; }

  .et-hero { ${PAD} min-height: 100svh; padding-top: 120px; padding-bottom: clamp(48px, 7vw, 88px); display: grid; align-items: center; gap: 56px; background: radial-gradient(90% 70% at 80% 40%, #2a0a1d 0%, #0a0a0a 65%); color: #fff; }
  @media (min-width: 1000px) { .et-hero { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); } }
  .et-hero h1 { margin: 0 0 24px; max-width: 7em; font-size: clamp(60px, 9.6vw, 168px); line-height: .88; letter-spacing: -0.065em; font-weight: 700; }
  .et-hero h1 + p { margin: 0 0 34px; max-width: 30em; font-size: clamp(18px, 1.9vw, 24px); line-height: 1.32; letter-spacing: -0.02em; color: rgba(255,255,255,.75); }
  .et-note { display: block; margin-top: 18px; font-size: 14px; color: rgba(255,255,255,.55); }

  .et-mock { position: relative; justify-self: center; width: min(100%, 420px); aspect-ratio: 4 / 5; }
  .et-phone { position: absolute; inset: 0 12% 0 12%; border-radius: 34px; border: 1px solid rgba(255,255,255,.14); background: #141414; overflow: hidden; box-shadow: 0 40px 90px rgba(236,23,143,.18); animation: et-in .9s .1s cubic-bezier(.16,1,.3,1) both; }
  .et-cover { height: 46%; display: flex; align-items: flex-end; padding: 18px; background: radial-gradient(120% 90% at 30% 20%, #f43aa5 0%, #ec178f 45%, #5a0636 100%); }
  .et-cover span { font-size: clamp(26px, 3vw, 36px); font-weight: 700; letter-spacing: -0.05em; line-height: .9; color: #0a0a0a; }
  .et-page { display: grid; gap: 8px; padding: 18px; }
  .et-page b { font-size: 19px; letter-spacing: -0.03em; }
  .et-page p { margin: 0; font-size: 13px; color: rgba(255,255,255,.6); }
  .et-bar { height: 6px; margin-top: 8px; border-radius: 6px; background: rgba(255,255,255,.12); overflow: hidden; }
  .et-bar i { display: block; height: 100%; border-radius: 6px; background: #ec178f; transition: width .14s linear; }
  .et-page small { font-size: 12px; color: rgba(255,255,255,.7); font-variant-numeric: tabular-nums; }
  .et-rsvp { margin-top: 10px; display: grid; place-items: center; height: 44px; border-radius: 999px; background: #fff; color: #0a0a0a; font-size: 15px; font-weight: 700; }
  .et-chip { position: absolute; display: grid; gap: 6px; padding: 12px 14px; border-radius: 16px; background: #fff; color: #0a0a0a; font-size: 13px; box-shadow: 0 18px 40px rgba(0,0,0,.4); animation: et-in .8s cubic-bezier(.16,1,.3,1) both; }
  .et-chip b { font-size: 13px; }
  .et-chip-1 { left: -2%; top: 14%; grid-template-columns: auto 1fr; align-items: center; gap: 10px; animation-delay: .6s; }
  .et-chip-1 i { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: #ec178f; font-style: normal; font-weight: 700; }
  .et-chip-1 span { display: grid; color: #55555a; }
  .et-chip-1 span b { color: #0a0a0a; }
  .et-chip-2 { right: -4%; top: 52%; min-width: 150px; animation-delay: .9s; }
  .et-chip-2 span { display: flex; align-items: center; gap: 8px; color: #3a3a3c; }
  .et-chip-2 span i { width: 14px; height: 14px; border-radius: 4px; border: 1.5px solid #c7c7cc; }
  .et-chip-2 span i.is-on { border-color: #ec178f; background: #ec178f; }
  .et-chip-3 { left: 4%; bottom: 6%; animation-delay: 1.2s; }
  .et-chip-3 span { color: #55555a; }
  @keyframes et-in { from { opacity: 0; transform: translateY(24px) scale(.97); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .et-phone, .et-chip { animation: none; } }

  .et-how { ${PAD} padding-top: clamp(80px, 11vw, 150px); padding-bottom: clamp(56px, 8vw, 100px); }
  .et-how ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
  @media (min-width: 900px) { .et-how ol { grid-template-columns: repeat(3, 1fr); gap: 32px; } }
  .et-how li { padding: 22px 0 28px; border-top: 2px solid #0a0a0a; }
  .et-how li > span { font-size: 15px; font-weight: 600; color: #ec178f; }
  .et-how h2 { margin: 10px 0 12px; font-size: clamp(44px, 5.6vw, 92px); line-height: .92; letter-spacing: -0.055em; font-weight: 700; }
  .et-how p { margin: 0; max-width: 24em; font-size: 17px; line-height: 1.45; color: #3a3a3c; }

  .et-features { ${PAD} padding-top: clamp(40px, 6vw, 80px); padding-bottom: clamp(80px, 11vw, 140px); }
  .et-grid { display: grid; gap: 12px; }
  @media (min-width: 700px) { .et-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (min-width: 1100px) { .et-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  .et-grid article { padding: clamp(22px, 2.4vw, 30px); border-radius: 24px; background: #f4f4f5; transition: background .25s ease, color .25s ease; }
  .et-grid article:hover { background: #0a0a0a; color: #fff; }
  .et-grid h3 { margin: 0 0 10px; font-size: 22px; letter-spacing: -0.03em; }
  .et-grid p { margin: 0; font-size: 15px; line-height: 1.45; opacity: .75; }

  .et-why { ${PAD} padding-top: clamp(80px, 11vw, 150px); padding-bottom: clamp(72px, 10vw, 130px); background: radial-gradient(120% 100% at 80% 0%, #f43aa5 0%, #ec178f 55%, #d90f80 100%); }
  .et-why-grid { display: grid; gap: 28px; }
  @media (min-width: 900px) { .et-why-grid { grid-template-columns: repeat(3, 1fr); gap: 32px; } }
  .et-why-grid article { padding-top: 18px; border-top: 2px solid #0a0a0a; }
  .et-why-grid h3 { margin: 0 0 10px; font-size: clamp(24px, 2.4vw, 34px); line-height: 1.02; letter-spacing: -0.04em; }
  .et-why-grid p { margin: 0; font-size: 17px; line-height: 1.45; }
  .et-honest { margin: clamp(40px, 5vw, 64px) 0 0; max-width: 46em; padding: 20px 24px; border-radius: 20px; background: rgba(10,10,10,.9); color: #fff; font-size: 17px; line-height: 1.45; }

  .et-ai { ${PAD} padding-top: clamp(80px, 11vw, 150px); padding-bottom: clamp(80px, 11vw, 150px); display: grid; gap: 48px; align-items: center; background: #0a0a0a; color: #fff; }
  @media (min-width: 1000px) { .et-ai { grid-template-columns: 1.1fr 1fr; } }
  .et-ai p { margin: 0 0 16px; max-width: 34em; font-size: 18px; line-height: 1.45; color: rgba(255,255,255,.75); }
  .et-ai .et-small { font-size: 15px; color: rgba(255,255,255,.6); }
  .et-ai code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92em; padding: 2px 6px; border-radius: 6px; background: rgba(255,255,255,.12); color: #fff; overflow-wrap: anywhere; }
  .et-chat { display: grid; gap: 12px; }
  .et-chat p { margin: 0; padding: 16px 18px; border-radius: 22px; font-size: 17px; line-height: 1.45; max-width: 90%; }
  .et-you { justify-self: end; background: #ec178f; color: #0a0a0a; border-bottom-right-radius: 6px; }
  .et-bot { background: rgba(255,255,255,.1); color: #fff; border-bottom-left-radius: 6px; }

  .et-price { ${PAD} padding-top: clamp(80px, 11vw, 140px); padding-bottom: clamp(48px, 6vw, 80px); }
  .et-plans { display: grid; gap: 12px; }
  @media (min-width: 900px) { .et-plans { grid-template-columns: 1fr 1fr; } }
  .et-plans article { display: grid; gap: 14px; align-content: start; padding: clamp(26px, 3vw, 40px); border-radius: 28px; background: #f4f4f5; }
  .et-plans .is-free { background: #0a0a0a; color: #fff; }
  .et-plans h3 { margin: 0; font-size: 22px; letter-spacing: -0.03em; }
  .et-amount { margin: 0; font-size: clamp(64px, 8vw, 120px); line-height: .9; letter-spacing: -0.06em; font-weight: 700; color: #ec178f; }
  .et-plans ul { margin: 0 0 8px; padding-left: 20px; display: grid; gap: 8px; font-size: 17px; }
  .et-plans .et-btn { justify-self: start; }
  .et-sub { margin: 0; font-size: 15px; line-height: 1.45; color: #55555a; }
  .et-plans table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .et-plans td { padding: 14px 0; border-bottom: 1px solid rgba(0,0,0,.1); font-size: 18px; }
  .et-plans td:last-child { text-align: right; font-weight: 700; }

  .et-faq { ${PAD} padding-top: clamp(48px, 6vw, 80px); padding-bottom: clamp(80px, 10vw, 130px); }
  .et-faq details { max-width: 64em; border-bottom: 1px solid rgba(0,0,0,.12); }
  .et-faq summary { cursor: pointer; padding: 20px 0; font-size: clamp(18px, 1.8vw, 22px); font-weight: 600; letter-spacing: -0.02em; list-style: none; }
  .et-faq summary::-webkit-details-marker { display: none; }
  .et-faq summary::after { content: "+"; float: right; color: #ec178f; font-weight: 500; }
  .et-faq details[open] summary::after { content: "–"; }
  .et-faq details p { margin: 0 0 22px; max-width: 46em; font-size: 16px; line-height: 1.55; color: #3a3a3c; }

  .et-end { ${PAD} padding-top: clamp(88px, 12vw, 168px); padding-bottom: clamp(72px, 10vw, 130px); background: #0a0a0a; color: #fff; }
  .et-end h2 { margin: 0 0 36px; max-width: 8em; font-size: clamp(56px, 10vw, 176px); line-height: .88; letter-spacing: -0.065em; font-weight: 700; }
  .et-link { color: #fff; font-size: 16px; font-weight: 600; text-decoration: none; }
  .et-link:hover { text-decoration: underline; text-underline-offset: 4px; }
`;
