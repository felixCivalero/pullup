import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../components/agency/i18n.js";
import { LangSwitch } from "../components/agency/LangSwitch.jsx";
import { CONTACT } from "../components/agency/agencyData.js";

/* /privacy, /terms, /cookies — what this site actually does with data, in
   Swedish and English (Swahili reads the English). Keep these in step with
   the code: forms → backend/src/routes/{agencyRequests,deckDownloads}.js,
   statistics → lib/track.js, storage keys → i18n.js, request.js, track.js. */

const UPDATED = { sv: "Senast uppdaterad 19 oktober 2026", en: "Last updated 19 October 2026" };
const Mail = () => <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;

function Legal({ title, children }) {
  const lang = useLang() === "sv" ? "sv" : "en";
  const t = title[lang];
  useEffect(() => {
    const prev = document.title;
    document.title = `${t} — Felix Civalero Stolpe`;
    return () => { document.title = prev; };
  }, [t]);
  return (
    <div className="lp">
      <style>{LEGAL_CSS}</style>
      <header className="lp-top">
        <Link to="/" className="lp-home">&larr; Felix Civalero Stolpe</Link>
        <LangSwitch />
      </header>
      <main className="lp-body">
        <h1>{t}</h1>
        <p className="lp-updated">{UPDATED[lang]}</p>
        {children[lang]}
      </main>
      <footer className="lp-foot">
        <Link to="/privacy">{lang === "sv" ? "Integritet" : "Privacy"}</Link>
        <Link to="/terms">{lang === "sv" ? "Villkor" : "Terms"}</Link>
        <Link to="/cookies">Cookies</Link>
        <Mail />
      </footer>
    </div>
  );
}

/* ─── Privacy ─── */
export function PrivacyPage() {
  return (
    <Legal title={{ sv: "Integritetspolicy", en: "Privacy policy" }}>
      {{
        sv: (
          <>
            <p>Den här sajten drivs av mig, Felix Civalero Stolpe, i Stockholm. Jag är personuppgiftsansvarig för uppgifterna som beskrivs här. Frågor går till <Mail />.</p>

            <h2>Vad jag samlar in</h2>
            <ul>
              <li><strong>När du hör av dig</strong> via ”Jobba med mig”: namn, e-post och det du skriver i formuläret. Med följer var du kom ifrån – sidan du skickade från, länken som tog dig hit (referrer), eventuella kampanjparametrar (UTM), språk, skärmstorlek, mobil eller dator och när besöket började.</li>
              <li><strong>När du ber om bookleten:</strong> e-post, och namn och företag om du fyller i dem.</li>
              <li><strong>Besöksstatistik:</strong> ett slumpat besöks-id och sessions-id, vilka sidor du ser och vad du klickar på, referrer, UTM och mobil eller dator. Statistiken innehåller inte namn, e-post eller IP-adress. Jag använder inte Google Analytics, Meta-pixel eller några annonsspårare.</li>
              <li><strong>Tekniska loggar:</strong> servern loggar IP-adress och webbläsare för drift och säkerhet.</li>
              <li><strong>Felrapporter:</strong> om sidan kraschar skickas en rapport om felet, webbläsaren och sidan.</li>
            </ul>

            <h2>Varför</h2>
            <ul>
              <li>För att svara på det du bett om – din förfrågan eller bookleten. Det är steg inför ett eventuellt samarbete, eller mitt berättigade intresse av att svara dig.</li>
              <li>Statistik, loggar och felrapporter: mitt berättigade intresse av att förstå hur sajten används och hålla den igång.</li>
            </ul>
            <p>Jag säljer aldrig dina uppgifter, lämnar inte ut dem för någon annans marknadsföring och lägger inte till dig i något nyhetsbrev.</p>

            <h2>Vilka som hjälper mig</h2>
            <ul>
              <li><strong>Supabase</strong> – databasen. Lagras i EU (Paris).</li>
              <li><strong>Amazon Web Services</strong> – servern. EU (Stockholm).</li>
              <li><strong>Cloudflare</strong> – nätverket framför sajten.</li>
              <li><strong>Resend</strong> – skickar mejlen.</li>
              <li><strong>Sentry</strong> – tar emot felrapporter.</li>
              <li><strong>Google Fonts</strong> – typsnittet laddas från Google, så din IP-adress når Google när sidan öppnas.</li>
            </ul>
            <p>Några av dem kan behandla uppgifter utanför EU, främst i USA. Det sker med EU:s standardavtalsklausuler eller motsvarande skydd.</p>

            <h2>Hur länge</h2>
            <p>Förfrågningar och booklet-uppgifter sparar jag så länge de behövs för vår kontakt. Ber du mig radera dem gör jag det. Statistiken går inte att koppla till dig som person.</p>

            <h2>Dina rättigheter</h2>
            <p>Du kan be om att få se, rätta eller radera dina uppgifter, invända mot hur de används, begränsa behandlingen eller få ut dem i ett format du kan ta med dig. Mejla <Mail /> så svarar jag inom en månad. Är du inte nöjd kan du vända dig till Integritetsskyddsmyndigheten (IMY).</p>

            <h2>Ändringar</h2>
            <p>Ändras något viktigt uppdaterar jag den här sidan och datumet högst upp.</p>
          </>
        ),
        en: (
          <>
            <p>This site is run by me, Felix Civalero Stolpe, in Stockholm, Sweden. I am the controller of the personal data described here. Questions go to <Mail />.</p>

            <h2>What I collect</h2>
            <ul>
              <li><strong>When you get in touch</strong> through “Work with me”: your name, email and what you write in the form. It comes with where you came from – the page you sent it from, the link that brought you here (referrer), any campaign parameters (UTM), language, screen size, phone or computer and when the visit started.</li>
              <li><strong>When you ask for the booklet:</strong> your email, plus your name and company if you fill them in.</li>
              <li><strong>Visit statistics:</strong> a random visitor ID and session ID, which pages you view and what you click, referrer, UTM and phone or computer. The statistics hold no names, emails or IP addresses. I don't use Google Analytics, a Meta pixel or any ad trackers.</li>
              <li><strong>Technical logs:</strong> the server logs IP address and browser for operations and security.</li>
              <li><strong>Error reports:</strong> if the page crashes, a report about the error, the browser and the page is sent.</li>
            </ul>

            <h2>Why</h2>
            <ul>
              <li>To answer what you asked for – your request or the booklet. That is a step before a possible engagement, or my legitimate interest in replying to you.</li>
              <li>Statistics, logs and error reports: my legitimate interest in understanding how the site is used and keeping it running.</li>
            </ul>
            <p>I never sell your data, never hand it to anyone else for their marketing and never add you to a newsletter.</p>

            <h2>Who helps me</h2>
            <ul>
              <li><strong>Supabase</strong> – the database. Stored in the EU (Paris).</li>
              <li><strong>Amazon Web Services</strong> – the server. EU (Stockholm).</li>
              <li><strong>Cloudflare</strong> – the network in front of the site.</li>
              <li><strong>Resend</strong> – sends the emails.</li>
              <li><strong>Sentry</strong> – receives error reports.</li>
              <li><strong>Google Fonts</strong> – the typeface loads from Google, so your IP address reaches Google when the page opens.</li>
            </ul>
            <p>Some of them may process data outside the EU, mainly in the US. That happens under the EU's standard contractual clauses or equivalent safeguards.</p>

            <h2>How long</h2>
            <p>I keep requests and booklet details for as long as our contact needs them. If you ask me to delete them, I will. The statistics can't be tied to you as a person.</p>

            <h2>Your rights</h2>
            <p>You can ask to see, correct or delete your data, object to how it's used, restrict the processing or get it in a format you can take with you. Email <Mail /> and I'll answer within a month. If you're not satisfied, you can turn to the Swedish Authority for Privacy Protection (IMY).</p>

            <h2>Changes</h2>
            <p>If anything important changes, I update this page and the date at the top.</p>
          </>
        ),
      }}
    </Legal>
  );
}

