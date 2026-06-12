// The import-format corpus: faithful header reconstructions of the biggest
// CSV export structures in the wild + structural nasties (delimiters, BOM,
// multiline quotes, ragged rows). Shared by the experiment script
// (scripts/experiment-import-formats.mjs) and the regression test
// (tests/import-formats.test.js) so every format here is enforced forever.
//
// Fixture flags: expectEmail (false = format has no emails, importer must
// refuse honestly) · expectName:false (format has no usable full name) ·
// expectRejects (rows that must reject, e.g. blank emails) ·
// expectSkipped (parser-level malformed rows that must be SURFACED).

export const FIXTURES = [
  // ── round 2: more brands ──────────────────────────────────────────────
  {
    brand: "LinkedIn (connections export)",
    expectEmail: true, // emails often blank — blanks must reject honestly
    csv: [
      `First Name,Last Name,URL,Email Address,Company,Position,Connected On`,
      `Alma,Ahl,https://www.linkedin.com/in/almaahl,alma.ahl@gmail.com,Ahl Design,Founder,12 Mar 2025`,
      `Bo,Bro,https://www.linkedin.com/in/bobro,,Bro AB,CEO,01 Jan 2024`,
    ].join("\n"),
    expectRejects: 1,
  },
  {
    brand: "HubSpot (contacts export)",
    expectEmail: true,
    csv: [
      `First Name,Last Name,Email,Phone Number,Contact owner,Lifecycle Stage,Create Date`,
      `Cilla,Ceder,cilla@ceder.se,+46 70 999 88 77,felix@pullup.se,customer,2025-08-09`,
      `David,Dal,david.dal@gmail.com,,felix@pullup.se,lead,2025-09-10`,
    ].join("\n"),
  },
  {
    brand: "Salesforce (contacts report)",
    expectEmail: true,
    csv: [
      `Salutation,First Name,Last Name,Email,Phone,Account Name,Title,Mailing City`,
      `Ms.,Elsa,Ek,elsa.ek@gmail.com,0701231234,Ek Events,Owner,Stockholm`,
      `Mr.,Frank,Fors,frank@fors.io,,Fors Live,Booker,Malmö`,
    ].join("\n"),
  },
  {
    brand: "Pipedrive (persons export)",
    expectEmail: true,
    csv: [
      `Name,Email,Phone,Organization,Owner,Label`,
      `Greta Gran,greta.gran@gmail.com,46701112233,Gran Collective,Felix,warm`,
      `Hugo Hed,hugo@hed.se,070-444 55 66,,Felix,cold`,
    ].join("\n"),
  },
  {
    brand: "Squarespace (mailing list)",
    expectEmail: true,
    expectName: false,
    csv: [
      `Email Address,Date Subscribed`,
      `ines@gmail.com,2025-06-01T12:00:00Z`,
      `jon@gmail.com,2025-07-15T09:30:00Z`,
    ].join("\n"),
  },
  {
    brand: "WooCommerce (customers)",
    expectEmail: true,
    csv: [
      `Customer ID,Username,First name,Last name,Email,Billing Phone,City,Total spend,Order count`,
      `881,kal_kund,Kal,Kund,kal.kund@gmail.com,0709090909,Uppsala,899kr,3`,
      `882,lo.l,Lo,Lind,lo.lind@gmail.com,,Lund,0,0`,
    ].join("\n"),
  },
  {
    brand: "Kit / ConvertKit (subscribers)",
    expectEmail: true,
    csv: [
      `first_name,email_address,state,created_at,tags`,
      `Maja,maja@gmail.com,active,2025-03-03,“creators”`,
      `Nils,nils@gmail.com,active,2025-04-04,`,
    ].join("\n"),
    expectName: false, // only a first name exists in this format
  },
  {
    brand: "Beehiiv (subscribers)",
    expectEmail: true,
    expectName: false,
    csv: [
      `Email,Status,Created At,Subscription Tier`,
      `oden@gmail.com,Active,2025-10-10 10:10:10,free`,
      `pelle@gmail.com,Active,2025-11-11 11:11:11,premium`,
    ].join("\n"),
  },
  {
    brand: "Stripe (customers export)",
    expectEmail: true,
    csv: [
      `id,Email,Name,Description,Created (UTC),Total Spend`,
      `cus_ABC123,questa@gmail.com,Questa Quist,VIP table buyer,2025-05-05 19:00,2400.00`,
      `cus_DEF456,rio@gmail.com,Rio Rask,,2025-06-06 20:00,0.00`,
    ].join("\n"),
  },
  {
    brand: "Meetup (group members)",
    expectEmail: false, // Meetup exports have no member emails — honest reject
    csv: [
      `Name,User ID,Title,Member ID,Location,Joined Group on,Last visited group on,RSVPs`,
      `Sara Sten,123,Member,456,Stockholm,2024-01-01,2026-06-01,12`,
    ].join("\n"),
  },
  {
    brand: "Tito (attendees)",
    expectEmail: true,
    csv: [
      `Ticket,Reference,Name,Email,Tags,Registration Date`,
      `Early Bird,ABCD-1,Tina Torn,tina.torn@gmail.com,,2026-04-01 09:00`,
      `Standard,ABCD-2,Uno Udd,uno.udd@gmail.com,crew,2026-04-02 10:00`,
    ].join("\n"),
  },
  {
    brand: "Typeform (responses)",
    expectEmail: true,
    csv: [
      `#,What's your name?,What's your email?,Phone number,Submitted At`,
      `1,Vilma Värn,vilma@gmail.com,+46 72 000 11 22,2026-05-30 18:00:01`,
      `2,Wilmer Wide,wilmer@gmail.com,,2026-05-30 18:05:44`,
    ].join("\n"),
  },
  {
    brand: "Google Forms (responses)",
    expectEmail: true,
    csv: [
      `Timestamp,Email Address,Your full name,Phone,Anything we should know?`,
      `2026/05/28 7:01:33 PM GMT+2,xena@gmail.com,Xena Xu,0760001122,Vegetarian`,
      `2026/05/28 7:14:09 PM GMT+2,yusuf@gmail.com,Yusuf Yil,,`,
    ].join("\n"),
  },
  {
    brand: "Apple/iCloud contacts (CSV via export tool)",
    expectEmail: true,
    csv: [
      `First name,Last name,Email address,Phone number,Company,Note`,
      `Zara,Zell,zara.zell@icloud.com,+46 70 333 22 11,,From the rooftop night`,
      `Åke,Ärn,ake.arn@icloud.com,,Ärn Bygg,`,
    ].join("\n"),
  },
  {
    brand: "Facebook Lead Ads (leads export)",
    expectEmail: true,
    csv: [
      `id,created_time,ad_name,form_name,full_name,email,phone_number`,
      `l_1,2026-05-01T10:00:00,Summer Promo,Guestlist Form,Örjan Öberg,orjan@gmail.com,p:+46700005566`,
      `l_2,2026-05-01T11:00:00,Summer Promo,Guestlist Form,Astrid Alm,astrid.alm@gmail.com,`,
    ].join("\n"),
    expectDrops: true, // "p:+46..." facebook phone prefix won't parse — dropped, not guessed
  },
  // ── structural nasties ────────────────────────────────────────────────
  {
    brand: "Swedish Excel (semicolon + sep hint + CRLF)",
    expectEmail: true,
    csv: "sep=;\r\nNamn;E-post;Mobil\r\nBritt Berg;britt.berg@gmail.com;070-111 22 33\r\nCurt Co;curt@co.se;\r\n",
  },
  {
    brand: "Semicolon CSV without sep hint",
    expectEmail: true,
    csv: "Namn;E-post;Telefon\nDora Dunn;dora@gmail.com;0701234321\nEbbe Elm;ebbe@elm.se;",
  },
  {
    brand: "Tab-separated export",
    expectEmail: true,
    csv: "Name\tEmail\tPhone\nFilippa Falk\tfilippa@gmail.com\t+46709998877\nGöran Gris\tgoran@gris.se\t",
  },
  {
    brand: "UTF-8 BOM in front of header",
    expectEmail: true,
    csv: "\ufeffName,Email\nHedda Hall,hedda@gmail.com",
  },
  {
    brand: "Quoted multiline field (address with newline)",
    expectEmail: true,
    csv: 'Name,Email,Address\nIda Inge,ida@gmail.com,"Storgatan 1\n114 55 Stockholm"\nJalle Jern,jalle@gmail.com,Kungsgatan 2',
  },
  {
    brand: "Ragged + blank rows (must surface, never vanish)",
    expectEmail: true,
    csv: "Name,Email\nKalla Kry,kalla@gmail.com\n\nLisa Lo,lisa@gmail.com,EXTRA,CELLS\nMona My,mona@gmail.com",
    expectSkipped: 1,
  },
  {
    brand: "Angle-bracket + mailto emails",
    expectEmail: true,
    csv: "Name,Email\nNea Nord,Nea Nord <NEA.NORD@GMAIL.COM>\nOlle Orm,mailto:olle@orm.se",
  },
  {
    brand: "Duplicate + blank headers",
    expectEmail: true,
    csv: "Name,Email,Email,\nPia Palm,pia@gmail.com,pia.alt@gmail.com,extra",
  },

  {
    brand: "Eventbrite (attendee report)",
    expectEmail: true,
    csv: [
      `Order #,Order Date,First Name,Surname,Email,Event Name,Ticket Type,Attendee Status`,
      `123456789,2026-05-01,Anna,Andersson,anna.andersson@gmail.com,Summer Rooftop,General Admission,Checked In`,
      `123456790,2026-05-01,Björn,Berg,bjorn.berg@hotmail.com,Summer Rooftop,VIP,Attending`,
      `123456791,2026-05-02,Cleo,Carlsson,cleo@outlook.com,Summer Rooftop,General Admission,Not Attending`,
    ].join("\n"),
  },
  {
    brand: "Luma (guest export)",
    expectEmail: true,
    csv: [
      `name,first_name,last_name,email,phone_number,created_at,approval_status,checked_in_at,ticket_name`,
      `Dani Svensson,Dani,Svensson,dani.sv@gmail.com,+46701234567,2026-04-20T10:00:00Z,approved,2026-05-01T19:02:00Z,Free`,
      `Erik Ek,Erik,Ek,erik.ek@proton.me,,2026-04-21T11:30:00Z,approved,,Free`,
    ].join("\n"),
  },
  {
    brand: "Mailchimp (audience export)",
    expectEmail: true,
    csv: [
      `Email Address,First Name,Last Name,Address,Phone Number,Birthday,Tags,MEMBER_RATING,OPTIN_TIME`,
      `fia@gmail.com,Fia,Falk,"Storgatan 1, Stockholm",0709876543,04/12,"vip,newsletter",4,2025-11-02 18:22:11`,
      `gus@yahoo.com,Gustav,Grön,,,,newsletter,3,2025-12-14 09:01:54`,
    ].join("\n"),
  },
  {
    brand: "Google Contacts",
    expectEmail: true,
    csv: [
      `Name,Given Name,Family Name,Birthday,Notes,E-mail 1 - Value,Phone 1 - Value,Organization 1 - Name`,
      `Hanna Holm,Hanna,Holm,1992-03-14,Met at Natura,hanna.holm@gmail.com,+46 70 111 22 33,Holm Studio`,
      `Ivar Idh,Ivar,Idh,,,ivar@idh.se,0701112234,`,
    ].join("\n"),
  },
  {
    brand: "Outlook Contacts",
    expectEmail: true,
    csv: [
      `First Name,Middle Name,Last Name,E-mail Address,Mobile Phone,Company,Birthday`,
      `Johan,,Jansson,johan.jansson@live.se,+46 73 555 66 77,Jansson AB,1988-07-21`,
      `Karin,Maria,Kron,karin.kron@gmail.com,,,`,
    ].join("\n"),
  },
  {
    brand: "Shopify (customers export)",
    expectEmail: true,
    csv: [
      `First Name,Last Name,Email,Accepts Email Marketing,Default Address Company,Phone,Tags,Total Spent,Total Orders`,
      `Lina,Lund,lina.lund@gmail.com,yes,,+46761234567,"stamkund,vip",1240.00,7`,
      `Måns,Malm,mans@malm.se,no,Malm Foto,,,"0.00",0`,
    ].join("\n"),
  },
  {
    brand: "Patreon (members export)",
    expectEmail: true,
    csv: [
      `Name,Email,Twitter,Patron Status,Lifetime Amount,Pledge Amount,Tier`,
      `Nora Nyberg,nora.nyberg@gmail.com,@noranyberg,Active patron,420,5,Inner Circle`,
      `Otto Öst,otto.ost@gmail.com,,Former patron,60,0,`,
    ].join("\n"),
  },
  {
    brand: "Substack (subscribers export)",
    expectEmail: true,
    expectName: false, // the format simply has no name column

    csv: [
      `email,active_subscription,expiry,email_disabled,created_at`,
      `pia@gmail.com,true,,false,2025-09-01T08:00:00Z`,
      `quintus@mail.com,false,2026-01-01,false,2025-10-12T12:30:00Z`,
    ].join("\n"),
  },
  {
    brand: "Klaviyo (profiles export)",
    expectEmail: true,
    csv: [
      `Email,First Name,Last Name,Phone Number,Organization,Title,City,Country,Tags`,
      `rut@gmail.com,Rut,Rask,+46700001111,Rask Events,Founder,Stockholm,Sweden,engaged`,
      `sten@gmail.com,Sten,Sand,,,,Göteborg,Sweden,`,
    ].join("\n"),
  },
  {
    brand: "Dice / Billetto (guest list)",
    expectEmail: true,
    csv: [
      `First name,Last name,Email,Event,Ticket type,Order date`,
      `Tove,Toll,tove.toll@gmail.com,NATURA Listening,Early Bird,2026-04-15`,
      `Ulf,Unt,ulf.unt@gmail.com,NATURA Listening,Door,2026-05-01`,
    ].join("\n"),
  },
  {
    brand: "Tickster-style (Swedish ticketing)",
    expectEmail: true,
    csv: [
      `Förnamn,Efternamn,E-post,Mobilnummer,Biljettyp,Evenemang,Köpdatum`,
      `Vera,Vik,vera.vik@gmail.com,070-222 33 44,Ordinarie,Klubb Natura,2026-05-20`,
      `Wille,Wass,wille@wass.se,,Student,Klubb Natura,2026-05-21`,
    ].join("\n"),
  },
  {
    brand: "Instagram followers (no emails — must reject honestly)",
    expectEmail: false,
    csv: [
      `Username,Full Name,Profile URL`,
      `anna.probe,Anna Probe,https://instagram.com/anna.probe`,
      `bertil.p,Bertil P,https://instagram.com/bertil.p`,
    ].join("\n"),
  },
];
