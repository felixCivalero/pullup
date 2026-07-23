// ÅRSREDOVISNING GENERATOR (admin-only, creator-perk later) — turns a small
// set of atomic K2 amounts into a complete, taxonomy-valid iXBRL document
// (XHTML) that Bolagsverket's digital filing pipeline accepts. All sums are
// DERIVED here, never entered: a document that does not balance cannot be
// generated — validate() refuses with human-readable Swedish errors first.
// Submission itself is stubbed until PullUp holds a Bolagsverket avtal +
// klientcertifikat (see routes/adminArsredovisning.js); until then the file
// downloads for manual handling and next-gen (FY2026, digital-mandatory)
// filing goes live by flipping BOLAGSVERKET_API_ENABLED.
/**
 * Bolagsverket K2 iXBRL årsredovisning generator.
 *
 * Produces a complete, taxonomy-valid iXBRL document (XHTML) for a Swedish
 * aktiebolag following K2 (BFNAR 2016:10), taxonomy version 2021-10-31,
 * entry point se-k2-risbs — the exact structure Bolagsverket's digital
 * filing API accepts.
 *
 * Modeled on taxonomier.se official example
 * (faststalld-arsredovisning-exempel-1-rev20240214.xhtml) and validated
 * with Arelle against the live taxonomy (zero errors) for the reference
 * fixture (Kaijas Collective AB FY2025).
 *
 * Input = atomic amounts only; all sums are derived here so a document
 * that doesn't balance can never be generated — validate() refuses first.
 */

// ---- Taxonomy-fixed enum strings (exact — Bolagsverket rejects variants) ----
const INTYG_FASTSTALLELSE_RR_BR =
  'Jag intygar att resultaträkningen och balansräkningen har fastställts på årsstämma';
const INTYG_DISPOSITION = {
  vinst: 'Årsstämman beslöt att godkänna styrelsens förslag till vinstdisposition.',
  forlust: 'Årsstämman beslöt att godkänna styrelsens förslag till behandling av ansamlad förlust.',
};
const INTYG_ORIGINAL =
  'Jag intygar att innehållet i dessa elektroniska handlingar överensstämmer med originalen och att originalen undertecknats av samtliga personer som enligt lag ska underteckna dessa.';
const INTYG_ELEKTRONISKT = 'Elektroniskt underskriven av';

const G = 'se-gen-base';

// ---------------------------------------------------------------- formatting
const fmt = (n) => Math.abs(Math.round(n)).toLocaleString('sv-SE').replace(/ /g, ' ');

function money(elem, ctx, val, { bold = false } = {}) {
  const sign = val < 0 ? ' sign="-"' : '';
  const minus = val < 0 ? '−' : '';
  const [b0, b1] = bold ? ['<strong>', '</strong>'] : ['', ''];
  return (
    `${b0}${minus}<ix:nonFraction contextRef="${ctx}" name="${elem}" unitRef="SEK" ` +
    `decimals="INF" scale="0" format="ixt:numspacecomma"${sign}>${fmt(val)}</ix:nonFraction>${b1}`
  );
}

/** Debit-balance element (costs): taxonomy value positive, minus rendered outside. */
function debitCell(elem, ctx, val) {
  const v = Math.abs(val);
  if (v === 0) {
    return `<ix:nonFraction contextRef="${ctx}" name="${elem}" unitRef="SEK" decimals="INF" scale="0" format="ixt:numspacecomma">0</ix:nonFraction>`;
  }
  return (
    `−<ix:nonFraction contextRef="${ctx}" name="${elem}" unitRef="SEK" ` +
    `decimals="INF" scale="0" format="ixt:numspacecomma">${fmt(v)}</ix:nonFraction>`
  );
}

function soliditetCell(ctx, value) {
  if (value === null || value === undefined) return '';
  const txt = value.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  return (
    `<ix:nonFraction contextRef="${ctx}" name="se-gen-base:Soliditet" unitRef="procent" ` +
    `format="ixt:numcomma" scale="-2" decimals="INF">${txt}</ix:nonFraction>`
  );
}

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// --------------------------------------------------------------- derivation
/**
 * Derive every sum from atomic inputs. Shapes:
 * rr: { nettoomsattning, ovrigaRorelseintakter, personalkostnader, ovrigaExternaKostnader,
 *       avskrivningar, ranteintakter, rantekostnader }   (costs entered as POSITIVE numbers)
 * br: { inventarier, ovrigaFordringar, kassaBank, aktiekapital,
 *       ovrigaLangfristigaSkulder, ovrigaKortfristigaSkulder }
 * ek: { balanseratResultatIngaende, aretsResultatForegaende,
 *       erhallnaAktieagartillskott = 0, utdelning = 0 }
 */
