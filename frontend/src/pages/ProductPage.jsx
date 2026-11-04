import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { trackEvent } from "../lib/analytics.js";
import { initTracking, trackPageView } from "../lib/track.js";
import { AgencyShell } from "../components/agency/AgencyShell.jsx";
import { FUNNEL_CSS } from "../components/agency/FunnelWorld.jsx";
import { EventWorld, EVENT_WORLD_CSS } from "../components/agency/EventWorld.jsx";
import { AgentScene, AGENT_CSS } from "../components/agency/AgentScene.jsx";
import { useT } from "../components/agency/i18n.js";
import { FAQ, PACKS, PRODUCT_TITLE } from "./productMeta.js";

/* /eventverktyg (also /pullup) — the free event tool's own page, in the front
   page's language: a pinned scroll scene (EventWorld) that plays what the
   tool does, from one link to a full room to your own CRM; then the agent
   scene, the 2027 part: your AI runs the event through PullUp's MCP, with
   the real tool names; then how to connect, what's in it, why it's free, the
   price of the one thing that costs, and the FAQ. Every claim true of what's
   built (productMeta.js, backend/src/actions). Pre-rendered at build, so
   crawlers that don't run JavaScript read all of it. The FAQ stays Swedish:
   it is also the page's FAQPage data. */

const SIGNUP = `/login?ny=1&next=${encodeURIComponent("/admin/events/new")}`;
const LOGIN = `/login?next=${encodeURIComponent("/admin/events")}`;
const MCP_URL = "https://mcp.pullup.se";

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

// Real actions (backend/src/actions), the ones an organiser's AI gets.
const TOOLS = [
  ["Events", ["create_event", "update_event", "publish_event", "add_event_image", "set_event_cover", "move_event", "delete_event"]],
  ["Guests", ["list_people", "update_guest", "import_contacts", "get_event_stats", "get_stats"]],
  ["Mail", ["preview_mail", "send_mail", "list_sent_mail", "get_mail_credits", "set_sender"]],
  ["Team", ["create_brand", "invite_to_brand", "invite_cohost", "list_team"]],
];

const CONNECT = [
  ["Add PullUp", "In Claude, ChatGPT or another assistant: add a connector with the address below."],
  ["Approve once", "Sign in with your email and say yes. Your AI gets your rights, nothing more."],
  ["Say what you want", "\"Put my release party on PullUp.\" It creates, publishes, invites and keeps count."],
];

function PanelHead({ title, tag, no }) {
  const t = useT();
  return (
    <div className="et-panel-head">
      {no && <span className="et-no">{no}</span>}
      <h3>{t(title)}</h3>
      {tag && <b><i className="et-led" aria-hidden="true" />{t(tag)}</b>}
    </div>
  );
}

