// The signed-in side (admin, the editor, the event page's sign-up) in
// Swedish or English. Swedish is written in the components; English is this
// dictionary, applied to what's on screen: text, placeholders, titles,
// labels, options, the tab title. A watcher keeps it applied as pages change,
// and switching back restores the Swedish. Strings with numbers match a
// "{#}" entry; sentences with a name in them match a pattern; dates are
// translated word by word. Anything not here stays as written — names,
// event titles, guests' answers.
//
// The language is the site's one setting (components/agency/i18n.js, saved
// as pullup.lang, switched with the same globe as the front page).

const EN = {
  // ─── the shell ───
  "Event": "Events", "CRM": "CRM", "Mejl": "Mail", "Statistik": "Statistics", "Team": "Team", "Agenter": "Agents",
  "Logga ut": "Log out", "Laddar…": "Loading…", "Hämtar…": "Loading…", "Eventstatistik": "Event statistics",
  "Event — Admin": "Events — Admin", "Mejl — Admin": "Mail — Admin", "Statistik — Admin": "Statistics — Admin",
  "Team — Admin": "Team — Admin", "Agenter — Admin": "Agents — Admin", "CRM — Admin": "CRM — Admin",
  "Nytt event — Admin": "New event — Admin", "Designa event — Admin": "Design event — Admin",
  // brand menu
  "Varumärke": "Brand", "Varumärken": "Brands", "Varumärkena": "The brands", "Nytt varumärke": "New brand", "Byt namn på": "Rename",
  "Spara": "Save", "Sparar…": "Saving…", "Avbryt": "Cancel", "Under": "Under", "Inget, ett eget huvudvarumärke": "None, a main brand of its own",
  "Medarrangör": "Co-host", "Det gick inte att spara.": "Couldn't save.", "Det gick inte att spara. Försök igen.": "Couldn't save. Try again.",
  "Huvudkonto": "Main account", "Huvudkonto · admin": "Main account · admin", "Huvudvarumärke": "Main brand",
  // ─── onboarding ───
  "Välkommen till PullUp": "Welcome to PullUp", "Vad heter er organisation?": "What's your organisation called?",
  "Företaget, föreningen, byrån eller du själv. Gästerna ser namnet som arrangör och avsändare.": "The company, the club, the agency or you. Guests see the name as the organiser and the sender.",
  "Nästa →": "Next →", "← Tillbaka": "← Back", "Klar": "Done", "Lägg till": "Add", "Ett till": "One more",
  "Varumärke under": "Brand under", "Du är inbjuden": "You're invited", "Eller starta en egen organisation:": "Or start an organisation of your own:",
  "Du kan alltid lägga till fler varumärken sen, från menyn uppe till höger.": "You can always add more brands later, from the menu at the top right.",
  "Event, anmälningar, CRM och agenter är gratis. Du betalar bara för utskick till många.": "Events, sign-ups, the CRM and agents are free. You only pay for sending to many.",
  // ─── events list ───
  "Mina": "Mine", "Kommande": "Upcoming", "Alla": "All", "Nytt event": "New event", "Inga event än": "No events yet",
  "Skapa ditt första event": "Create your first event", "Inga event här än.": "No events here yet.",
  "Skapa en eventsida, dela länken och se anmälningarna komma in här. Gästerna hamnar i CRM:et.": "Make an event page, share the link and watch the sign-ups come in here. Guests land in the CRM.",
  "Kunde inte hämta eventen.": "Couldn't load the events.", "Utkast": "Draft", "Publicerad": "Published", "Har varit": "Past", "Utan titel": "Untitled",
  "anmälda": "signed up", "anmälda ·": "signed up ·", "kom": "came", "i kö": "waitlisted", "event": "events", "event ·": "events ·",
  // ─── one event ───
  "Alla event": "All events", "Öppna sidan": "Open the page", "Kopiera länk": "Copy link", "Kopierad": "Copied", "Kopiera": "Copy",
  "Översikt": "Overview", "Gäster": "Guests", "Mejla": "Mail", "Medarrangörer": "Co-hosts",
  "godkänner mejlutskick": "accept mail", "Godkänner mejlutskick": "Accept mail", "Godkänner mejlutskick från": "Accept mail from",
  "Designa sidan": "Design the page", "Inget omslag än": "No cover yet",
  "Omslag, bild, karusell eller video, innehållet och anmälan designar du i editorn, med sidan live bredvid.": "The cover, image, carousel or video, the content and the sign-up are designed in the editor, with the page live beside it.",
  "Hör till": "Belongs to", "Flytta till…": "Move to…", "Flytta": "Move", "Flyttar…": "Moving…", "Flytta till varumärke": "Move to brand",
  "Senaste anmälda": "Latest sign-ups", "Alla gäster →": "All guests →", "Anmäld": "Signed up", "Väntelista": "Waitlist", "Väntelistan": "Waitlist",
  "Inga anmälda än. Dela länken så dyker de upp här.": "No sign-ups yet. Share the link and they show up here.",
  "Exportera CSV": "Export CSV", "Anmälda": "Signed up", "Kom": "Came", "Avbokade": "Cancelled", "Avbokad": "Cancelled",
  "Namn": "Name", "E-post": "Email", "Telefon": "Phone", "Instagram": "Instagram", "Status": "Status", "Inga gäster här än.": "No guests here yet.",
  "Gäster de tar med": "Guests they bring", "Har kommit": "Came",
  // stats
  "Besök": "Visits", "besök": "visits", "besök ·": "visits ·", "besökare": "visitors", "besökare som anmälde sig": "of visitors signed up",
  "Konvertering": "Conversion", "Återkommande": "Returning", "Nya gäster": "New guests", "första gången hos er": "first time with you",
  "har varit på ert event förut": "have been to your events before", "Mobil": "Mobile", "av besöken": "of visits",
  "Dag för dag": "Day by day", "Anmälningar": "Sign-ups", "anmälningar": "sign-ups",
  "Var besöken kom ifrån": "Where the visits came from", "Var besöken kommer ifrån": "Where visits come from", "Var anmälningarna kom ifrån": "Where the sign-ups came from",
  "Inga besök räknade än.": "No visits counted yet.", "Inga besök räknade än. De räknas från och med nu.": "No visits counted yet. They're counted from now on.",
  "Besök räknas från och med nu. Dela länken så syns de här.": "Visits are counted from now on. Share the link and they show here.",
  "Inga anmälningar än.": "No sign-ups yet.", "Okänd": "Unknown", "Okänd = anmäld innan besök räknades, eller via en AI-assistent.": "Unknown = signed up before visits were counted, or through an AI assistant.",
  "Direkt / delad länk": "Direct / shared link", "AI-svar": "AI answers", "Dator": "Desktop", "Surfplatta": "Tablet",
  "Inga besök eller anmälningar än. Dela länken så syns de här, dag för dag.": "No visits or sign-ups yet. Share the link and they show here, day by day.",
  "Senaste 60 dagarna": "Last 60 days", "Bästa eventen": "Best events", "efter anmälda": "by sign-ups", "Klicka för att gå in i ett varumärke": "Click to go into a brand",
  "Konv.": "Conv.", "Inbjudningar": "Mail OK", "Kunde inte hämta statistiken.": "Couldn't load the statistics.", "Inget än.": "Nothing yet.",
  // mail on the event
  "Till": "To", "Ämne": "Subject", "Meddelande": "Message", "Alla anmälda": "Everyone signed up", "Anmälda + väntelista": "Signed up + waitlist",
  "Bara väntelistan": "Only the waitlist", "Bara de som kom": "Only those who came", "Alla i CRM:et som godkänt mejlutskick": "Everyone in the CRM who accepts mail",
  "Ett snabbt meddelande här, eller ett designat mejl med block i mejlmodulen. Båda får en avregistreringslänk, och den som avregistrerat sig får dem aldrig.": "A quick message here, or a designed mail with blocks in the mail module. Both carry an unsubscribe link, and anyone who unsubscribed never gets them.",
  "Designa mejl med mallar": "Design mail with templates", "Skicka test till mig": "Send a test to me", "Skicka till": "Send to",
  "Ses på lördag": "See you Saturday", "Hej!\n\nTomma rader blir nya stycken. Länkar blir klickbara.": "Hi!\n\nEmpty lines make new paragraphs. Links become clickable.",
  "för lite för det här utskicket": "too few for this send", "Köp utskick": "Buy sends", "mottagare": "recipients",
  "Utskick till gästerna görs av teamet för": "Mail to the guests is sent by the team of",
  // co-hosts
  "Bjud in medarrangör": "Invite co-host", "Bara teamet för varumärket jobbar med det här eventet.": "Only the brand's team works on this event.",
  "En medarrangör redigerar det här eventet och sköter gästlistan, men ser inget annat": "A co-host edits this event and runs its guest list, but sees nothing else",
  "Teamet har redan tillgång till alla event, det bjuder du in under": "The team already has every event; you invite it under",
  "Ta bort": "Remove", "Lämna": "Leave", "Ta tillbaka": "Withdraw",
  // ─── CRM ───
  "Sök namn, e-post eller Instagram": "Search name, email or Instagram", "Alla varumärken": "All brands",
  "Återkommande (2+)": "Returning (2+)", "Senaste event": "Latest event", "Exportera": "Export",
  "personer": "people", "person": "person", "har anmält sig till event ·": "have signed up to events ·", "har kommit ·": "came ·", "återkommande ·": "returning ·",
  "samtycken": "consents", "Svar": "Answers", "Kunde inte hämta CRM:et.": "Couldn't load the CRM.",
  "Varje varumärke mejlar bara dem som sagt ja till just det varumärket.": "Each brand mails only those who said yes to that brand.",
  "inbjudningar": "invitations", "Ja": "Yes", "Nej": "No",
  // ─── mail module ───
  "Utskick görs från varumärkena": "Mail is sent from the brands", "Mejla som": "Mail as",
  "Mottagare": "Recipients", "Design": "Design", "Inbjudan till event": "Event invitation", "Uppföljning efter event": "Event follow-up",
  "Välj en mall ovan för att börja.": "Pick a template above to start.", "Välj en mall under Design för att börja.": "Pick a template under Design to start.",
  "— välj mall —": "— pick a template —", "— välj event —": "— pick an event —", "Alla i CRM:et – eller välj event": "Everyone in the CRM – or pick events",
  "Bara de som godkänt mejlutskick": "Only those who accept mail", "Inget event valt: alla i CRM:et som godkänt mejlutskick.": "No event picked: everyone in the CRM who accepts mail.",
  "Alltid på utan event: för att mejla CRM:et krävs att de tackat ja.": "Always on without an event: mailing the CRM needs their yes.",
  "Alla som anmält sig till något av dessa.": "Everyone signed up to any of these.", "Sök namn eller e-post": "Search name or email", "Ingen matchar.": "No one matches.",
  "mottagare · den som avregistrerat sig får aldrig mejl": "recipients · anyone who unsubscribed never gets mail", "Hämtar CRM:et…": "Loading the CRM…",
  "Vilket event bjuder du in till?": "Which event are you inviting to?", "Vilket event följer du upp?": "Which event are you following up?",
  "Avsändarnamn (syns i inkorgen)": "Sender name (shows in the inbox)", "Ditt varumärke": "Your brand", "Inställningar": "Settings",
  "Förhandstext (syns efter ämnet i inkorgen)": "Preview text (shows after the subject in the inbox)", "Kort text som syns i inkorgen…": "Short text shown in the inbox…",
  "Ämnesrad…": "Subject line…", "Redo att skicka?": "Ready to send?", "Stäng": "Close", "Från": "From", "Förhandstext": "Preview text", "Innehåll": "Content",
  "Lägg till block": "Add block", "Ta bort block": "Remove block", "Till eventet": "To the event", "Mörkt": "Dark", "Ljust": "Light", "(inget ämne)": "(no subject)",
  "Lägg till länk": "Add link", "Lägg till länk eller e-post": "Add link or email", "Välj från dina event": "Pick from your events",
  "Öppnar betalning…": "Opening payment…", "Priser exkl. moms. Utskicken går aldrig ut. Betalning via Stripe.": "Prices excl. VAT. Sends never expire. Payment by Stripe.",
  "Kunde inte öppna betalningen. Försök igen.": "Couldn't open the payment. Try again.", "Köp utskick för att skicka": "Buy sends to send",
  // ─── team ───
  "Bjud in": "Invite", "Ansvarig": "Owner", "du": "you", "Till eventen": "To the events",
  "Behöver någon bara hjälpa till med ett event? Bjud in en medarrangör från eventets sida.": "Does someone only help with one event? Invite a co-host from the event's page.",
  "Bjud in de som jobbar med": "Invite the people who work with",
  ". De loggar in med sin egen mejladress och jobbar i varumärket precis som du: event, gäster, CRM och utskick. Utskicken dras från ditt saldo. Du är ansvarig och den enda som bjuder in eller tar bort.": ". They log in with their own email and work in the brand just like you: events, guests, the CRM and mail. Sends come off your balance. You're the owner and the only one who invites or removes.",
  // ─── agents ───
  "Koppla din AI": "Connect your AI", "I webbläsaren": "In the browser", "Kopplade": "Connected", "Senaste": "Latest",
  "Din egen AI kan göra allt du kan göra här": "Your own AI can do everything you can do here", ": skapa och publicera event, se gäster, skicka mejl. Inget mer än du.": ": create and publish events, see guests, send mail. Nothing more than you.",
  "Lägg till PullUp som connector i Claude, ChatGPT eller någon annan assistent som talar MCP. Du loggar in och godkänner en gång.": "Add PullUp as a connector in Claude, ChatGPT or any assistant that speaks MCP. You log in and approve once.",
  "Inställningar → Connectors → Lägg till anpassad connector → klistra in adressen.": "Settings → Connectors → Add custom connector → paste the address.",
  "ChatGPT och andra:": "ChatGPT and others:", "lägg till en MCP-connector med samma adress.": "add an MCP connector with the same address.",
  "Säg sedan till exempel:": "Then say, for example:", "”Lägg upp min releasefest på PullUp den 7 november kl 19.”": "“Put my release party on PullUp on 7 November at 7 pm.”",
  "Webbläsare med WebMCP ger AI-assistenten i webbläsaren samma verktyg direkt på pullup.se, som du, inloggad här.": "Browsers with WebMCP give the AI assistant in the browser the same tools right on pullup.se, as you, logged in here.",
  "Den här webbläsaren har inte WebMCP än (Chrome: chrome://flags → WebMCP).": "This browser doesn't have WebMCP yet (Chrome: chrome://flags → WebMCP).",
  "Den här webbläsaren har WebMCP: verktygen är på.": "This browser has WebMCP: the tools are on.",
  "Inga assistenter kopplade än.": "No assistants connected yet.", "Inget gjort av en assistent än.": "Nothing done by an assistant yet.",
  "Koppla från": "Disconnect", "Kopplar från…": "Disconnecting…", "Kunde inte hämta agenterna.": "Couldn't load the agents.", "När": "When",
  // ─── making an event: the wizard ───
  "Vems event är det?": "Whose event is it?", "Grunderna": "The basics", "Vad heter eventet?": "What's the event called?", "När är det?": "When is it?",
  "Var är det?": "Where is it?", "Vem kommer, och vad vill ni veta?": "Who's coming, and what do you want to know?", "Anmälan": "Sign-up",
  "Startar": "Starts", "Slutar (valfritt)": "Ends (optional)", "Hoppa över": "Skip", "Nästa": "Next", "Tillbaka": "Back", "Vidare till design": "On to design",
  "Skapar…": "Creating…", "Release party, middag, listening session…": "Release party, dinner, listening session…",
  "Sök adress eller ställe. Kan avslöjas senare.": "Search an address or venue. Can be revealed later.", "Kunde inte skapa eventet. Försök igen.": "Couldn't create the event. Try again.",
  // the sign-up builder
  "Platser": "Places", "Max antal": "Max number", "Tomt = obegränsat. Fullt → väntelista.": "Empty = no limit. Full → waitlist.", "Obegränsat": "Unlimited",
  "Får ta med sig": "May bring", "Räknas som platser.": "They count as places.", "Bara sig själv": "Just themselves", "Upp till": "Up to",
  "Gästen fyller i": "The guest fills in", "Av": "Off", "Valfritt": "Optional", "Krävs": "Required", "Frågas alltid": "Always asked",
  "Egen fråga": "Own question", "Skriv frågan, t.ex. Allergier?": "Type the question, e.g. Allergies?", "Ta bort frågan": "Remove the question",
  "Allergier eller specialkost?": "Allergies or special diet?", "Företag": "Company", "Hur hittade du hit?": "How did you find us?",
  // the place
  "Adress eller ställe": "Address or venue", "Sök adress eller ställe": "Search an address or venue", "Förslag från Google": "Suggestions from Google",
  "Hämtar platsen…": "Getting the place…", "Plats vald": "Place picked", "Öppna i Maps ↗": "Open in Maps ↗",
  "Välj ett förslag så får sidan en karta och gästerna en vägbeskrivning.": "Pick a suggestion and the page gets a map and the guests directions.",
  "Var är eventet? Sök adress eller ställe": "Where is the event? Search an address or venue",
  // ─── the editor ───
  "Praktiskt": "Practical", "Eventet": "The event", "Förhandsvisa": "Preview", "Publicera": "Publish", "Avpublicera": "Unpublish",
  "Sparat": "Saved", "Ändrat…": "Changed…", "Kunde inte spara": "Couldn't save", "Allt sparas medan du jobbar.": "Everything saves as you work.",
  "Nästa:": "Next:", "Nästa: Innehåll →": "Next: Content →", "Klar, publicera →": "Done, publish →", "Klar, till eventet →": "Done, to the event →",
  "Desktop": "Desktop", "Stor skärm": "Large screen", "Laptop": "Laptop",
  "Plats": "Place",
  "Justera media": "Adjust media", "Format och fokus": "Format and focus", "Format": "Format", "Fokus": "Focus", "Original": "Original", "Omslag": "Cover",
  "Karusell": "Carousel", "Video": "Video", "Bläddra automatiskt": "Scroll automatically", "Börja om efter sista bilden": "Start over after the last image",
  "Övergångar": "Transitions", "Glid": "Slide", "Tona": "Fade", "Spela automatiskt": "Play automatically", "Loopa": "Loop", "Ljud på": "Sound on",
  "De flesta webbläsare startar bara video automatiskt utan ljud.": "Most browsers only autoplay video without sound.",
  "Ingen bild än": "No image yet", "Välj filer": "Choose files", "Klicka eller dra en bild, karusell eller video till omslaget i förhandsvisningen.": "Click or drag an image, carousel or video onto the cover in the preview.",
  "Lägg till bild, gif eller video": "Add an image, gif or video", "Lägg till fler": "Add more",
  "Original visar hela bilden i sitt eget format på mobil.": "Original shows the whole image in its own format on mobile.",
  "Original visar hela bilden i sitt eget format på desktop.": "Original shows the whole image in its own format on desktop.",
  "Vilken del av bilden som syns på mobil när formatet beskär.": "Which part of the image shows on mobile when the format crops.",
  "Vilken del av bilden som syns på desktop när formatet beskär.": "Which part of the image shows on desktop when the format crops.",
  "En video åt gången. Ta bort det som finns först.": "One video at a time. Remove what's there first.",
  "Ta bort videon först för att lägga till bilder.": "Remove the video first to add images.", "Kunde inte ta bort filen.": "Couldn't remove the file.", "Kunde inte spara ordningen.": "Couldn't save the order.",
  // content blocks
  "Titel": "Title", "Datum & tid": "Date & time", "Text": "Text", "Sociala": "Socials", "Arrangör": "Organiser", "Lägg till sektion": "Add section",
  "Visa titeln på sidan": "Show the title on the page", "Avslöja platsen senare": "Reveal the place later", "Avslöja datumet senare": "Reveal the date later",
  "Rubrik (t.ex. Om, Line-up, Meny...)": "Heading (e.g. About, Line-up, Menu...)", "Skriv ditt innehåll...": "Write your content...",
  "Eventets namn": "The event's name", "Slut (valfritt)": "End (optional)", "Start": "Start",
  "Klistra in en Spotify-länk (låt, album, artist eller spellista)": "Paste a Spotify link (track, album, artist or playlist)",
  "Klistra in en Apple Music-länk": "Paste an Apple Music link", "Klistra in en SoundCloud-länk": "Paste a SoundCloud link", "Klistra in en YouTube-länk": "Paste a YouTube link",
  "Sociala länkar": "Social links", "Klicka för att lägga till en logga": "Click to add a logo", "Klicka för att byta logga": "Click to change the logo",
  "Arrangör eller byrå": "Organiser or agency", "Kontaktmejl": "Contact email", "Webbplats": "Website",
  "t.ex. Platsen släpps på fredag": "e.g. The place is out on Friday", "t.ex. Datum kommer snart": "e.g. Date coming soon",
  "Datumet ovan används bara för sortering och påminnelser. Sidan visar din ledtråd.": "The date above is only used for sorting and reminders. The page shows your hint.",
  // sign-up panel
  "Visa anmälan på sidan": "Show the sign-up on the page", "Rubrik i anmälan": "Heading in the sign-up", "Knapptext": "Button text",
  "Tomt = Free entry.": "Empty = Free entry.", "Tomt = Register / Anmäl mig.": "Empty = Register.", "Ingen kan anmäla sig via sidan just nu.": "No one can sign up through the page right now.",
  "Gästerna fyller alltid i namn och e-post och kan säga ja till inbjudningar. Svaren syns i gästlistan, i exporten och i CRM:et. Gäster som tas med räknas som platser.": "Guests always give name and email and can say yes to invitations. The answers show in the guest list, the export and the CRM. Guests brought along count as places.",
  // ─── the guest's sign-up (event page) ───
  "Anmäl mig": "Sign me up", "Ställ mig i kö": "Put me on the waitlist", "Skickar…": "Sending…", "Anmälan är stängd.": "Sign-up is closed.",
  "Jag tar med mig": "I'm bringing", "Tar du med någon?": "Bringing anyone?", "Bara du": "Just you", "Färre": "Fewer", "Fler": "More", "Ingen": "No one", "Välj…": "Choose…", "gäst": "guest", "gäster": "guests",
  "Jag vill få inbjudningar till kommande event.": "I want invitations to future events.",
  "Vi använder din e-post för bekräftelsen och info om eventet.": "We use your email for the confirmation and info about the event.",
  "Integritetspolicy": "Privacy policy", "Telefon (valfritt)": "Phone (optional)", "Instagram (valfritt)": "Instagram (optional)",
  "Du är anmäld": "You're signed up", "Du är redan anmäld": "You're already signed up", "Du står på väntelistan": "You're on the waitlist",
  "Skriv ditt namn.": "Type your name.", "E-postadressen ser inte rätt ut.": "The email address doesn't look right.", "Skriv ditt telefonnummer.": "Type your phone number.",
  "Telefonnumret ser inte rätt ut.": "The phone number doesn't look right.", "Skriv ditt Instagram-namn.": "Type your Instagram name.", "Instagram-namnet ser inte rätt ut.": "The Instagram name doesn't look right.",
  "För många försök, vänta en stund.": "Too many tries, wait a moment.", "Något gick fel. Försök igen.": "Something went wrong. Try again.",
  "Kunde inte nå servern. Kolla uppkopplingen och försök igen.": "Couldn't reach the server. Check the connection and try again.",
  "Vi kunde inte bekräfta att du är en människa. Ladda om sidan och försök igen.": "We couldn't confirm you're human. Reload the page and try again.",
  "Google Kalender": "Google Calendar", "Gjord med PullUp · gör din egen eventsida gratis": "Made with PullUp · make your own event page for free",
  "Eventet finns inte": "The event doesn't exist", "Länken kan vara fel, eller så har eventet tagits bort.": "The link may be wrong, or the event has been removed.",
  // ─── import ───
  "Importera kontakter": "Import contacts", "Importera kontakter — Admin": "Import contacts — Admin",
  "Ta in era egna kontakter, till exempel en nyhetsbrevslista eller ett kundregister. Samtycket till mejl gäller varumärket de importeras till.": "Bring in your own contacts, for example a newsletter list or a customer register. Consent to mail applies to the brand they're imported into.",
  "Avtalet": "The agreement", "Listan": "The list", "Samtycke": "Consent", "Till varumärke": "Into brand",
  "Välj eller släpp en CSV-fil": "Choose or drop a CSV file", "Från Excel, Google Sheets, Mailchimp eller annat. En rad per person.": "From Excel, Google Sheets, Mailchimp or elsewhere. One row per person.",
  "Första raden är rubriker": "The first row is headings", "Efternamn": "Last name", "E-post *": "Email *",
  "Alla på listan har sagt ja till mejl från": "Everyone on the list said yes to mail from", "Det står i en kolumn vilka som sagt ja": "A column says who said yes",
  "Ingen har sagt ja än: bara till CRM:et, inga utskick": "No one has said yes yet: CRM only, no mail",
  "Varifrån kommer listan, och hur sa de ja? *": "Where does the list come from, and how did they say yes? *",
  "t.ex. Nyhetsbrevet i Mailchimp, anmälan via hemsidan 2021–2025": "e.g. The Mailchimp newsletter, sign-up on the website 2021–2025",
  "Sparas med varje kontakt. Den som avregistrerat sig får aldrig mejl, oavsett vad listan säger.": "Kept with every contact. Anyone who unsubscribed never gets mail, whatever the list says.",
  "Importerar…": "Importing…", "Tidigare importer": "Earlier imports", "Källa": "Source", "Nya": "New", "Godkänner mejl": "Accept mail", "Avtal": "Agreement",
  "Till CRM:et →": "To the CRM →", "Importen misslyckades.": "The import failed.", "Filen är tom.": "The file is empty.",
  "Spara listan som CSV först (i Excel: Arkiv → Spara som → CSV).": "Save the list as CSV first (in Excel: File → Save as → CSV).",
  // invites
  "Tacka ja": "Accept", "Tacka nej": "Decline",
  "Öppna": "Open", "En gäst har sagt ja till ett varumärke, inte till hela": "A guest said yes to one brand, not to all of",
  ". Därför mejlar varje varumärke sina egna. Som huvudkonto ser du hela CRM:et och vem som sagt ja till vad.": ". So each brand mails its own. As the main account you see the whole CRM and who said yes to what.",
};