export function derive(year) {
  const { rr, br, ek } = year;
  const sumIntakter = rr.nettoomsattning + (rr.ovrigaRorelseintakter || 0);
  const sumKostnader = -(rr.personalkostnader + rr.ovrigaExternaKostnader + rr.avskrivningar);
  const rorelseresultat = sumIntakter + sumKostnader;
  const finansiellaPoster = (rr.ranteintakter || 0) - (rr.rantekostnader || 0);
  const resultatEfterFin = rorelseresultat + finansiellaPoster;
  const aretsResultat = resultatEfterFin; // K2 utan skatt/bokslutsdispositioner i detta scope

  const balanseratUtgaende =
    ek.balanseratResultatIngaende +
    ek.aretsResultatForegaende +
    (ek.erhallnaAktieagartillskott || 0) -
    (ek.utdelning || 0);
  const frittEgetKapital = balanseratUtgaende + aretsResultat;
  const egetKapital = br.aktiekapital + frittEgetKapital;

  const materiellaAnl = br.inventarier;
  const anlaggningstillgangar = materiellaAnl;
  const kortfristigaFordringar = br.ovrigaFordringar;
  const omsattningstillgangar = kortfristigaFordringar + br.kassaBank;
  const tillgangar = anlaggningstillgangar + omsattningstillgangar;
  const langfristigaSkulder = br.ovrigaLangfristigaSkulder;
  const kortfristigaSkulder = br.ovrigaKortfristigaSkulder;
  const egetKapitalSkulder = egetKapital + langfristigaSkulder + kortfristigaSkulder;

  const soliditet = tillgangar !== 0 ? Math.round((egetKapital / tillgangar) * 1000) / 10 : null;

  return {
    sumIntakter, sumKostnader, rorelseresultat, finansiellaPoster, resultatEfterFin,
    aretsResultat, balanseratUtgaende, frittEgetKapital, egetKapital,
    materiellaAnl, anlaggningstillgangar, kortfristigaFordringar, omsattningstillgangar,
    tillgangar, langfristigaSkulder, kortfristigaSkulder, egetKapitalSkulder, soliditet,
  };
}

// --------------------------------------------------------------- validation
export function validate(data) {
  const errors = [];
  const req = (v, label) => {
    if (v === undefined || v === null || v === '') errors.push(`Saknat fält: ${label}`);
  };
  req(data.company?.name, 'företagsnamn');
  req(data.company?.orgnr, 'organisationsnummer');
  if (data.company?.orgnr && !/^\d{6}-\d{4}$/.test(data.company.orgnr)) {
    errors.push('Organisationsnummer måste ha formatet 123456-1234');
  }
  req(data.fiscalYear?.start, 'räkenskapsårets första dag');
  req(data.fiscalYear?.end, 'räkenskapsårets sista dag');
  req(data.stamma?.date, 'datum för årsstämma');
  req(data.signature?.firstName, 'företrädarens tilltalsnamn');
  req(data.signature?.lastName, 'företrädarens efternamn');
  req(data.signature?.role, 'företrädarens roll');
  req(data.signature?.city, 'ort för undertecknande');
  req(data.signature?.date, 'datum för undertecknande');
  req(data.texts?.verksamheten, 'allmänt om verksamheten');
  if (!data.currentYear) errors.push('Saknat fält: räkenskapsårets siffror');
  if (!data.previousYear) errors.push('Saknat fält: föregående års siffror');
  if (errors.length) return errors;

  const d = derive(data.currentYear);
  const dp = derive(data.previousYear);

  // Balansidentitet — huvudkontrollen
  if (d.tillgangar !== d.egetKapitalSkulder) {
    errors.push(
      `Balansräkningen balanserar inte: tillgångar ${fmt(d.tillgangar)} kr ≠ eget kapital och skulder ${fmt(d.egetKapitalSkulder)} kr (skiljer ${fmt(d.tillgangar - d.egetKapitalSkulder)} kr)`
    );
  }
  if (dp.tillgangar !== dp.egetKapitalSkulder) {
    errors.push('Föregående års balansräkning balanserar inte');
  }
  // Kontinuitet: årets ingående EK-poster = föregående års utgående
  const ekIn = data.currentYear.ek;
  if (ekIn.balanseratResultatIngaende !== dp.balanseratUtgaende) {
    errors.push(
      `Ingående balanserat resultat (${fmt(ekIn.balanseratResultatIngaende)}) matchar inte föregående års utgående (${fmt(dp.balanseratUtgaende)})`
    );
  }
  if (ekIn.aretsResultatForegaende !== dp.aretsResultat) {
    errors.push(
      `"Balanseras i ny räkning" (${fmt(ekIn.aretsResultatForegaende)}) matchar inte föregående års resultat (${fmt(dp.aretsResultat)})`
    );
  }
  if (data.currentYear.br.aktiekapital !== data.previousYear.br.aktiekapital) {
    // inte fel i sig (nyemission) men utanför scope — flagga
    errors.push('Ändrat aktiekapital stöds inte ännu (nyemission/minskning)');
  }
  return errors;
}

