// /pullup — the event platform's own page. Its title, description, FAQ and
// schema.org data live here so the page (ProductPage.jsx) and the build
// (vite.config.js: pre-rendered dist/pullup.html with these in <head>) say
// the same thing. Every claim must be true of what's built — check the code
// before adding one (backend actions/, repos/hostEvents.js, lib/emailCredits.js).

export const PRODUCT_URL = "https://pullup.se/pullup";
export const PRODUCT_TITLE = "PullUp – gratis eventsida med anmälan, kalenderinbjudan och gästlista";
export const PRODUCT_DESCRIPTION =
  "Skapa en eventsida på en minut, ta emot anmälningar med bekräftelsemejl och kalenderinbjudan, håll koll på gästlistan och mejla dina gäster. Gratis – du betalar bara för stora utskick. Din AI kan göra allt åt dig.";

export const PACKS = [
  { mails: "5 000", price: "99 kr" },
  { mails: "25 000", price: "449 kr" },
  { mails: "100 000", price: "1 490 kr" },
];

export const FAQ = [
  ["Vad kostar PullUp?", "Inget. Eventsidor, anmälan, bekräftelsemejl med kalenderinbjudan, gästlista och CRM är gratis. Det enda som kostar är när du mejlar många på en gång, som inbjudningar och nyhetsbrev: 5 000 mejl för 99 kr, 25 000 för 449 kr eller 100 000 för 1 490 kr (exkl. moms). Krediterna går aldrig ut."],
  ["Behöver mina gäster ett konto?", "Nej. De anmäler sig med namn och e-post och får ett bekräftelsemejl med eventet och en kalenderfil."],
  ["Kan min AI skapa eventet åt mig?", "Ja. Lägg till PullUp som connector i Claude, ChatGPT eller en annan AI-assistent (https://mcp.pullup.se), godkänn den en gång, och säg till exempel: ”Lägg upp min releasefest på PullUp den 7 november kl 19.” Den kan skapa och publicera event, se gästlistan och mejla gästerna – samma saker som du kan, inget mer. I webbläsare med WebMCP får AI:n samma verktyg direkt på sidan."],
  ["Vad händer när eventet blir fullt?", "Sätt ett max antal platser, så hamnar nästa anmälda på väntelistan automatiskt. Du kan flytta gäster mellan väntelista och anmäld."],
  ["Vem äger gästlistan?", "Du. Du ser alla som anmält dig, kan exportera listan och mejla dem som vill höra mer. PullUp säljer aldrig dina gästers uppgifter."],
  ["Kan jag ha flera varumärken på samma inloggning?", "Ja. Ett konto kan driva flera varumärken, till exempel en byrå med flera kunder eller ett företag med flera produkter. Du byter varumärke uppe i menyn. Varje varumärke har sina egna event, sitt eget CRM och sina egna utskick, och gästerna ser varumärket som arrangör och avsändare. Den som tackat ja till inbjudningar från ett varumärke får inga utskick från de andra. Mejlkrediterna delas av hela kontot."],
  ["Hur loggar jag in?", "Med en kod som mejlas till dig. Koden och länken i mejlet fungerar bara i webbläsaren där du bad om dem, så ett vidarebefordrat mejl kan inte användas av någon annan. Första inloggningen skapar kontot."],
  ["Kan jag ta betalt för biljetter?", "Inte i dag. PullUp är byggt för event med gratis anmälan."],
];

export function productJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "PullUp",
      url: PRODUCT_URL,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Event management",
      operatingSystem: "Web",
      inLanguage: "sv",
      description: PRODUCT_DESCRIPTION,
      featureList: [
        "Event page with cover image and custom design",
        "RSVP with name and email",
        "Confirmation email with calendar invite (.ics and Google Calendar)",
        "Capacity limit with automatic waitlist",
        "Guest list with check-in and CSV export",
        "CRM of everyone who signed up across events",
        "Email to your guests with built-in unsubscribe",
        "AI assistant access over MCP (OAuth) and WebMCP",
      ],
      offers: [
        { "@type": "Offer", name: "PullUp", price: 0, priceCurrency: "SEK", description: "Event pages, RSVP, confirmations, guest list and CRM." },
        ...PACKS.map((p) => ({
          "@type": "Offer",
          name: `${p.mails} mail credits`,
          price: Number(p.price.replace(/\D/g, "")),
          priceCurrency: "SEK",
          description: "Email to many guests at once; one credit per recipient; never expires; excl. VAT.",
        })),
      ],
      publisher: { "@type": "Organization", name: "PullUp", url: "https://pullup.se/" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
}
