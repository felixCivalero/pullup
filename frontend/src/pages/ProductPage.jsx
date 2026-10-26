import { useEffect } from "react";
import { Link } from "react-router-dom";
import { initTracking, trackPageView } from "../lib/track.js";
import { FAQ, PACKS, PRODUCT_DESCRIPTION, PRODUCT_TITLE } from "./productMeta.js";

/* /pullup — the event platform, for people and for the AIs that look things
   up for them. Written the way people ask ("gratis eventsida med anmälan"),
   every claim true of what's built (productMeta.js). Pre-rendered at build,
   so crawlers that don't run JavaScript read all of it. */

const SIGNUP = `/login?next=${encodeURIComponent("/admin/events/new")}`;

const FEATURES = [
  ["Eventsidan", "Titel, tid, plats, text och omslagsbild eller video – med din egen design. Klar att dela på en minut, med snygg förhandsvisning i Instagram, WhatsApp och Messenger."],
  ["Anmälan", "Gästerna skriver namn och e-post. Inget konto, ingen app. De kan också säga ja till att höra om dina nästa event."],
  ["Bekräftelse och kalender", "Varje anmäld får ett bekräftelsemejl med eventet och en kalenderinbjudan – Google Kalender, Apple och Outlook."],
  ["Platser och väntelista", "Sätt ett max antal platser. När det är fullt hamnar nästa på väntelistan, automatiskt."],
  ["Hemlig plats eller tid", "Visa platsen eller datumet först när du vill. Gästerna ser din ledtråd så länge."],
  ["Gästlistan", "Se vem som kommer, flytta mellan anmäld och väntelista, bocka av vem som kom och exportera listan."],
  ["Din CRM", "Alla som anmält sig till dina event på ett ställe: hur många gånger de kommit och vilka som vill höra mer."],
  ["Mejl till gästerna", "Inbjudningar och tack-mejl till dina gäster, med avregistrering inbyggd. Det enda som kostar."],
];

