// The data processing agreement (personuppgiftsbiträdesavtal, GDPR art. 28)
// an organisation accepts before bringing its own contacts into PullUp. A
// standard draft: the organisation is the controller, PullUp the processor.
// The version is kept with every import (backend repos/imports.js DPA_VERSION).
// ⚠️ A draft to be reviewed by a lawyer before it's final.
export const DPA_VERSION = "2026-11-03";

export const DPA = {
  sv: {
    title: "Personuppgiftsbiträdesavtal",
    note: "Utkast. Standardavtal enligt GDPR artikel 28, version " + DPA_VERSION + ".",
    sections: [
      ["1. Parter", "Personuppgiftsansvarig: organisationen som använder kontot (”den Ansvarige”), med de varumärken som ligger under kontot. Personuppgiftsbiträde: PullUp, pullup.se (”Biträdet”), [organisationsnummer]. Avtalet gäller från att den Ansvarige godkänner det i PullUp och så länge kontot används."],
      ["2. Syfte och instruktioner", "Biträdet behandlar personuppgifter för den Ansvariges räkning för att tillhandahålla PullUp: eventsidor, anmälningar, gästlistor, CRM, utskick och statistik. Biträdet behandlar uppgifterna endast enligt den Ansvariges dokumenterade instruktioner, som utgörs av detta avtal och den Ansvariges användning av tjänsten. Biträdet använder aldrig uppgifterna för egna ändamål, säljer dem inte och delar dem inte med andra kunder."],
      ["3. Personuppgifter och registrerade", "Kategorier av registrerade: den Ansvariges kunder, gäster, prenumeranter och kontakter. Kategorier av uppgifter: namn, e-postadress, telefonnummer, Instagram-namn, anmälningar och svar på anmälningsfrågor, närvaro, samtycke till utskick per varumärke och dess källa, samt avregistreringar. Inga känsliga personuppgifter ska föras in; svar om exempelvis allergier lämnas av den registrerade själv och används enbart för det aktuella eventet."],
      ["4. Den Ansvariges ansvar", "Den Ansvarige ansvarar för att det finns rättslig grund för behandlingen, särskilt att importerade kontakter har lämnat samtycke till utskick från det varumärke de importeras till, och att källan till samtycket anges vid importen."],
      ["5. Säkerhet och sekretess", "Biträdet vidtar lämpliga tekniska och organisatoriska åtgärder: krypterad överföring, åtkomst begränsad till behöriga i den Ansvariges team, separerade data per konto och varumärke, loggning av utskick och importer. Personer hos Biträdet som har åtkomst omfattas av tystnadsplikt."],
      ["6. Underbiträden", "Biträdet anlitar följande underbiträden för drift: Supabase (databas och lagring), Resend (e-postutskick), Amazon Web Services (servrar), Cloudflare (nätverk och skydd mot missbruk) och Google (adressökning och kartor). Biträdet informerar den Ansvarige före byte av underbiträde, som då kan invända. Underbiträden omfattas av motsvarande skyldigheter."],
      ["7. Överföring till tredje land", "Om uppgifter behandlas utanför EU/EES sker det med stöd av EU-kommissionens standardavtalsklausuler eller annan giltig överföringsmekanism. [Bekräfta lagringsregion.]"],
      ["8. Den registrerades rättigheter", "Biträdet bistår den Ansvarige med att besvara begäranden om tillgång, rättelse, radering och invändning. Varje utskick innehåller en avregistreringslänk som respekteras för alla varumärken."],
      ["9. Personuppgiftsincidenter", "Biträdet underrättar den Ansvarige utan onödigt dröjsmål, och senast inom 48 timmar efter att ha fått kännedom om en incident, med den information som behövs för den Ansvariges anmälan till Integritetsskyddsmyndigheten."],
      ["10. Avtalets upphörande", "När avtalet upphör raderar eller återlämnar Biträdet personuppgifterna enligt den Ansvariges val, och raderar befintliga kopior inom 30 dagar, om inte lag kräver lagring. Den Ansvarige kan när som helst exportera sina kontakter från CRM:et."],
      ["11. Revision", "Biträdet ger den Ansvarige den information som behövs för att visa att skyldigheterna i detta avtal fullgörs, och möjliggör granskning efter skriftlig begäran med rimligt varsel."],
      ["12. Ansvar och tillämplig lag", "Vardera part ansvarar för skador som uppstår genom egen överträdelse av GDPR. Svensk lag gäller. Tvister avgörs av svensk allmän domstol."],
    ],
    accept: (org) => `Jag har läst och godkänner personuppgiftsbiträdesavtalet för ${org}.`,
  },
  en: {
    title: "Data processing agreement",
    note: "Draft. Standard agreement under GDPR article 28, version " + DPA_VERSION + ".",
    sections: [
      ["1. Parties", "Controller: the organisation using the account (\"the Controller\"), with the brands under the account. Processor: PullUp, pullup.se (\"the Processor\"), [company registration number]. The agreement applies from when the Controller accepts it in PullUp and for as long as the account is used."],
      ["2. Purpose and instructions", "The Processor processes personal data on the Controller's behalf to provide PullUp: event pages, sign-ups, guest lists, CRM, mail and statistics, only on the Controller's documented instructions — this agreement and the Controller's use of the service. The Processor never uses the data for its own purposes, never sells it and never shares it with other customers."],
      ["3. Personal data and data subjects", "Data subjects: the Controller's customers, guests, subscribers and contacts. Data: name, email address, phone number, Instagram handle, sign-ups and answers to sign-up questions, attendance, consent to mail per brand and its source, and unsubscribes. No sensitive personal data is to be entered; answers such as allergies are given by the data subject and used only for that event."],
      ["4. The Controller's responsibility", "The Controller is responsible for a lawful basis for the processing, in particular that imported contacts have consented to mail from the brand they are imported into, and for stating the source of that consent at import."],
      ["5. Security and confidentiality", "The Processor takes appropriate technical and organisational measures: encrypted transfer, access limited to authorised members of the Controller's team, data separated per account and brand, logging of mail and imports. Staff of the Processor with access are bound by confidentiality."],
      ["6. Sub-processors", "The Processor uses these sub-processors: Supabase (database and storage), Resend (email), Amazon Web Services (servers), Cloudflare (network and abuse protection) and Google (address search and maps). The Processor informs the Controller before changing a sub-processor, and the Controller may object. Sub-processors are bound by equivalent obligations."],
      ["7. Transfers outside the EU/EEA", "Where data is processed outside the EU/EEA, this is done under the European Commission's standard contractual clauses or another valid transfer mechanism. [Confirm storage region.]"],
      ["8. Data subjects' rights", "The Processor assists the Controller in answering requests for access, rectification, erasure and objection. Every mailing carries an unsubscribe link, honoured across all brands."],
      ["9. Personal data breaches", "The Processor notifies the Controller without undue delay, and at the latest within 48 hours of becoming aware of a breach, with the information the Controller needs to notify the supervisory authority."],
      ["10. Termination", "When the agreement ends, the Processor deletes or returns the personal data at the Controller's choice and deletes existing copies within 30 days, unless the law requires storage. The Controller can export its contacts from the CRM at any time."],
      ["11. Audit", "The Processor makes available the information needed to show that the obligations in this agreement are met, and allows audits on written request with reasonable notice."],
      ["12. Liability and governing law", "Each party is liable for damage caused by its own breach of the GDPR. Swedish law applies; disputes are settled by Swedish courts."],
    ],
    accept: (org) => `I have read and accept the data processing agreement on behalf of ${org}.`,
  },
};