// Numbers stand in as {#}: "3 personer" → "{#} personer".
const EN_NUM = {
  "{#} gäst": "{#} guest", "{#} gäster": "{#} guests", "{#} % av anmälda": "{#} % of sign-ups", "{#} varumärken under": "{#} brands under",
  "Upp till {#} gäst": "Up to {#} guest", "Upp till {#} gäster": "Up to {#} guests", "{#} mottagare": "{#} recipients",
  "{#} besök · {#} anmälningar": "{#} visits · {#} sign-ups", "{#} event · {#} anmälda · {#} kom": "{#} events · {#} signed up · {#} came",
  "{#} personer": "{#} people", "{#} person": "{#} person", "{#} event": "{#} events", "{#} besökare": "{#} visitors", "{#} i kö": "{#} waitlisted",
  "Skicka till {#}": "Send to {#}", "Exportera {#}": "Export {#}", "Saldo: {#} utskick": "Balance: {#} sends", "in {#} days": "in {#} days",
  "Visa fler ({#} kvar)": "Show more ({#} left)", "Du + {#} gäst": "You + {#} guest", "Du + {#} gäster": "You + {#} guests", "anmälda av {#}": "signed up of {#}", "{#} anmälningar": "{#} sign-ups",
};

// Sentences with a name or an answer in them.
const PATTERNS = [
  [/^Jag vill få inbjudningar till kommande event från (.+)\.$/, "I want invitations to future events from $1."],
  [/^Mejla som (.+)$/, "Mail as $1"],
  [/^Skickas som (.+)\.$/, "Sent as $1."],
  [/^Under (.+)$/, "Under $1"],
  [/^· (\d+) varumärken under (.+)$/, "· $1 brands under $2"],
  [/^Har (.+) varumärken under sig\?$/, "Does $1 have brands under it?"],
  [/^Bara (.+), klar$/, "Just $1, done"],
  [/^Byt namn på (.+)$/, "Rename $1"],
  [/^Det här eventet ligger på huvudkontot (.+)\.$/, "This event sits on the main account $1."],
  [/^Inga event för (.+) än$/, "No events for $1 yet"],
  [/^(.+) är admin för varumärkena under: här samlas allas event\. Ett event skapas alltid i ett av varumärkena\.$/, "$1 is the admin of the brands under it: everyone's events gather here. An event is always made in one of the brands."],
  [/^En bekräftelse är på väg till (.+)\.(.*)$/, "A confirmation is on its way to $1.$2"],
  [/^ Du är anmäld med (\d+) (gäst|gäster)\.$/, (m, n) => ` You're signed up with ${n} ${n === "1" ? "guest" : "guests"}.`],
  [/^Eventet är fullt just nu\. Vi mejlar (.+) om en plats blir ledig\.$/, "The event is full right now. We'll mail $1 if a place opens up."],
  [/^Svara på: (.+)$/, "Answer: $1"],
  [/^Välj ett alternativ: (.+)$/, "Pick an option: $1"],
  [/^(.+) \(valfritt\)$/, (m, q) => `${toEnglish(q)} (optional)`],
  [/^(\d+ [a-zåäö]+\.?): (\d+) besök, (\d+) anmälningar$/, (m, d, v, n) => `${toEnglish(d)}: ${v} visits, ${n} sign-ups`],
  [/^([^:]+): (\d+)$/, (m, l, n) => `${toEnglish(l)}: ${n}`],
  [/^Vi skickade en kod till (.+)\./, "We sent a code to $1."],
  [/^Inbjudan skickad till (.+)\.$/, "Invite sent to $1."],
  [/^Besök räknas sedan (.+)\.$/, "Visits counted since $1."],
  [/^I CRM:et sedan (.+)$/, "In the CRM since $1"],
  [/^Kliva av som medarrangör på (.+)\?$/, "Step down as co-host of $1?"],
  [/^Ta bort (.+) som medarrangör\?$/, "Remove $1 as co-host?"],
];