export function ProductPage() {
  useEffect(() => {
    initTracking();
    trackPageView("pullup");
    const prev = document.title;
    document.title = PRODUCT_TITLE;
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="pp">
      <style>{PRODUCT_CSS}</style>
      <header className="pp-top">
        <Link to="/pullup" className="pp-logo">PullUp</Link>
        <nav>
          <a href="#ai">Din AI</a>
          <a href="#pris">Pris</a>
          <Link to="/login" className="pp-login">Logga in</Link>
        </nav>
      </header>

      <main>
        <section className="pp-hero">
          <p className="pp-kicker">Gratis eventplattform</p>
          <h1>Eventsida med anmälan, kalenderinbjudan och gästlista. Gratis.</h1>
          <p className="pp-lead">{PRODUCT_DESCRIPTION}</p>
          <div className="pp-ctas">
            <Link to={SIGNUP} className="pp-btn is-dark">Skapa ditt event</Link>
            <a href="#ai" className="pp-btn">Låt din AI göra det</a>
          </div>
          <p className="pp-note">Inget kort. Första inloggningen skapar kontot.</p>
        </section>

        <section className="pp-features" aria-labelledby="pp-what">
          <h2 id="pp-what">Allt du behöver för att folk ska komma</h2>
          <div className="pp-grid">
            {FEATURES.map(([title, text]) => (
              <article key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="pp-ai" id="ai" aria-labelledby="pp-ai-h">
          <div className="pp-ai-in">
            <p className="pp-kicker">För din AI</p>
            <h2 id="pp-ai-h">Säg åt din AI att lägga upp det på PullUp.</h2>
            <p>
              Din AI-assistent kan göra allt du kan göra här: skapa och publicera eventet, se vilka som kommer och mejla dem.
              Inget mer än du själv kan, och du kopplar från den när du vill.
            </p>
            <div className="pp-chat" aria-label="Exempel">
              <p className="pp-you">Lägg upp min releasefest på PullUp lördag 7 november kl 19 på Slakthusområdet, max 120 gäster.</p>
              <p className="pp-bot">Klart. Eventet ligger som utkast – vill du att jag publicerar det och ger dig länken?</p>
            </div>
            <ol>
              <li><b>Claude, ChatGPT och andra:</b> lägg till en connector med adressen <code>https://mcp.pullup.se</code>, logga in och godkänn en gång.</li>
              <li><b>I webbläsaren:</b> pullup.se ger AI-assistenter i webbläsare med WebMCP samma verktyg direkt på sidan.</li>
              <li><b>Utan konto:</b> en AI kan visa ett event och anmäla dig, via <code>https://pullup.se/api/mcp/public</code>.</li>
            </ol>
          </div>
        </section>

        <section className="pp-price" id="pris" aria-labelledby="pp-price-h">
          <h2 id="pp-price-h">Pris</h2>
          <div className="pp-plans">
            <article className="is-free">
              <h3>Gratis</h3>
              <p className="pp-amount">0 kr</p>
              <ul>
                <li>Obegränsat med event och gäster</li>
                <li>Anmälan, bekräftelsemejl och kalenderinbjudan</li>
                <li>Väntelista, gästlista och CRM</li>
                <li>Din AI som assistent</li>
              </ul>
              <Link to={SIGNUP} className="pp-btn is-dark">Skapa ditt event</Link>
            </article>
            <article>
              <h3>Mejl till många</h3>
              <p className="pp-sub">Inbjudningar och nyhetsbrev till dina gäster. Ett mejl per mottagare, krediterna går aldrig ut.</p>
              <table>
                <tbody>
                  {PACKS.map((p) => (
                    <tr key={p.mails}><td>{p.mails} mejl</td><td>{p.price}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="pp-sub">Priser exkl. moms. Bekräftelser till dina gäster är alltid gratis.</p>
            </article>
          </div>
        </section>

        <section className="pp-faq" aria-labelledby="pp-faq-h">
          <h2 id="pp-faq-h">Vanliga frågor</h2>
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>

        <section className="pp-en" lang="en" aria-labelledby="pp-en-h">
          <h2 id="pp-en-h">In English</h2>
          <p>
            PullUp is a free event platform from Stockholm: an event page with RSVP, a confirmation email with a calendar invite,
            a capacity limit with a waitlist, a guest list with check-in and export, and a CRM of everyone who signed up. It's free;
            the only thing you pay for is emailing many guests at once (5,000 emails for 99 SEK). Your AI assistant can run all of it
            for you over MCP at <code>https://mcp.pullup.se</code> (OAuth, approve once), or with WebMCP right in the browser.
          </p>
        </section>
      </main>

      <footer className="pp-foot">
        <span>PullUp · Stockholm</span>
        <Link to="/">Felix Civalero Stolpe</Link>
        <Link to="/privacy">Integritet</Link>
        <Link to="/terms">Villkor</Link>
        <a href="/llms.txt">llms.txt</a>
      </footer>
    </div>
  );
}

const PRODUCT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&display=swap');
  body { margin: 0; background: #fff; }
  .pp { color: #0a0a0a; font-family: "Inter Tight", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .pp * { box-sizing: border-box; }
  .pp-top { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 60px; padding: 0 clamp(16px, 4vw, 40px); background: rgba(255,255,255,0.92); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(0,0,0,0.06); }
  .pp-logo { font-weight: 800; font-size: 19px; letter-spacing: -0.03em; color: #0a0a0a; text-decoration: none; }
  .pp-top nav { display: flex; align-items: center; gap: clamp(10px, 3vw, 22px); font-size: 14px; font-weight: 600; }
  .pp-top nav a { color: #6e6e73; text-decoration: none; }
  .pp-top nav a:hover { color: #0a0a0a; }
  .pp-top .pp-login { color: #0a0a0a; }
  .pp main > section { padding: clamp(48px, 8vw, 96px) clamp(16px, 5vw, 48px); }
  .pp-kicker { margin: 0 0 14px; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #ec178f; }
  .pp h1 { margin: 0; max-width: 15ch; font-size: clamp(38px, 7vw, 76px); line-height: 1.02; font-weight: 800; letter-spacing: -0.045em; }
  .pp h2 { margin: 0 0 24px; font-size: clamp(28px, 4.5vw, 44px); line-height: 1.08; font-weight: 800; letter-spacing: -0.035em; max-width: 22ch; }
  .pp h3 { margin: 0 0 8px; font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
  .pp p { line-height: 1.6; }
  .pp-hero { max-width: 1120px; margin: 0 auto; }
  .pp-lead { max-width: 60ch; margin: 22px 0 0; font-size: clamp(17px, 2.1vw, 20px); color: #3a3a3e; }
  .pp-ctas { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 30px; }
  .pp-btn { display: inline-flex; align-items: center; justify-content: center; padding: 14px 22px; border-radius: 999px; font-size: 15px; font-weight: 700; text-decoration: none; color: #0a0a0a; border: 1px solid rgba(0,0,0,0.16); background: #fff; }
  .pp-btn:hover { border-color: rgba(0,0,0,0.4); }
  .pp-btn.is-dark { background: #0a0a0a; color: #fff; border-color: #0a0a0a; }
  .pp-note { margin: 12px 0 0; font-size: 13px; color: #8a8a8e; }
  .pp-features { max-width: 1120px; margin: 0 auto; border-top: 1px solid rgba(0,0,0,0.08); }
  .pp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
  .pp-grid article { padding: 20px; border: 1px solid rgba(0,0,0,0.08); border-radius: 18px; }
  .pp-grid p { margin: 0; font-size: 15px; color: #3a3a3e; }
  .pp main > section.pp-ai { padding-left: 0; padding-right: 0; background: #0a0a0a; color: #fff; }
  .pp-ai-in { max-width: 1120px; margin: 0 auto; padding: 0 clamp(16px, 5vw, 48px); }
  .pp-ai p { max-width: 62ch; color: rgba(255,255,255,0.78); font-size: 17px; }
  .pp-chat { max-width: 560px; margin: 28px 0; display: grid; gap: 10px; }
  .pp-chat p { margin: 0; padding: 13px 16px; border-radius: 18px; font-size: 15px; line-height: 1.5; }
  .pp-you { justify-self: end; max-width: 88%; background: #ec178f; color: #fff !important; border-bottom-right-radius: 6px; }
  .pp-bot { max-width: 88%; background: rgba(255,255,255,0.1); color: #fff !important; border-bottom-left-radius: 6px; }
  .pp-ai ol { margin: 0; padding-left: 20px; display: grid; gap: 10px; max-width: 70ch; color: rgba(255,255,255,0.85); line-height: 1.55; }
  .pp code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; padding: 2px 6px; border-radius: 6px; background: rgba(127,127,127,0.18); overflow-wrap: anywhere; }
  .pp-price, .pp-faq, .pp-en { max-width: 1120px; margin: 0 auto; }
  .pp-plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
  .pp-plans article { padding: 24px; border: 1px solid rgba(0,0,0,0.1); border-radius: 22px; display: grid; gap: 12px; align-content: start; }
  .pp-plans .is-free { border-color: #0a0a0a; }
  .pp-amount { margin: 0; font-size: 44px; font-weight: 800; letter-spacing: -0.04em; }
  .pp-plans ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; color: #3a3a3e; }
  .pp-plans .pp-btn { justify-self: start; margin-top: 6px; }
  .pp-sub { margin: 0; font-size: 14px; color: #6e6e73; }
  .pp-plans table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .pp-plans td { padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.08); font-size: 16px; }
  .pp-plans td:last-child { text-align: right; font-weight: 700; }
  .pp-faq details { border-bottom: 1px solid rgba(0,0,0,0.1); }
  .pp-faq summary { cursor: pointer; padding: 18px 0; font-size: 18px; font-weight: 700; list-style: none; }
  .pp-faq summary::-webkit-details-marker { display: none; }
  .pp-faq summary::after { content: "+"; float: right; font-weight: 500; color: #8a8a8e; }
  .pp-faq details[open] summary::after { content: "–"; }
  .pp-faq details p { margin: 0 0 20px; max-width: 70ch; color: #3a3a3e; }
  .pp-en { border-top: 1px solid rgba(0,0,0,0.08); }
  .pp-en p { max-width: 70ch; color: #3a3a3e; }
  .pp-foot { display: flex; flex-wrap: wrap; gap: 8px 20px; padding: 28px clamp(16px, 5vw, 48px) 40px; border-top: 1px solid rgba(0,0,0,0.08); font-size: 13px; color: #8a8a8e; }
  .pp-foot a { color: #6e6e73; text-decoration: none; }
  .pp-foot a:hover { color: #0a0a0a; }
`;