function CopyAddress({ location }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <div className="et-addr">
      <code>{MCP_URL}</code>
      <button
        type="button"
        onClick={() => {
          trackEvent("cta_click", { location });
          navigator.clipboard?.writeText(MCP_URL).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1800);
          }).catch(() => {});
        }}
      >
        {done ? t("Copied") : t("Copy")}
      </button>
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
  const title = t("Fill the room. For free.");

  return (
    <AgencyShell css={FUNNEL_CSS + EVENT_WORLD_CSS + AGENT_CSS + ET_CSS} brand>
      <div className="et">
        <EventWorld>
          <small className="et-kicker is-ink">{t("The event tool · Free")}</small>
          <h1 aria-label={title}>
            {title.split(" ").map((word, i) => (
              <span key={i} className="et-rise" aria-hidden="true"><span style={{ animationDelay: `${0.2 + i * 0.12}s` }}>{word}</span></span>
            ))}
          </h1>
          <div className="et-powers">
            <Link className="et-panel is-go" to={SIGNUP} onClick={signup("tool_hero")}>
              <PanelHead title="Make your event" tag="Free" />
              <ul className="et-spec">
                {["Event page", "Sign-ups", "Guest list", "CRM", "Mail"].map((x) => <li key={x}>{t(x)}</li>)}
              </ul>
              <span className="et-go">{t("Create a free account")} <span aria-hidden="true">→</span></span>
            </Link>
            <div className="et-panel">
              <PanelHead title="Or let your AI do it" tag="MCP" />
              <CopyAddress location="tool_hero_mcp" />
              <a className="et-more" href="#agents">{t("See how")} <span aria-hidden="true">↓</span></a>
            </div>
          </div>
        </EventWorld>

        <div id="agents" />
        <AgentScene>
          <small className="et-kicker">{t("2027 · Agents are users")}</small>
          <h2 className="et-h2 is-agents">{t("Say it. Your AI does the rest.")}</h2>
          <p className="et-lead">{t("PullUp is built for AI assistants from the start. Connect Claude, ChatGPT or another assistant once, and it can do what you can: create the event, publish it, see who's coming and email them.")}</p>
        </AgentScene>

        <section className="et-connect" data-pc-tone="dark" data-pc-section="connect" data-pc-order="3">
          <div className="et-connect-head">
            <small className="et-kicker">{t("Connect in a minute")}</small>
            <h2 className="et-h2">{t("Your AI, your events.")}</h2>
            <p className="et-lead">{t("Nothing more than you can do yourself, and you disconnect it whenever you like. In browsers with WebMCP, your AI gets the same tools right on the page.")}</p>
          </div>
          <ol className="et-steps">
            {CONNECT.map(([head, line], i) => (
              <li key={head} className="et-panel">
                <PanelHead no={`0${i + 1}`} title={head} />
                <p>{t(line)}</p>
                {i === 0 && <CopyAddress location="tool_connect_mcp" />}
              </li>
            ))}
          </ol>
          <div className="et-tools">
            <div className="et-tools-head">
              <h3>{t("What your AI can do")}</h3>
              <span>{t("The real tools, by name.")}</span>
            </div>
            <div className="et-tools-grid">
              {TOOLS.map(([group, names]) => (
                <div key={group} className="et-panel is-flat">
                  <PanelHead title={group} />
                  <ul>{names.map((n) => <li key={n}><code>{n}</code></li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="et-features" data-pc-section="features" data-pc-order="4">
          <small className="et-kicker">{t("What's in it")}</small>
          <h2 className="et-h2">{t("Everything you need for people to come.")}</h2>
          <div className="et-grid">
            {FEATURES.map(([head, text], i) => (
              <article key={head} className="et-panel">
                <PanelHead no={String(i + 1).padStart(2, "0")} title={head} />
                <p>{t(text)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="et-why" data-pc-section="why" data-pc-order="5">
          <small className="et-kicker is-ink">{t("Why is it free?")}</small>
          <h2 className="et-h2">{t("Because good evenings shouldn't cost per guest.")}</h2>
          <div className="et-why-grid">
            {WHY.map(([head, text]) => (
              <article key={head}>
                <h3>{t(head)}</h3>
                <p>{t(text)}</p>
              </article>
            ))}
          </div>
          <p className="et-honest">
            <b>{t("The only thing that costs:")}</b> {t("emailing many at once, like invitations and newsletters, because every email costs to send. 5,000 emails for 99 kr. Confirmations to your guests are always free.")}
          </p>
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
          <small className="et-kicker">{t("Free, for the culture")}</small>
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
  .et { --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace; background: #fff; color: #0a0a0a; }
  .et button { font: inherit; cursor: pointer; }
  .et-kicker { display: block; margin: 0 0 16px; font-size: 15px; font-weight: 600; color: #ec178f; }
  .et-kicker.is-ink { color: #0a0a0a; }
  .et-h2 { margin: 0 0 clamp(22px, 3vw, 40px); max-width: 13em; font-size: clamp(40px, 6.4vw, 104px); line-height: .94; letter-spacing: -0.055em; font-weight: 700; }
  .et-lead { margin: 0; max-width: 32em; font-size: clamp(17px, 1.6vw, 21px); line-height: 1.42; letter-spacing: -0.01em; color: rgba(255,255,255,.7); }
  .et-btn { display: inline-flex; align-items: center; height: 58px; padding: 0 32px; border-radius: 999px; font-size: 17px; font-weight: 700; text-decoration: none; transition: background .2s ease, color .2s ease, transform .3s cubic-bezier(.16,1,.3,1); }
  .et-btn.is-pink { background: #ec178f; color: #0a0a0a; }
  .et-btn.is-pink:hover { background: #0a0a0a; color: #fff; transform: translateY(-2px); }
  .et-end .et-btn.is-pink:hover { background: #fff; color: #0a0a0a; }
  .et-ctas { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; }

  /* ─── the hero, over EventWorld's pink ─── */
  .ew .fw-hero h1 { margin: 0 0 26px; max-width: 7em; font-size: clamp(56px, 10.6vw, 184px); line-height: .88; letter-spacing: -0.065em; font-weight: 700; }
  .et-rise { display: inline-block; overflow: hidden; padding: 0 .1em .22em 0; margin: 0 .12em -.22em 0; vertical-align: top; }
  .et-rise > span { display: inline-block; animation: et-rise 1s cubic-bezier(.16,1,.3,1) both; }
  @keyframes et-rise { from { transform: translateY(110%) rotate(4deg); } to { transform: none; } }
  .et-powers { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 12px; max-width: 860px; animation: et-fade .9s .8s cubic-bezier(.16,1,.3,1) both; }
  @keyframes et-fade { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .et-rise > span, .et-powers { animation: none; } }

  /* ─── grey hardware panels, the front page's look ─── */
  .et-panel { position: relative; display: grid; align-content: start; gap: 14px; margin: 0; padding: 14px; border-radius: 10px; color: #111; text-decoration: none;
    background: linear-gradient(180deg, #e4e3df 0%, #cfcec9 100%); border: 1px solid #8f8e89;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.85), inset 0 -2px 0 rgba(0,0,0,.12), 0 18px 40px -20px rgba(70,0,40,.6);
    transition: transform .3s cubic-bezier(.16,1,.3,1), box-shadow .3s ease; }
  a.et-panel:hover { transform: translateY(-2px); }
  .et-panel.is-flat { box-shadow: inset 0 1px 0 rgba(255,255,255,.85), inset 0 -2px 0 rgba(0,0,0,.12); }
  .et-panel-head { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,.14); box-shadow: 0 1px 0 rgba(255,255,255,.7); }
  .et-panel-head h3 { flex: 1; margin: 0; font-family: var(--mono); font-size: 13px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; line-height: 1.2; }
  .et-panel-head b { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border: 1px solid rgba(0,0,0,.35); border-radius: 4px; font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; background: rgba(255,255,255,.35); }
  .et-no { padding: 3px 6px; border-radius: 4px; background: #1a1a1a; color: #e4e3df; font-family: var(--mono); font-size: 10.5px; font-weight: 700; letter-spacing: .04em; }
  .et-led { width: 7px; height: 7px; border-radius: 50%; background: #ec178f; box-shadow: 0 0 0 1px rgba(0,0,0,.25), 0 0 8px #ec178f; animation: et-led 2.4s ease-in-out infinite; }
  @keyframes et-led { 50% { opacity: .45; } }
  .et-panel p { margin: 0; font-size: 15px; line-height: 1.45; color: #2e2d2a; }
  .et-spec { display: flex; flex-wrap: wrap; gap: 5px 12px; margin: -2px 0 0; padding: 0; list-style: none; font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #3a3935; }
  .et-spec li { display: inline-flex; align-items: center; gap: 6px; }
  .et-spec li::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #ec178f; box-shadow: 0 0 0 1px rgba(0,0,0,.25), 0 0 5px #ec178f; }
  .et-go { justify-self: start; display: inline-flex; align-items: center; gap: 8px; height: 46px; padding: 0 18px; border: 1px solid #000; border-radius: 6px; background: linear-gradient(180deg, #2a2a2a, #0d0d0d); color: #f2f1ec; font-family: var(--mono); font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 2px 0 rgba(0,0,0,.25); transition: background .15s ease; }
  .et-panel.is-go:hover .et-go { background: linear-gradient(180deg, #f43aa5, #d90f80); color: #111; border-color: #8a0a52; }
  .et-addr { display: flex; gap: 6px; }
  .et-addr code { flex: 1; min-width: 0; display: flex; align-items: center; height: 46px; padding: 0 12px; border: 1px solid #7d7c77; border-radius: 6px; background: #f7f6f1; color: #111; font-family: var(--mono); font-size: 15px; box-shadow: inset 0 2px 3px rgba(0,0,0,.14); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .et-addr button { flex: none; height: 46px; padding: 0 16px; border: 1px solid #000; border-radius: 6px; background: linear-gradient(180deg, #2a2a2a, #0d0d0d); color: #f2f1ec; font-family: var(--mono); font-size: 12.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 2px 0 rgba(0,0,0,.25); }
  .et-addr button:hover { background: linear-gradient(180deg, #f43aa5, #d90f80); color: #111; border-color: #8a0a52; }
  .et-more { justify-self: start; font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #111; text-decoration: none; }
  .et-more:hover { color: #c40f76; }
  @media (max-width: 759px) {
    .ew .fw-hero h1 { margin-bottom: 18px; }
    .et-powers { grid-template-columns: 1fr; gap: 10px; }
    .et-powers .et-panel:last-child .et-more, .et-powers .et-spec { display: none; }
    .et-powers .et-panel { gap: 10px; padding: 10px; }
    .et-powers .et-panel-head { padding-bottom: 8px; }
    .et-powers .et-go, .et-powers .et-addr code, .et-powers .et-addr button { height: 42px; }
    .ew .fw-hero h1 { font-size: clamp(48px, 14vw, 64px); }
  }
  @media (prefers-reduced-motion: reduce) { .et-led { animation: none; } }

  /* ─── the agent scene's copy ─── */
  .ag-copy .et-h2.is-agents { max-width: 9em; font-size: clamp(40px, 6vw, 100px); }
  @media (max-width: 899px) {
    .ag-copy .et-kicker { margin-bottom: 8px; }
    .ag-copy .et-h2.is-agents { margin-bottom: 10px; font-size: clamp(32px, 9vw, 44px); }
    .ag-copy .et-lead { font-size: 15px; }
  }

  /* ─── connect + the tools ─── */
  .et-connect { ${PAD} padding-top: clamp(80px, 10vw, 140px); padding-bottom: clamp(80px, 11vw, 150px); background: #0a0a0a; color: #fff; }
  .et-connect-head { margin-bottom: clamp(36px, 5vw, 64px); }
  .et-steps { list-style: none; margin: 0 0 clamp(48px, 6vw, 80px); padding: 0; display: grid; gap: 12px; }
  @media (min-width: 900px) { .et-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .et-tools-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 16px; margin-bottom: 16px; }
  .et-tools-head h3 { margin: 0; font-size: clamp(28px, 3.2vw, 48px); letter-spacing: -0.045em; line-height: 1; }
  .et-tools-head span { font-family: var(--mono); font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: rgba(255,255,255,.5); }
  .et-tools-grid { display: grid; gap: 12px; }
  @media (min-width: 700px) { .et-tools-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (min-width: 1100px) { .et-tools-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  .et-tools-grid ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .et-tools-grid code { display: inline-block; padding: 3px 7px; border-radius: 4px; background: #1a1a1a; color: #e4e3df; font-family: var(--mono); font-size: 12.5px; }

  /* ─── features ─── */
  .et-features { ${PAD} padding-top: clamp(80px, 11vw, 150px); padding-bottom: clamp(80px, 11vw, 140px); }
  .et-grid { display: grid; gap: 12px; }
  @media (min-width: 700px) { .et-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (min-width: 1100px) { .et-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  .et-grid .et-panel { box-shadow: inset 0 1px 0 rgba(255,255,255,.85), inset 0 -2px 0 rgba(0,0,0,.12), 0 16px 34px -24px rgba(0,0,0,.5); }

  .et-why { ${PAD} padding-top: clamp(80px, 11vw, 150px); padding-bottom: clamp(72px, 10vw, 130px); background: radial-gradient(120% 100% at 80% 0%, #f43aa5 0%, #ec178f 55%, #d90f80 100%); }
  .et-why-grid { display: grid; gap: 28px; }
  @media (min-width: 900px) { .et-why-grid { grid-template-columns: repeat(3, 1fr); gap: 32px; } }
  .et-why-grid article { padding-top: 18px; border-top: 2px solid #0a0a0a; }
  .et-why-grid h3 { margin: 0 0 10px; font-size: clamp(24px, 2.4vw, 34px); line-height: 1.02; letter-spacing: -0.04em; }
  .et-why-grid p { margin: 0; font-size: 17px; line-height: 1.45; }
  .et-honest { margin: clamp(40px, 5vw, 64px) 0 0; max-width: 46em; padding: 20px 24px; border-radius: 20px; background: rgba(10,10,10,.9); color: #fff; font-size: 17px; line-height: 1.45; }

  .et-price { ${PAD} padding-top: clamp(80px, 11vw, 140px); padding-bottom: clamp(48px, 6vw, 80px); }
  .et-plans { display: grid; gap: 12px; }
  @media (min-width: 900px) { .et-plans { grid-template-columns: 1fr 1fr; } }
  .et-plans article { display: grid; gap: 14px; align-content: start; padding: clamp(26px, 3vw, 40px); border-radius: 28px; background: #f4f4f5; }
  .et-plans .is-free { background: #0a0a0a; color: #fff; }
  .et-plans h3 { margin: 0; font-size: 22px; letter-spacing: -0.03em; }
  .et-amount { margin: 0; font-size: clamp(64px, 8vw, 120px); line-height: .9; letter-spacing: -0.06em; font-weight: 700; color: #ec178f; }
  .et-plans ul { margin: 0 0 8px; padding-left: 20px; display: grid; gap: 8px; font-size: 17px; }
  .et-plans .et-btn { justify-self: start; }
  .et-plans .is-free .et-btn.is-pink:hover { background: #fff; color: #0a0a0a; }
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