// Dates (sv-SE): weekday and month words.
const DATE_WORDS = {
  måndag: "Monday", tisdag: "Tuesday", onsdag: "Wednesday", torsdag: "Thursday", fredag: "Friday", lördag: "Saturday", söndag: "Sunday",
  Måndag: "Monday", Tisdag: "Tuesday", Onsdag: "Wednesday", Torsdag: "Thursday", Fredag: "Friday", Lördag: "Saturday", Söndag: "Sunday",
  januari: "January", februari: "February", mars: "March", april: "April", maj: "May", juni: "June", juli: "July", augusti: "August",
  september: "September", oktober: "October", november: "November", december: "December",
  "jan.": "Jan", "feb.": "Feb", "mars.": "Mar", "apr.": "Apr", "juni.": "Jun", "juli.": "Jul", "aug.": "Aug", "sep.": "Sep", "okt.": "Oct", "nov.": "Nov", "dec.": "Dec",
  "mån": "Mon", "tis": "Tue", "ons": "Wed", "tors": "Thu", "fre": "Fri", "lör": "Sat", "sön": "Sun",
};
const DATE_RE = new RegExp(`(^|[\\s,(])(${Object.keys(DATE_WORDS).map((w) => w.replace(".", "\\.")).join("|")})(?=$|[\\s,.)])`, "g");
const NUM = /\d[\d\s.,]*\d|\d/g;

