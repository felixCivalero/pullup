// Tests for services/arsredovisning.js — the iXBRL annual-report generator.
// Golden fixture: Kaijas Collective AB FY2025, whose generated document was
// validated with Arelle against the live K2 2021-10-31 taxonomy (zero
// errors). These tests pin the derivations, the refuse-on-imbalance
// behavior, and the taxonomy-critical invariants (fixed enum strings,
// tagged facts, sign handling) so the generator can't drift invalid.
import { generate, validate, derive } from "../src/services/arsredovisning.js";

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures += 1;
  }
}

// ---- Golden fixture: Kaijas Collective AB FY2025 (Arelle-validated output)
const kaijas = {
  company: { name: "Kaijas Collective AB", orgnr: "556743-5986" },
  fiscalYear: { start: "2025-01-01", end: "2025-12-31" },
  stamma: { date: "2026-07-24" },
  signature: {
    firstName: "Felix",
    lastName: "Civalero Stolpe",
    role: "Verkställande direktör",
    city: "Stockholm",
    date: "2026-07-24",
  },
  texts: {
    verksamheten: "Företaget bedriver verksamhet inom programmering.",
    vasentligaHandelser: "Aktieägaren tillförde 65 000 kr, varav 22 027 kr som ovillkorat aktieägartillskott.",
    ovrigaUpplysningar: "Nettomomsfordran per 2025-12-31 uppgår till 2 845 kr.",
    handelserEfterAret: "Styrelsen har upprättat kontrollbalansräkning.",
  },
  currentYear: {
    rr: { nettoomsattning: 17800, ovrigaRorelseintakter: 16115, personalkostnader: 0, ovrigaExternaKostnader: 68173, avskrivningar: 0, ranteintakter: 77, rantekostnader: 3912 },
    br: { inventarier: 0, ovrigaFordringar: 21805, kassaBank: 2641, aktiekapital: 100000, ovrigaLangfristigaSkulder: 9714, ovrigaKortfristigaSkulder: 0 },
    ek: { balanseratResultatIngaende: -24016, aretsResultatForegaende: -45186, erhallnaAktieagartillskott: 22027, utdelning: 0 },
    medelantalAnstallda: 0,
  },
  previousYear: {
    rr: { nettoomsattning: 235170, ovrigaRorelseintakter: 0, personalkostnader: 108507, ovrigaExternaKostnader: 171849, avskrivningar: 0, ranteintakter: 0, rantekostnader: 0 },
    br: { inventarier: 0, ovrigaFordringar: 46203, kassaBank: 80016, aktiekapital: 100000, ovrigaLangfristigaSkulder: 9714, ovrigaKortfristigaSkulder: 85707 },
    ek: { balanseratResultatIngaende: -31323, aretsResultatForegaende: -9693, erhallnaAktieagartillskott: 17000, utdelning: 0 },
    medelantalAnstallda: 1,
  },
  history: [
    { year: "2023", nettoomsattning: 61648, resultatEfterFin: -9693, soliditet: 85.9 },
    { year: "2022", resultatEfterFin: -38522, soliditet: 100 },
  ],
};

console.log("derive(): sums from atomic inputs");
{
  const d = derive(kaijas.currentYear);
  assert(d.aretsResultat === -38093, `årets resultat = −38 093 (got ${d.aretsResultat})`);
  assert(d.rorelseresultat === -34258, `rörelseresultat = −34 258 (got ${d.rorelseresultat})`);
  assert(d.balanseratUtgaende === -47175, `balanserat UB = −47 175 (got ${d.balanseratUtgaende})`);
  assert(d.egetKapital === 14732, `eget kapital = 14 732 (got ${d.egetKapital})`);
  assert(d.tillgangar === 24446, `tillgångar = 24 446 (got ${d.tillgangar})`);
  assert(d.tillgangar === d.egetKapitalSkulder, "balansidentitet håller");
  assert(d.soliditet === 60.3, `soliditet = 60,3 (got ${d.soliditet})`);
  const dp = derive(kaijas.previousYear);
  assert(dp.aretsResultat === -45186, `föregående års resultat = −45 186 (got ${dp.aretsResultat})`);
  assert(dp.balanseratUtgaende === -24016, "kontinuitet: 2024 UB balanserat = 2025 IB");
}

console.log("validate(): refuses what must be refused");
{
  assert(validate(kaijas).length === 0, "golden fixture validates clean");

  const broken = structuredClone(kaijas);
  broken.currentYear.br.kassaBank += 51496; // the classic hole
  const errs = validate(broken);
  assert(errs.some((e) => e.includes("balanserar inte")), "imbalance is refused with Swedish error");
  assert(errs.some((e) => e.includes("51 496")), "error names the exact gap");

  const badOrg = structuredClone(kaijas);
  badOrg.company.orgnr = "5567435986";
  assert(validate(badOrg).some((e) => e.includes("Organisationsnummer")), "orgnr format enforced");

  const badCont = structuredClone(kaijas);
  badCont.currentYear.ek.balanseratResultatIngaende = -20000;
  assert(validate(badCont).some((e) => e.includes("matchar inte föregående års")), "opening-balance continuity enforced");
}

console.log("generate(): taxonomy-critical invariants");
{
  const { xhtml, dispositionType } = generate(kaijas);
  assert(dispositionType === "forlust", "negative fritt EK → förlust disposition");
  assert(
    xhtml.includes("Årsstämman beslöt att godkänna styrelsens förslag till behandling av ansamlad förlust."),
    "exact taxonomy enum string for förlust disposition"
  );
  assert(
    xhtml.includes("Jag intygar att resultaträkningen och balansräkningen har fastställts på årsstämma"),
    "exact taxonomy enum string for fastställelseintyg"
  );
  assert(xhtml.includes('name="se-gen-base:AretsResultat"') && xhtml.includes('sign="-"'), "loss facts carry sign attribute");
  assert(xhtml.includes(">38 093<"), "loss displayed as unsigned digits inside fact tag");
  assert(xhtml.includes('name="se-gen-base:ForandringEgetKapitalBalanseratResultatErhallnaAktieagartillskott"'), "tillskott row tagged");
  assert(xhtml.includes('name="se-gen-base:NotVasentligaHandelserRakenskapsaretsSlut"'), "händelser-efter-året note tagged");
  assert(xhtml.includes('se-k2-risbs-2021-10-31.xsd'), "schemaRef points at K2 entry point");
  assert(xhtml.includes('<xbrli:instant>2025-12-31</xbrli:instant>'), "balans0 context on fiscal year end");
  assert(!xhtml.includes("undefined") && !xhtml.includes("NaN"), "no leaked undefined/NaN");
  // XML sanity: every ix:nonFraction opened is closed
  const opens = (xhtml.match(/<ix:nonFraction /g) || []).length;
  const closes = (xhtml.match(/<\/ix:nonFraction>/g) || []).length;
  assert(opens === closes && opens > 50, `nonFraction facts balanced (${opens} facts)`);
}

console.log("generate(): profit path picks vinst enum");
{
  const profit = structuredClone(kaijas);
  profit.currentYear.rr.nettoomsattning = 300000; // big year
  // rebalance: profit lands in kassa
  const d0 = derive(profit.currentYear);
  profit.currentYear.br.kassaBank += d0.egetKapitalSkulder - d0.tillgangar;
  const { dispositionType, xhtml } = generate(profit);
  assert(dispositionType === "vinst", "positive fritt EK → vinstdisposition");
  assert(xhtml.includes("förslag till vinstdisposition."), "exact taxonomy enum string for vinst");
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nAll arsredovisning tests passed");
