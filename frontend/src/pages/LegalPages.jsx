import { useEffect, useState } from "react";
import { getConsent, onConsentChange, setConsent } from "../lib/consent.js";
import { Link } from "react-router-dom";
import { useLang } from "../components/agency/i18n.js";
import { LangSwitch } from "../components/agency/LangSwitch.jsx";
import { MailLink } from "../components/agency/MailLink.jsx";

/* /privacy, /terms, /cookies — what this site actually does with data, in
   Swedish and English (Swahili reads the English). Keep these in step with
   the code: forms → backend/src/routes/{agencyRequests,deckDownloads}.js,
   statistics → lib/track.js + lib/consent.js (the one opt-in counter),
   browser storage → i18n.js (language),
   lib/lazyPage.js (chunk reload) and the Supabase login. */

const UPDATED = { sv: "Senast uppdaterad 26 oktober 2026", en: "Last updated 26 October 2026" };
const Mail = () => <MailLink />;

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
              <li><strong>Besöksstatistik:</strong> vilka sidor du ser, hur långt ner du läser och hur länge du läser varje del, vad du klickar på, att du kopierar text (inte vad), vilka fält i formuläret du fyller i (inte vad du skriver), referrer, UTM och mobil eller dator, under ett slumpat id som bara finns medan sidan är öppen. Statistiken innehåller inte namn, e-post eller IP-adress.</li>
              <li><strong>Unika besökare – bara om du säger ja:</strong> slår du på statistik-kakan sparas ett slumpat id i din webbläsare, så att jag kan räkna hur många olika personer som besöker sajten över tid. Säger du nej, eller inte svarar, sparas ingenting och du känns inte igen nästa gång. Jag använder inte Google Analytics, Meta-pixel eller några annonsspårare.</li>
              <li><strong>Tekniska loggar:</strong> servern loggar IP-adress och webbläsare för drift och säkerhet.</li>
              <li><strong>Felrapporter:</strong> om sidan kraschar skickas en rapport om felet, webbläsaren och sidan.</li>
            </ul>

            <h2>PullUp – eventsidor och konton</h2>
            <ul>
              <li><strong>Ditt konto:</strong> din e-post. Varje gång du ber om en inloggningskod sparas också webbläsare och system (till exempel ”Chrome på macOS”), land, IP-adress och tid – för att skydda kontot, begränsa missbruk och visa i mejlet var inloggningen begärdes. Det sparas i 30 dagar.</li>
              <li><strong>Dina event och gäster:</strong> det du lägger upp, och de som anmäler sig till dina event. För dina gästers uppgifter är du som arrangör ansvarig; PullUp lagrar dem och skickar mejl för din räkning.</li>
              <li><strong>När du anmäler dig till ett event:</strong> namn, e-post, om du vill höra om fler event och om du kom. Arrangören ser dem. Du får ett bekräftelsemejl, och mejl till en lista innehåller alltid en avregistreringslänk.</li>
              <li><strong>AI-assistenter:</strong> kopplar du en assistent sparas vilken det är och vad den gjort (vilken åtgärd, när och om det gick), i 180 dagar, så att du kan se det under Agenter. Du kan koppla från den när du vill.</li>
              <li><strong>Köp av mejlkrediter</strong> sker hos Stripe. Jag får aldrig dina kortuppgifter.</li>
            </ul>

            <h2>Varför</h2>
            <ul>
              <li>För att svara på det du bett om – din förfrågan eller bookleten. Det är steg inför ett eventuellt samarbete, eller mitt berättigade intresse av att svara dig.</li>
              <li>Statistik, loggar och felrapporter: mitt berättigade intresse av att förstå hur sajten används, göra den bättre och hålla den igång.</li>
              <li>Räkningen av unika besökare: ditt samtycke. Du kan ändra dig när du vill på <Link to="/cookies">cookiesidan</Link>.</li>
              <li>Skickar du en förfrågan kopplas den till besöket den kom från, så att jag ser vad du läste innan du hörde av dig. Det är mitt berättigade intresse av att förstå vad som får folk att höra av sig.</li>
              <li>Konto, event, anmälningar och mejl: för att tjänsten du använder ska fungera (avtal). Inloggningsuppgifter och assistenternas logg: mitt berättigade intresse av att hålla konton säkra.</li>
            </ul>
            <p>Jag säljer aldrig dina uppgifter, lämnar inte ut dem för någon annans marknadsföring och lägger inte till dig i något nyhetsbrev.</p>

            <h2>Vilka som hjälper mig</h2>
            <ul>
              <li><strong>Supabase</strong> – databasen. Lagras i EU (Paris).</li>
              <li><strong>Amazon Web Services</strong> – servern. EU (Stockholm).</li>
              <li><strong>Cloudflare</strong> – nätverket framför sajten.</li>
              <li><strong>Resend</strong> – skickar mejlen.</li>
              <li><strong>Stripe</strong> – tar betalt för mejlkrediter.</li>
              <li><strong>Sentry</strong> – tar emot felrapporter.</li>
              <li><strong>Google Fonts</strong> – typsnittet laddas från Google, så din IP-adress når Google när sidan öppnas.</li>
            </ul>
            <p>Några av dem kan behandla uppgifter utanför EU, främst i USA. Det sker med EU:s standardavtalsklausuler eller motsvarande skydd.</p>

            <h2>Hur länge</h2>
            <p>Förfrågningar och booklet-uppgifter sparar jag så länge de behövs för vår kontakt. Ber du mig radera dem gör jag det. Statistiken går inte att koppla till dig som person. Id:t för unika besökare finns kvar i din webbläsare tills du stänger av statistik-kakan eller rensar webbläsaren.</p>

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
              <li><strong>Visit statistics:</strong> which pages you view, how far down and for how long you read each part, what you click, that you copied text (not what), which form fields you fill in (not what you type), referrer, UTM and phone or computer, under a random ID that only exists while the page is open. The statistics hold no names, emails or IP addresses.</li>
              <li><strong>Unique visitors – only if you say yes:</strong> if you switch on the stats cookie, a random ID is stored in your browser so I can count how many different people visit the site over time. If you say no, or don't answer, nothing is stored and you're not recognised next time. I don't use Google Analytics, a Meta pixel or any ad trackers.</li>
              <li><strong>Technical logs:</strong> the server logs IP address and browser for operations and security.</li>
              <li><strong>Error reports:</strong> if the page crashes, a report about the error, the browser and the page is sent.</li>
            </ul>

            <h2>PullUp – event pages and accounts</h2>
            <ul>
              <li><strong>Your account:</strong> your email. Each time you ask for a sign-in code, the browser and system (for example “Chrome on macOS”), country, IP address and time are stored too – to protect the account, limit abuse and show in the email where the sign-in was requested. Kept for 30 days.</li>
              <li><strong>Your events and guests:</strong> what you publish, and the people who sign up to your events. As the organiser you are responsible for your guests' data; PullUp stores it and sends email on your behalf.</li>
              <li><strong>When you sign up to an event:</strong> your name, email, whether you want to hear about more events and whether you came. The organiser sees them. You get a confirmation email, and email to a list always carries an unsubscribe link.</li>
              <li><strong>AI assistants:</strong> if you connect an assistant, which one it is and what it did (which action, when and whether it worked) is kept for 180 days, so you can see it under Agents. You can disconnect it whenever you like.</li>
              <li><strong>Buying mail credits</strong> happens at Stripe. I never get your card details.</li>
            </ul>

            <h2>Why</h2>
            <ul>
              <li>To answer what you asked for – your request or the booklet. That is a step before a possible engagement, or my legitimate interest in replying to you.</li>
              <li>Statistics, logs and error reports: my legitimate interest in understanding how the site is used, improving it and keeping it running.</li>
              <li>Counting unique visitors: your consent. You can change your mind any time on the <Link to="/cookies">cookies page</Link>.</li>
              <li>If you send a request, it is linked to the visit it came from, so I can see what you read before getting in touch. That is my legitimate interest in understanding what makes people reach out.</li>
              <li>Account, events, sign-ups and email: to make the service you use work (contract). Sign-in details and the assistants' log: my legitimate interest in keeping accounts secure.</li>
            </ul>
            <p>I never sell your data, never hand it to anyone else for their marketing and never add you to a newsletter.</p>

            <h2>Who helps me</h2>
            <ul>
              <li><strong>Supabase</strong> – the database. Stored in the EU (Paris).</li>
              <li><strong>Amazon Web Services</strong> – the server. EU (Stockholm).</li>
              <li><strong>Cloudflare</strong> – the network in front of the site.</li>
              <li><strong>Resend</strong> – sends the emails.</li>
              <li><strong>Stripe</strong> – takes payment for mail credits.</li>
              <li><strong>Sentry</strong> – receives error reports.</li>
              <li><strong>Google Fonts</strong> – the typeface loads from Google, so your IP address reaches Google when the page opens.</li>
            </ul>
            <p>Some of them may process data outside the EU, mainly in the US. That happens under the EU's standard contractual clauses or equivalent safeguards.</p>

            <h2>How long</h2>
            <p>I keep requests and booklet details for as long as our contact needs them. If you ask me to delete them, I will. The statistics can't be tied to you as a person. The unique-visitor ID stays in your browser until you switch the stats cookie off or clear your browser.</p>

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

            <h2>PullUp, eventplattformen</h2>
            <p>Du får använda PullUp gratis för dina event. Du ansvarar för det du lägger upp och för att du har rätt att mejla dem du mejlar – de som anmält sig till ditt event, eller som sagt ja till att höra mer. Mejl till många betalas med mejlkrediter i förväg; de går aldrig ut, och mejl som inte kan levereras får du tillbaka krediten för. Kopplar du en AI-assistent agerar den för dig, med dina rättigheter, och det den gör räknas som gjort av dig. Event eller konton som används för spam, bedrägeri eller olagligt innehåll kan tas bort.</p>

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

            <h2>PullUp, the event platform</h2>
            <p>You may use PullUp for free for your events. You are responsible for what you publish and for having the right to email the people you email – those who signed up to your event, or said yes to hearing more. Email to many people is paid for with mail credits in advance; they never expire, and you get the credit back for email that can't be delivered. If you connect an AI assistant, it acts for you, with your rights, and what it does counts as done by you. Events or accounts used for spam, fraud or illegal content may be removed.</p>

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
// The same Av / På as the banner, so the choice can be changed any time.
function StatsSwitch({ lang }) {
  const [choice, setChoice] = useState(getConsent);
  useEffect(() => onConsentChange(setChoice), []);
  const sv = lang === "sv";
  return (
    <div className="lp-switch">
      <span>{sv ? "Statistik-kakan" : "The stats cookie"}</span>
      <div className="lp-seg" role="group" aria-label={sv ? "Statistik-kakan" : "The stats cookie"}>
        <button type="button" aria-pressed={choice === "off"} onClick={() => setConsent(false)}>{sv ? "Av" : "Off"}</button>
        <button type="button" aria-pressed={choice === "on"} onClick={() => setConsent(true)}>{sv ? "På" : "On"}</button>
      </div>
    </div>
  );
}
export function CookiesPage() {
  return (
    <Legal title={{ sv: "Cookies och lagring", en: "Cookies and storage" }}>
      {{
        sv: (
          <>
            <p>Sajten har en enda kaka du väljer själv, och sparar annars bara det den behöver för att fungera.</p>
            <StatsSwitch lang="sv" />
            <ul>
              <li><strong>Statistik-kakan</strong> – bara om du slår på den: ett slumpat id som räknar hur många olika personer som besöker sajten. Inget annat kopplas till det, och det tas bort när du stänger av den (localStorage).</li>
              <li><strong>Ditt val</strong> – att du svarat av eller på, så att frågan inte kommer tillbaka (localStorage).</li>
              <li><strong>Språkval</strong> – bara om du byter språk, så att sajten minns det (localStorage).</li>
              <li><strong>Omladdning efter uppdatering</strong> – en teknisk markering under besöket om sidan behövt laddas om efter att jag publicerat en ny version (sessionStorage).</li>
              <li><strong>Inloggning</strong> – när du loggar in sparas inloggningen (localStorage). Medan du väntar på koden sparas också en slumpad hemlighet som gör att koden och länken i mejlet bara fungerar i just den här webbläsaren; den tas bort när du loggat in.</li>
            </ul>
            <p>Du kan rensa allt detta när du vill i webbläsarens inställningar. Sajten fungerar som vanligt ändå. Mer om hur uppgifterna används finns i <Link to="/privacy">integritetspolicyn</Link>.</p>
          </>
        ),
        en: (
          <>
            <p>The site has one cookie you choose yourself, and otherwise stores only what it needs to work.</p>
            <StatsSwitch lang="en" />
            <ul>
              <li><strong>The stats cookie</strong> – only if you switch it on: a random ID that counts how many different people visit the site. Nothing else is linked to it, and it is removed when you switch it off (localStorage).</li>
              <li><strong>Your choice</strong> – that you answered off or on, so the question doesn't come back (localStorage).</li>
              <li><strong>Language</strong> – only if you switch language, so the site remembers it (localStorage).</li>
              <li><strong>Reload after an update</strong> – a technical marker during your visit if the page had to reload after I published a new version (sessionStorage).</li>
              <li><strong>Sign-in</strong> – when you sign in, the session is stored (localStorage). While you wait for the code, a random secret is stored too, so the code and the link in the email only work in this browser; it is removed once you're signed in.</li>
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
  @media (pointer: coarse) {
    .lp-home { display: inline-flex; align-items: center; min-height: 44px; }
    .lp-foot { row-gap: 0; }
    .lp-foot a { display: inline-flex; align-items: center; min-height: 44px; }
  }
  .lp-switch { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0 0 20px; padding: 14px 16px; border: 1px solid rgba(0,0,0,0.1); border-radius: 16px; font-size: 15px; font-weight: 600; }
  .lp-seg { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; padding: 3px; border-radius: 12px; background: #efeff0; min-width: 140px; }
  .lp-seg button { font: inherit; font-size: 14px; font-weight: 600; padding: 7px 14px; border: 0; border-radius: 9px; background: transparent; color: #6e6e73; cursor: pointer; }
  .lp-seg button[aria-pressed="true"] { background: #fff; color: #0a0a0a; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
  /* the language pill from the site nav */
  .pc-lang { position: relative; display: inline-flex; align-items: center; gap: 5px; min-height: 32px; padding: 0 10px; border-radius: 999px;
    border: 1px solid rgba(0,0,0,0.18); font-size: 12px; font-weight: 600; letter-spacing: 0.06em; cursor: pointer; }
  .pc-lang:focus-within { outline: 2px solid #D9480F; outline-offset: 2px; }
  .pc-lang select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 16px; border: 0; appearance: none; -webkit-appearance: none; }
`;