/* ─── Terms ─── */
export function TermsPage() {
  return (
    <Legal title={{ sv: "Villkor", en: "Terms" }}>
      {{
        sv: (
          <>
            <p>Det här gäller när du använder pullup.se, som drivs av mig, Felix Civalero Stolpe, i Stockholm.</p>

            <h2>Sajten</h2>
            <p>Sajten visar vem jag är, vad jag gör och vad jag har gjort. Texter, bilder och design på sajten är mina, om inget annat anges. Kundernas namn och logotyper tillhör kunderna, och bilder från andra är krediterade där de visas. Du får gärna länka och dela, men inte kopiera innehållet och ge ut det som ditt.</p>

            <h2>Case och resultat</h2>
            <p>Siffrorna i mina case är verkliga resultat från de samarbetena. De visar vad som har hänt, inte en garanti för vad som händer i nästa.</p>

            <h2>Erbjudandet</h2>
            <p>Priset och upplägget på sajten beskriver hur jag jobbar. Ett samarbete börjar först när vi har kommit överens skriftligt, och då är det vårt avtal som gäller – även för pengarna-tillbaka-garantin.</p>

            <h2>Ansvar</h2>
            <p>Jag gör mitt bästa för att allt på sajten ska stämma och fungera, men kan inte lova att den alltid gör det. Jag ansvarar inte för sajter jag länkar till.</p>

            <h2>Lag</h2>
            <p>Svensk lag gäller. Frågor går till <Mail />.</p>
          </>
        ),
        en: (
          <>
            <p>These terms apply when you use pullup.se, run by me, Felix Civalero Stolpe, in Stockholm, Sweden.</p>

            <h2>The site</h2>
            <p>The site shows who I am, what I do and what I've done. Texts, images and design on it are mine unless stated otherwise. Clients' names and logos belong to the clients, and images by others are credited where they appear. You're welcome to link and share, but not to copy the content and pass it off as your own.</p>

            <h2>Cases and results</h2>
            <p>The numbers in my cases are real results from those engagements. They show what happened, not a guarantee of what happens in the next one.</p>

            <h2>The offer</h2>
            <p>The price and setup on the site describe how I work. An engagement only starts once we've agreed in writing, and then our agreement is what applies – including the money-back guarantee.</p>

            <h2>Liability</h2>
            <p>I do my best to make everything on the site accurate and working, but can't promise it always is. I'm not responsible for sites I link to.</p>

            <h2>Law</h2>
            <p>Swedish law applies. Questions go to <Mail />.</p>
          </>
        ),
      }}
    </Legal>
  );
}