export function toEnglish(text) {
  if (!text || !/[A-Za-zÅÄÖåäö]/.test(text)) return text;
  const lead = text.match(/^\s*/)[0];
  const tail = text.match(/\s*$/)[0];
  const core = text.trim();
  if (EN[core] != null) return lead + EN[core] + tail;
  const nums = [];
  const key = core.replace(NUM, (m) => (nums.push(m), "{#}"));
  if (nums.length && EN_NUM[key] != null) {
    let i = 0;
    return lead + EN_NUM[key].replace(/\{#\}/g, () => nums[i++] ?? "") + tail;
  }
  for (const [re, to] of PATTERNS) if (re.test(core)) return lead + core.replace(re, to) + tail;
  if (/\d/.test(core) && DATE_RE.test(core)) {
    DATE_RE.lastIndex = 0;
    return lead + core.replace(DATE_RE, (m, pre, w) => pre + DATE_WORDS[w]).replace(/ kl\. /g, " at ") + tail;
  }
  return text;
}

// Keep a part of the page translated while it changes. → stop()
const ATTRS = ["placeholder", "title", "aria-label"];
export function translatePage(root) {
  const original = new WeakMap(); // node → its Swedish text
  const originalAttr = new WeakMap(); // element → { attr: Swedish }
  const doText = (n) => {
    const p = n.parentElement;
    if (!p || p.closest("style,script,textarea,[contenteditable],[data-no-translate]")) return;
    const sv = original.has(n) && n.nodeValue === original.get(n).en ? original.get(n).sv : n.nodeValue;
    const en = toEnglish(sv);
    if (en !== sv) { original.set(n, { sv, en }); if (n.nodeValue !== en) n.nodeValue = en; }
  };
  const doAttrs = (el) => {
    const kept = originalAttr.get(el) || {};
    for (const a of ATTRS) {
      const v = el.getAttribute?.(a);
      if (!v) continue;
      const sv = kept[a] && v === kept[a].en ? kept[a].sv : v;
      const en = toEnglish(sv);
      if (en !== sv) { kept[a] = { sv, en }; if (v !== en) el.setAttribute(a, en); }
    }
    originalAttr.set(el, kept);
  };
  const walk = (node) => {
    if (node.nodeType === 3) return doText(node);
    if (node.nodeType !== 1) return;
    doAttrs(node);
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    while (w.nextNode()) (w.currentNode.nodeType === 3 ? doText : doAttrs)(w.currentNode);
  };
  const title = () => { const en = toEnglish(document.title); if (en !== document.title) document.title = en; };
  walk(root);
  title();
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") doText(m.target);
      else if (m.type === "attributes") doAttrs(m.target);
      else m.addedNodes.forEach(walk);
    }
  });
  obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  const headObs = new MutationObserver(title);
  const t = document.querySelector("title");
  if (t) headObs.observe(t, { childList: true, characterData: true, subtree: true });
  // Back to Swedish: every node and attribute as it was written.
  return () => {
    obs.disconnect();
    headObs.disconnect();
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    const restore = (n) => {
      if (n.nodeType === 3) { const o = original.get(n); if (o && n.nodeValue === o.en) n.nodeValue = o.sv; return; }
      const kept = originalAttr.get(n);
      if (kept) for (const [a, o] of Object.entries(kept)) if (n.getAttribute(a) === o.en) n.setAttribute(a, o.sv);
    };
    restore(root);
    while (w.nextNode()) restore(w.currentNode);
  };
}

// The browser's language when nobody has picked: Swedish only for Swedish ones.
export function browserLang() {
  return (typeof navigator !== "undefined" && (navigator.language || "").toLowerCase().startsWith("sv")) ? "sv" : "en";
}