// --------------------------------------------------------------- generation
export function generate(data) {
  const errors = validate(data);
  if (errors.length) {
    const err = new Error('Ogiltiga indata: ' + errors.join(' | '));
    err.validationErrors = errors;
    throw err;
  }

  const { company, fiscalYear, stamma, signature, texts, history = [] } = data;
  const cur = data.currentYear;
  const prev = data.previousYear;
  const d = derive(cur);
  const dp = derive(prev);
  const dispositionType = d.frittEgetKapital < 0 ? 'forlust' : 'vinst';

  const y0 = fiscalYear.end.slice(0, 4);
  const y1 = String(Number(y0) - 1);
  const y2 = String(Number(y0) - 2);
  const y3 = String(Number(y0) - 3);
  const prevStart = `${y1}${fiscalYear.start.slice(4)}`;
  const prevEnd = `${y1}${fiscalYear.end.slice(4)}`;

  // history: [{year: '2023', nettoomsattning, resultatEfterFin, soliditet}, ...] oldest years for flerårsöversikt
  const hist = Object.fromEntries(history.map((h) => [h.year, h]));

  const contexts = [
    ['period0', fiscalYear.start, fiscalYear.end],
    ['period1', prevStart, prevEnd],
    ['period2', `${y2}-01-01`, `${y2}-12-31`],
    ['period3', `${y3}-01-01`, `${y3}-12-31`],
  ]
    .map(
      ([id, s, e]) => `
      <xbrli:context id="${id}">
        <xbrli:entity><xbrli:identifier scheme="http://www.bolagsverket.se">${company.orgnr}</xbrli:identifier></xbrli:entity>
        <xbrli:period><xbrli:startDate>${s}</xbrli:startDate><xbrli:endDate>${e}</xbrli:endDate></xbrli:period>
      </xbrli:context>`
    )
    .join('') +
    [
      ['balans0', fiscalYear.end],
      ['balans1', prevEnd],
      ['balans2', `${y2}-12-31`],
      ['balans3', `${y3}-12-31`],
    ]
      .map(
        ([id, i]) => `
      <xbrli:context id="${id}">
        <xbrli:entity><xbrli:identifier scheme="http://www.bolagsverket.se">${company.orgnr}</xbrli:identifier></xbrli:entity>
        <xbrli:period><xbrli:instant>${i}</xbrli:instant></xbrli:period>
      </xbrli:context>`
      )
      .join('');

  const rrRow = (label, elem, v0, v1, { bold = false, debit = false } = {}) => {
    const cell = (ctx, v) =>
      debit ? debitCell(`${G}:${elem}`, ctx, v) : money(`${G}:${elem}`, ctx, v, { bold });
    const lb = bold ? `<strong>${esc(label)}</strong>` : esc(label);
    return `<tr><td>${lb}</td><td class="num">${cell('period0', v0)}</td><td class="num">${cell('period1', v1)}</td></tr>\n`;
  };
  const brRow = (label, elem, v0, v1, { bold = false } = {}) => {
    const lb = bold ? `<strong>${esc(label)}</strong>` : esc(label);
    return `<tr><td>${lb}</td><td class="num">${money(`${G}:${elem}`, 'balans0', v0, { bold })}</td><td class="num">${money(`${G}:${elem}`, 'balans1', v1, { bold })}</td></tr>\n`;
  };
  const heading = (label) => `<tr><td><strong>${esc(label)}</strong></td><td></td><td></td></tr>\n`;

  // Flerårsöversikt cells
  const flerNetto = [
    money(`${G}:Nettoomsattning`, 'period0', cur.rr.nettoomsattning),
    money(`${G}:Nettoomsattning`, 'period1', prev.rr.nettoomsattning),
    hist[y2]?.nettoomsattning != null ? money(`${G}:Nettoomsattning`, 'period2', hist[y2].nettoomsattning) : '',
    hist[y3]?.nettoomsattning != null ? money(`${G}:Nettoomsattning`, 'period3', hist[y3].nettoomsattning) : '',
  ];
  const flerRes = [
    money(`${G}:ResultatEfterFinansiellaPoster`, 'period0', d.resultatEfterFin),
    money(`${G}:ResultatEfterFinansiellaPoster`, 'period1', dp.resultatEfterFin),
    hist[y2]?.resultatEfterFin != null ? money(`${G}:ResultatEfterFinansiellaPoster`, 'period2', hist[y2].resultatEfterFin) : '',
    hist[y3]?.resultatEfterFin != null ? money(`${G}:ResultatEfterFinansiellaPoster`, 'period3', hist[y3].resultatEfterFin) : '',
  ];
  const flerSol = [
    soliditetCell('balans0', d.soliditet),
    soliditetCell('balans1', dp.soliditet),
    hist[y2]?.soliditet != null ? soliditetCell('balans2', hist[y2].soliditet) : '',
    hist[y3]?.soliditet != null ? soliditetCell('balans3', hist[y3].soliditet) : '',
  ];

  // EK-förändringar rows (skip zero rows except IB/UB/årets resultat)
  const tillskott = cur.ek.erhallnaAktieagartillskott || 0;
  const utdelning = cur.ek.utdelning || 0;
  const ekTotIB = prev.br.aktiekapital + dp.balanseratUtgaende + dp.aretsResultat;
  const ekTotUB = d.egetKapital;

  let ekRows = '';
  ekRows += `<tr><td>Belopp vid årets ingång</td>
      <td class="num">${money(`${G}:Aktiekapital`, 'balans1', prev.br.aktiekapital)}</td>
      <td class="num">${money(`${G}:BalanseratResultat`, 'balans1', cur.ek.balanseratResultatIngaende)}</td>
      <td class="num">${money(`${G}:AretsResultatEgetKapital`, 'balans1', cur.ek.aretsResultatForegaende)}</td>
      <td class="num">${money(`${G}:ForandringEgetKapitalTotalt`, 'balans1', ekTotIB)}</td></tr>\n`;
  ekRows += `<tr><td>Balanseras i ny räkning</td>
      <td class="num"></td>
      <td class="num">${money(`${G}:ForandringEgetKapitalBalanseratResultatBalanserasNyRakning`, 'period0', cur.ek.aretsResultatForegaende)}</td>
      <td class="num">${money(`${G}:ForandringEgetKapitalAretsResultatBalanserasNyRakning`, 'period0', -cur.ek.aretsResultatForegaende)}</td>
      <td class="num"></td></tr>\n`;
  if (tillskott !== 0) {
    ekRows += `<tr><td>Erhållet aktieägartillskott</td>
      <td class="num"></td>
      <td class="num">${money(`${G}:ForandringEgetKapitalBalanseratResultatErhallnaAktieagartillskott`, 'period0', tillskott)}</td>
      <td class="num"></td>
      <td class="num">${money(`${G}:ForandringEgetKapitalTotaltErhallnaAktieagartillskott`, 'period0', tillskott)}</td></tr>\n`;
  }
  if (utdelning !== 0) {
    ekRows += `<tr><td>Utdelning</td>
      <td class="num"></td>
      <td class="num">${money(`${G}:ForandringEgetKapitalBalanseratResultatUtdelning`, 'period0', -utdelning)}</td>
      <td class="num"></td>
      <td class="num">${money(`${G}:ForandringEgetKapitalTotaltUtdelning`, 'period0', -utdelning)}</td></tr>\n`;
  }
  ekRows += `<tr><td>Årets resultat</td>
      <td class="num"></td>
      <td class="num"></td>
      <td class="num">${money(`${G}:ForandringEgetKapitalAretsResultatAretsResultat`, 'period0', d.aretsResultat)}</td>
      <td class="num">${money(`${G}:ForandringEgetKapitalTotaltAretsResultat`, 'period0', d.aretsResultat)}</td></tr>\n`;
  ekRows += `<tr class="rule"><td><strong>Belopp vid årets utgång</strong></td>
      <td class="num">${money(`${G}:Aktiekapital`, 'balans0', cur.br.aktiekapital, { bold: true })}</td>
      <td class="num">${money(`${G}:BalanseratResultat`, 'balans0', d.balanseratUtgaende, { bold: true })}</td>
      <td class="num">${money(`${G}:AretsResultatEgetKapital`, 'balans0', d.aretsResultat, { bold: true })}</td>
      <td class="num">${money(`${G}:ForandringEgetKapitalTotalt`, 'balans0', ekTotUB, { bold: true })}</td></tr>\n`;

  // Noter — optional free-text notes
  let extraNotes = '';
  let noteNo = 3;
  if (texts.ovrigaUpplysningar) {
    extraNotes += `<h3>Not ${noteNo++} Övriga upplysningar</h3>
  <p><ix:nonNumeric name="se-gen-base:NotAndraOvrigaUpplysningar" contextRef="period0">${esc(texts.ovrigaUpplysningar)}</ix:nonNumeric></p>\n`;
  }
  if (texts.handelserEfterAret) {
    extraNotes += `<h3>Not ${noteNo++} Väsentliga händelser efter räkenskapsårets slut</h3>
  <p><ix:nonNumeric name="se-gen-base:NotVasentligaHandelserRakenskapsaretsSlut" contextRef="period0">${esc(texts.handelserEfterAret)}</ix:nonNumeric></p>\n`;
  }
  const vasentligaFb = texts.vasentligaHandelser
    ? `<h3>Väsentliga händelser under räkenskapsåret</h3>
  <p><ix:nonNumeric name="se-gen-base:VasentligaHandelserRakenskapsaret" contextRef="period0">${esc(texts.vasentligaHandelser)}</ix:nonNumeric></p>`
    : '';

  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
        xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
        xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2010-04-20"
        xmlns:xlink="http://www.w3.org/1999/xlink"
        xmlns:link="http://www.xbrl.org/2003/linkbase"
        xmlns:xbrli="http://www.xbrl.org/2003/instance"
        xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"
        xmlns:se-gen-base="http://www.taxonomier.se/se/fr/gen-base/2021-10-31"
        xmlns:se-cd-base="http://www.taxonomier.se/se/fr/cd-base/2021-10-31"
        xmlns:se-bol-base="http://www.bolagsverket.se/se/fr/comp-base/2020-12-01"
        xmlns:se-k2-type="http://www.taxonomier.se/se/fr/k2/datatype"
        xmlns:se-mem-base="http://www.taxonomier.se/se/fr/mem-base/2021-10-31"
        xmlns:se-gaap-ext="http://www.taxonomier.se/se/fr/gaap/gaap-ext/2021-10-31">
<head>
  <title>${esc(company.orgnr)} ${esc(company.name)} - Årsredovisning ${y0}</title>
  <meta name="programvara" content="PullUp Årsredovisning"/>
  <meta name="programversion" content="1.0.0"/>
  <style type="text/css">
    body { font-family: Georgia, "Times New Roman", serif; font-size: 12px; line-height: 1.5; color: #111; max-width: 720px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 20px; text-align: center; }
    h2 { font-size: 15px; margin: 2em 0 0.4em; }
    h3 { font-size: 13px; margin: 1.2em 0 0.3em; }
    .center { text-align: center; }
    .cover { margin-top: 90px; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0 18px; }
    td, th { padding: 2px 4px; vertical-align: bottom; text-align: left; }
    td.num, th.num { text-align: right; white-space: nowrap; width: 110px; }
    tr.rule td { border-top: 1px solid #111; }
    .ar-page { page-break-after: always; border-bottom: 1px dashed #bbb; padding-bottom: 24px; margin-bottom: 24px; }
    .belopp { text-align: right; font-size: 11px; font-weight: bold; }
  </style>
</head>
<body>
<div style="display:none">
  <ix:header>
    <ix:hidden>
      <ix:nonNumeric name="se-cd-base:SprakHandlingUpprattadList" contextRef="period0">se-mem-base:SprakSvenskaMember</ix:nonNumeric>
      <ix:nonNumeric name="se-cd-base:LandForetagetsSateList" contextRef="period0">se-mem-base:LandSverigeMember</ix:nonNumeric>
      <ix:nonNumeric name="se-cd-base:RedovisningsvalutaHandlingList" contextRef="period0">se-mem-base:ValutaSvenskaKronorMember</ix:nonNumeric>
      <ix:nonNumeric name="se-cd-base:BeloppsformatList" contextRef="period0">se-mem-base:BeloppsformatNormalformMember</ix:nonNumeric>
      <ix:nonNumeric name="se-gen-base:FinansiellRapportList" contextRef="period0">se-mem-base:FinansiellRapportStyrelsenAvgerArsredovisningMember</ix:nonNumeric>
      <ix:nonNumeric name="se-cd-base:RakenskapsarForstaDag" contextRef="period0">${fiscalYear.start}</ix:nonNumeric>
      <ix:nonNumeric name="se-cd-base:RakenskapsarSistaDag" contextRef="period0">${fiscalYear.end}</ix:nonNumeric>
    </ix:hidden>
    <ix:references>
      <link:schemaRef xlink:type="simple" xlink:href="http://xbrl.taxonomier.se/se/fr/gaap/k2/risbs/2021-10-31/se-k2-risbs-2021-10-31.xsd" />
      <link:schemaRef xlink:type="simple" xlink:href="http://xbrl.taxonomier.se/se/fr/gaap/coa/rplc/2020-12-01/se-coa-rplc-2020-12-01.xsd"/>
    </ix:references>
    <ix:resources>${contexts}
      <xbrli:unit id="SEK"><xbrli:measure>iso4217:SEK</xbrli:measure></xbrli:unit>
      <xbrli:unit id="procent"><xbrli:measure>xbrli:pure</xbrli:measure></xbrli:unit>
      <xbrli:unit id="antal-anstallda"><xbrli:measure>se-k2-type:AntalAnstallda</xbrli:measure></xbrli:unit>
    </ix:resources>
  </ix:header>
</div>

<div class="ar-page">
  <div class="cover center">
    <p>Årsredovisning för</p>
    <h1><ix:nonNumeric name="se-cd-base:ForetagetsNamn" contextRef="period0">${esc(company.name)}</ix:nonNumeric><br/>
    <ix:nonNumeric name="se-cd-base:Organisationsnummer" contextRef="period0">${esc(company.orgnr)}</ix:nonNumeric></h1>
    <p>Räkenskapsåret<br/><strong>${fiscalYear.start} &#8211; ${fiscalYear.end}</strong></p>
  </div>
  <div style="margin-top:60px">
    <h3><strong>Fastställelseintyg</strong></h3>
    <p><ix:nonNumeric name="se-bol-base:FaststallelseResultatBalansrakning" contextRef="balans0">${INTYG_FASTSTALLELSE_RR_BR}</ix:nonNumeric> <ix:nonNumeric name="se-bol-base:Arsstamma" contextRef="balans0">${stamma.date}</ix:nonNumeric>.<br/>
    <ix:nonNumeric name="se-bol-base:ArsstammaResultatDispositionGodkannaStyrelsensForslag" contextRef="balans0">${INTYG_DISPOSITION[dispositionType]}</ix:nonNumeric></p>
    <p><ix:nonNumeric name="se-bol-base:IntygandeOriginalInnehall" contextRef="balans0">${INTYG_ORIGINAL}</ix:nonNumeric></p>
    <p><strong><ix:nonNumeric name="se-bol-base:UnderskriftFaststallelseintygElektroniskt" contextRef="balans0">${INTYG_ELEKTRONISKT}</ix:nonNumeric>:</strong><br/>
    <ix:nonNumeric name="se-bol-base:UnderskriftFaststallelseintygForetradareTilltalsnamn" contextRef="period0">${esc(signature.firstName)}</ix:nonNumeric>
    <ix:nonNumeric name="se-bol-base:UnderskriftFaststallelseintygForetradareEfternamn" contextRef="period0">${esc(signature.lastName)}</ix:nonNumeric>,
    <ix:nonNumeric name="se-bol-base:UnderskriftFaststallelseintygForetradareForetradarroll" contextRef="period0">${esc(signature.role)}</ix:nonNumeric><br/>
    <ix:nonNumeric name="se-bol-base:UnderskriftFastallelseintygDatum" contextRef="balans0" id="ID_DATUM_UNDERTECKNANDE_FASTSTALLELSEINTYG">${stamma.intygDate || stamma.date}</ix:nonNumeric></p>
  </div>
</div>

<div class="ar-page">
  <h2>Förvaltningsberättelse</h2>
  <p>Styrelsen för ${esc(company.name)}, ${esc(company.orgnr)}, avger följande årsredovisning för räkenskapsåret ${fiscalYear.start} &#8211; ${fiscalYear.end}.</p>
  <h3>Allmänt om verksamheten</h3>
  <p><ix:nonNumeric name="se-gen-base:AllmantVerksamheten" contextRef="period0">${esc(texts.verksamheten)}</ix:nonNumeric></p>
  ${vasentligaFb}
  <h3>Flerårsöversikt</h3>
  <div class="belopp">Belopp i kr</div>
  <table>
    <tr><th></th><th class="num">${y0}</th><th class="num">${y1}</th><th class="num">${y2}</th><th class="num">${y3}</th></tr>
    <tr><td>Nettoomsättning</td>${flerNetto.map((c) => `<td class="num">${c}</td>`).join('')}</tr>
    <tr><td>Resultat efter finansiella poster</td>${flerRes.map((c) => `<td class="num">${c}</td>`).join('')}</tr>
    <tr><td>Soliditet %</td>${flerSol.map((c) => `<td class="num">${c}</td>`).join('')}</tr>
  </table>
  <h3>Förändringar i eget kapital</h3>
  <table>
    <tr><th></th><th class="num">Aktiekapital</th><th class="num">Balanserat resultat</th><th class="num">Årets resultat</th><th class="num">Totalt</th></tr>
    ${ekRows}
  </table>
  <h3>Resultatdisposition</h3>
  <p>Till årsstämmans förfogande står följande medel:</p>
  <table>
    <tr><td>Balanserat resultat</td><td class="num">${money(`${G}:BalanseratResultat`, 'balans0', d.balanseratUtgaende)}</td></tr>
    <tr><td>Årets resultat</td><td class="num">${money(`${G}:AretsResultatEgetKapital`, 'balans0', d.aretsResultat)}</td></tr>
    <tr class="rule"><td><strong>Summa</strong></td><td class="num">${money(`${G}:ForslagDisposition`, 'balans0', d.frittEgetKapital, { bold: true })}</td></tr>
  </table>
  <p>Styrelsen föreslår att medlen disponeras enligt följande:</p>
  <table>
    <tr><td>Balanseras i ny räkning</td><td class="num">${money(`${G}:ForslagDispositionBalanserasINyRakning`, 'balans0', d.frittEgetKapital - utdelning)}</td></tr>${
      utdelning !== 0
        ? `\n    <tr><td>Utdelning</td><td class="num">${money(`${G}:ForslagDispositionUtdelning`, 'balans0', utdelning)}</td></tr>`
        : ''
    }
  </table>
</div>

<div class="ar-page">
  <h2>Resultaträkning</h2>
  <div class="belopp">Belopp i kr</div>
  <table>
    <tr><th></th><th class="num">${fiscalYear.start}-<br/>${fiscalYear.end}</th><th class="num">${prevStart}-<br/>${prevEnd}</th></tr>
    ${heading('Rörelseintäkter, lagerförändringar m.m.')}${rrRow('Nettoomsättning', 'Nettoomsattning', cur.rr.nettoomsattning, prev.rr.nettoomsattning)}${rrRow('Övriga rörelseintäkter', 'OvrigaRorelseintakter', cur.rr.ovrigaRorelseintakter || 0, prev.rr.ovrigaRorelseintakter || 0)}${rrRow('Summa rörelseintäkter, lagerförändringar m.m.', 'RorelseintakterLagerforandringarMm', d.sumIntakter, dp.sumIntakter, { bold: true })}${heading('Rörelsekostnader')}${rrRow('Personalkostnader', 'Personalkostnader', cur.rr.personalkostnader, prev.rr.personalkostnader, { debit: true })}${rrRow('Övriga externa kostnader', 'OvrigaExternaKostnader', cur.rr.ovrigaExternaKostnader, prev.rr.ovrigaExternaKostnader, { debit: true })}${rrRow('Av- och nedskrivningar av materiella och immateriella anläggningstillgångar', 'AvskrivningarNedskrivningarMateriellaImmateriellaAnlaggningstillgangar', cur.rr.avskrivningar, prev.rr.avskrivningar, { debit: true })}${rrRow('Summa rörelsekostnader', 'Rorelsekostnader', -d.sumKostnader, -dp.sumKostnader, { debit: true })}${rrRow('Rörelseresultat', 'Rorelseresultat', d.rorelseresultat, dp.rorelseresultat, { bold: true })}${heading('Finansiella poster')}${rrRow('Övriga ränteintäkter och liknande resultatposter', 'OvrigaRanteintakterLiknandeResultatposter', cur.rr.ranteintakter || 0, prev.rr.ranteintakter || 0)}${rrRow('Räntekostnader och liknande resultatposter', 'RantekostnaderLiknandeResultatposter', cur.rr.rantekostnader || 0, prev.rr.rantekostnader || 0, { debit: true })}${rrRow('Summa finansiella poster', 'FinansiellaPoster', d.finansiellaPoster, dp.finansiellaPoster, { bold: true })}${rrRow('Resultat efter finansiella poster', 'ResultatEfterFinansiellaPoster', d.resultatEfterFin, dp.resultatEfterFin, { bold: true })}${rrRow('Resultat före skatt', 'ResultatForeSkatt', d.resultatEfterFin, dp.resultatEfterFin, { bold: true })}${rrRow('Årets resultat', 'AretsResultat', d.aretsResultat, dp.aretsResultat, { bold: true })}
  </table>
</div>

<div class="ar-page">
  <h2>Balansräkning</h2>
  <div class="belopp">Belopp i kr</div>
  <table>
    <tr><th></th><th class="num">${fiscalYear.end}</th><th class="num">${prevEnd}</th></tr>
    ${heading('TILLGÅNGAR')}${heading('Anläggningstillgångar')}${heading('Materiella anläggningstillgångar')}${brRow('Inventarier, verktyg och installationer', 'InventarierVerktygInstallationer', cur.br.inventarier, prev.br.inventarier)}${brRow('Summa materiella anläggningstillgångar', 'MateriellaAnlaggningstillgangar', d.materiellaAnl, dp.materiellaAnl, { bold: true })}${brRow('Summa anläggningstillgångar', 'Anlaggningstillgangar', d.anlaggningstillgangar, dp.anlaggningstillgangar, { bold: true })}${heading('Omsättningstillgångar')}${heading('Kortfristiga fordringar')}${brRow('Övriga fordringar', 'OvrigaFordringarKortfristiga', cur.br.ovrigaFordringar, prev.br.ovrigaFordringar)}${brRow('Summa kortfristiga fordringar', 'KortfristigaFordringar', d.kortfristigaFordringar, dp.kortfristigaFordringar, { bold: true })}${brRow('Kassa och bank', 'KassaBankExklRedovisningsmedel', cur.br.kassaBank, prev.br.kassaBank)}${brRow('Summa kassa och bank', 'KassaBank', cur.br.kassaBank, prev.br.kassaBank, { bold: true })}${brRow('Summa omsättningstillgångar', 'Omsattningstillgangar', d.omsattningstillgangar, dp.omsattningstillgangar, { bold: true })}${brRow('SUMMA TILLGÅNGAR', 'Tillgangar', d.tillgangar, dp.tillgangar, { bold: true })}
  </table>
</div>

<div class="ar-page">
  <h2>Balansräkning</h2>
  <div class="belopp">Belopp i kr</div>
  <table>
    <tr><th></th><th class="num">${fiscalYear.end}</th><th class="num">${prevEnd}</th></tr>
    ${heading('EGET KAPITAL OCH SKULDER')}${heading('Bundet eget kapital')}${brRow('Aktiekapital', 'Aktiekapital', cur.br.aktiekapital, prev.br.aktiekapital)}${brRow('Summa bundet eget kapital', 'BundetEgetKapital', cur.br.aktiekapital, prev.br.aktiekapital, { bold: true })}${heading('Fritt eget kapital')}${brRow('Balanserat resultat', 'BalanseratResultat', d.balanseratUtgaende, cur.ek.balanseratResultatIngaende)}${brRow('Årets resultat', 'AretsResultatEgetKapital', d.aretsResultat, cur.ek.aretsResultatForegaende)}${brRow('Summa fritt eget kapital', 'FrittEgetKapital', d.frittEgetKapital, dp.frittEgetKapital, { bold: true })}${brRow('Summa eget kapital', 'EgetKapital', d.egetKapital, dp.egetKapital, { bold: true })}${heading('Långfristiga skulder')}${brRow('Övriga långfristiga skulder', 'OvrigaLangfristigaSkulder', cur.br.ovrigaLangfristigaSkulder, prev.br.ovrigaLangfristigaSkulder)}${brRow('Summa långfristiga skulder', 'LangfristigaSkulder', d.langfristigaSkulder, dp.langfristigaSkulder, { bold: true })}${heading('Kortfristiga skulder')}${brRow('Övriga kortfristiga skulder', 'OvrigaKortfristigaSkulder', cur.br.ovrigaKortfristigaSkulder, prev.br.ovrigaKortfristigaSkulder)}${brRow('Summa kortfristiga skulder', 'KortfristigaSkulder', d.kortfristigaSkulder, dp.kortfristigaSkulder, { bold: true })}${brRow('SUMMA EGET KAPITAL OCH SKULDER', 'EgetKapitalSkulder', d.egetKapitalSkulder, dp.egetKapitalSkulder, { bold: true })}
  </table>
</div>

<div class="ar-page">
  <h2>Noter</h2>
  <p class="belopp" style="text-align:left">Belopp i kr om inget annat anges.</p>
  <h3>Not 1 Redovisningsprinciper</h3>
  <p><ix:nonNumeric name="se-gen-base:RedovisningsVarderingsprinciper" contextRef="period0">Årsredovisningen är upprättad i enlighet med årsredovisningslagen och Bokföringsnämndens allmänna råd (BFNAR 2016:10) om årsredovisning i mindre företag.</ix:nonNumeric></p>
  <h3>Not 2 Medelantal anställda</h3>
  <table>
    <tr><th></th><th class="num">${y0}</th><th class="num">${y1}</th></tr>
    <tr><td>Medelantalet anställda under räkenskapsåret</td>
      <td class="num"><ix:nonFraction contextRef="period0" name="se-gen-base:MedelantaletAnstallda" unitRef="antal-anstallda" decimals="INF" scale="0">${cur.medelantalAnstallda ?? 0}</ix:nonFraction></td>
      <td class="num"><ix:nonFraction contextRef="period1" name="se-gen-base:MedelantaletAnstallda" unitRef="antal-anstallda" decimals="INF" scale="0">${prev.medelantalAnstallda ?? 0}</ix:nonFraction></td></tr>
  </table>
  ${extraNotes}
</div>

<div>
  <h2>Underskrifter</h2>
  <p><ix:nonNumeric name="se-gen-base:UndertecknandeArsredovisningOrt" contextRef="period0">${esc(signature.city)}</ix:nonNumeric>
  <ix:nonNumeric name="se-gen-base:UndertecknandeArsredovisningDatum" contextRef="period0">${signature.date}</ix:nonNumeric></p>
  <ix:tuple name="se-gaap-ext:UnderskriftArsredovisningForetradareTuple" tupleID="UnderskriftForetradare1" />
  <div style="margin-top:48px">
    <p style="border-top:1px solid #111; width:260px; padding-top:4px">
    <ix:nonNumeric name="se-gen-base:UnderskriftHandlingTilltalsnamn" contextRef="period0" order="1.0" tupleRef="UnderskriftForetradare1">${esc(signature.firstName)}</ix:nonNumeric>
    <ix:nonNumeric name="se-gen-base:UnderskriftHandlingEfternamn" contextRef="period0" order="2.0" tupleRef="UnderskriftForetradare1">${esc(signature.lastName)}</ix:nonNumeric><br/>
    <ix:nonNumeric name="se-gen-base:UnderskriftHandlingRoll" contextRef="period0" order="3.0" tupleRef="UnderskriftForetradare1">${esc(signature.role)}</ix:nonNumeric></p>
  </div>
</div>

</body>
</html>
`;

  return { xhtml, derived: { current: d, previous: dp }, dispositionType };
}