/* ─── Cookies ─── */
export function CookiesPage() {
  return (
    <Legal title={{ sv: "Cookies och lagring", en: "Cookies and storage" }}>
      {{
        sv: (
          <>
            <p>Sajten sätter inga cookies. Den sparar några små saker i din webbläsares lagring (localStorage och sessionStorage):</p>
            <ul>
              <li><strong>Språkval</strong> – om du byter språk, så att sajten minns det.</li>
              <li><strong>Besöks-id och sessions-id</strong> – slumpade id:n för besöksstatistiken, plus händelser som inte hann skickas.</li>
              <li><strong>Var du kom ifrån</strong> – sparas under besöket och följer med om du skickar en förfrågan.</li>
              <li><strong>Inloggning</strong> – bara för mig, när jag loggar in.</li>
            </ul>
            <p>Du kan rensa allt detta när du vill i webbläsarens inställningar. Sajten fungerar som vanligt ändå. Mer om hur uppgifterna används finns i <Link to="/privacy">integritetspolicyn</Link>.</p>
          </>
        ),
        en: (
          <>
            <p>The site sets no cookies. It keeps a few small things in your browser's storage (localStorage and sessionStorage):</p>
            <ul>
              <li><strong>Language</strong> – if you switch language, so the site remembers it.</li>
              <li><strong>Visitor ID and session ID</strong> – random IDs for the visit statistics, plus events that didn't get sent yet.</li>
              <li><strong>Where you came from</strong> – kept during the visit and included if you send a request.</li>
              <li><strong>Login</strong> – only for me, when I log in.</li>
            </ul>
            <p>You can clear all of it whenever you like in your browser settings. The site works just the same. More on how the data is used in the <Link to="/privacy">privacy policy</Link>.</p>
          </>
        ),
      }}
    </Legal>
  );
}

const LEGAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap');
  body { margin: 0; background: #fff; }
  .lp { min-height: 100dvh; display: flex; flex-direction: column; color: #0a0a0a;
    font-family: "Inter Tight", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; }
  .lp a { color: inherit; }
  .lp-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px clamp(16px, 5vw, 56px); }
  .lp-home { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; text-decoration: none; }
  .lp-body { flex: 1; width: 100%; max-width: 680px; margin: 0 auto; padding: clamp(24px, 6vw, 64px) 16px 64px; box-sizing: border-box; }
  .lp-body h1 { margin: 0 0 6px; font-size: clamp(32px, 6vw, 48px); line-height: 1.05; font-weight: 700; letter-spacing: -0.035em; }
  .lp-updated { margin: 0 0 36px; font-size: 13px; color: #6e6e73; }
  .lp-body h2 { margin: 36px 0 10px; font-size: 19px; font-weight: 700; letter-spacing: -0.02em; }
  .lp-body p, .lp-body li { font-size: 15.5px; line-height: 1.6; color: #2a2a2e; }
  .lp-body p { margin: 0 0 12px; }
  .lp-body ul { margin: 0 0 12px; padding-left: 20px; }
  .lp-body li { margin-bottom: 8px; }
  .lp-body li::marker { color: #D9480F; }
  .lp-body a { text-decoration-color: #D9480F; text-underline-offset: 3px; }
  .lp-foot { display: flex; flex-wrap: wrap; gap: 8px 20px; padding: 24px clamp(16px, 5vw, 56px); border-top: 1px solid rgba(0,0,0,0.08); font-size: 13px; }
  .lp-foot a { color: #6e6e73; text-decoration: none; }
  .lp-foot a:hover { color: #0a0a0a; }
  /* the language pill from the site nav */
  .pc-lang { position: relative; display: inline-flex; align-items: center; gap: 5px; min-height: 32px; padding: 0 10px; border-radius: 999px;
    border: 1px solid rgba(0,0,0,0.18); font-size: 12px; font-weight: 600; letter-spacing: 0.06em; cursor: pointer; }
  .pc-lang:focus-within { outline: 2px solid #D9480F; outline-offset: 2px; }
  .pc-lang select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 16px; border: 0; appearance: none; -webkit-appearance: none; }
`;
