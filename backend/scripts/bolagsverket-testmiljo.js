#!/usr/bin/env node
// BOLAGSVERKET TESTMILJÖ RUNNER — the harness that passes Bolagsverket's
// anslutningstest. Run the day the klientcertifikat arrives:
//
//   BOLAGSVERKET_API_ENABLED=true \
//   BOLAGSVERKET_CERT_PATH=./certs/kaijas-test.crt \
//   BOLAGSVERKET_KEY_PATH=./certs/kaijas-test.key \
//   node scripts/bolagsverket-testmiljo.js --orgnr 5565896866 --pnr 190001010106
//
// Bolagsverket's testmiljö (api-accept2) ships with test companies and test
// persons (listed in the anslutningsanvisning that accompanies the avtal).
// This script runs the complete supplier-approval sequence against one:
//
//   1. grunduppgifter  — register data for the test company
//   2. arendestatus    — current annual-report case status
//   3. skapa token     — submission token + avtalstext
//   4. kontrollera     — Bolagsverket's own checks on OUR generated iXBRL
//   5. lämna in        — file into eget utrymme (add --submit to run this step)
//
// The iXBRL document is generated live by services/arsredovisning.js from
// the built-in fixture, re-targeted at the test company's orgnr — so a green
// run here is Bolagsverket's own systems approving our generator end-to-end.
import { generate } from "../src/services/arsredovisning.js";
import * as bv from "../src/services/bolagsverketClient.js";

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1] ?? true] : null)).filter(Boolean)
);

if (!bv.isConfigured()) {
  console.error("Saknar konfiguration. Sätt BOLAGSVERKET_API_ENABLED=true + BOLAGSVERKET_CERT_PATH/KEY_PATH (eller PFX_PATH).");
  console.error("Certifikatet får vi med Bolagsverkets avtal — se anslutningsanvisningen.");
  process.exit(1);
}
if (!args.orgnr || !args.pnr) {
  console.error("Användning: node scripts/bolagsverket-testmiljo.js --orgnr <testbolag> --pnr <testperson> [--year 2025] [--submit]");
  process.exit(1);
}

const year = Number(args.year || 2025);
const orgnrDashed = `${String(args.orgnr).slice(0, 6)}-${String(args.orgnr).slice(6)}`;

// Fixture: a complete, internally consistent K2 year, re-targeted at the
// test company. Amounts mirror the Arelle-validated reference filing.
const fixture = {
  company: { name: "Testbolag via PullUp", orgnr: orgnrDashed },
  fiscalYear: { start: `${year}-01-01`, end: `${year}-12-31` },
  stamma: { date: `${year + 1}-06-15` },
  signature: { firstName: "Test", lastName: "Person", role: "Verkställande direktör", city: "Stockholm", date: `${year + 1}-06-15` },
  texts: {
    verksamheten: "Bolaget bedriver konsultverksamhet inom programvaruutveckling.",
    vasentligaHandelser: "Inga väsentliga händelser utöver ordinarie verksamhet.",
  },
  currentYear: {
    rr: { nettoomsattning: 500000, ovrigaRorelseintakter: 0, personalkostnader: 200000, ovrigaExternaKostnader: 150000, avskrivningar: 0, ranteintakter: 0, rantekostnader: 0 },
    br: { inventarier: 0, ovrigaFordringar: 50000, kassaBank: 235000, aktiekapital: 25000, ovrigaLangfristigaSkulder: 0, ovrigaKortfristigaSkulder: 100000 },
    ek: { balanseratResultatIngaende: 10000, aretsResultatForegaende: 0, erhallnaAktieagartillskott: 0, utdelning: 0 },
    medelantalAnstallda: 1,
  },
  previousYear: {
    rr: { nettoomsattning: 300000, ovrigaRorelseintakter: 0, personalkostnader: 180000, ovrigaExternaKostnader: 120000, avskrivningar: 0, ranteintakter: 0, rantekostnader: 0 },
    br: { inventarier: 0, ovrigaFordringar: 30000, kassaBank: 55000, aktiekapital: 25000, ovrigaLangfristigaSkulder: 0, ovrigaKortfristigaSkulder: 50000 },
    ek: { balanseratResultatIngaende: 10000, aretsResultatForegaende: 0, erhallnaAktieagartillskott: 0, utdelning: 0 },
    medelantalAnstallda: 1,
  },
  history: [],
};

const step = (n, label) => console.log(`\n── ${n}. ${label} ${"─".repeat(Math.max(1, 50 - label.length))}`);

try {
  step(0, "Genererar iXBRL lokalt");
  const { xhtml, derived } = generate(fixture);
  console.log(`   ${xhtml.length} bytes, resultat ${derived.current.aretsResultat} kr, balansomslutning ${derived.current.tillgangar} kr`);

  step(1, `grunduppgifter ${args.orgnr}`);
  const gu = await bv.grunduppgifter(args.orgnr);
  console.log(`   namn: ${gu.namn}`);
  console.log(`   perioder: ${(gu.rakenskapsperioder || []).map((p) => `${p.from}–${p.tom}`).join(", ")}`);
  console.log(`   företrädare: ${(gu.foretradare || []).map((f) => `${f.fornamn} ${f.namn} (${(f.funktioner || []).map((x) => x.kod).join("/")})`).join("; ")}`);

  step(2, `arendestatus ${args.orgnr}`);
  const st = await bv.arendestatus(args.orgnr);
  console.log(`   typ: ${st.typ || "(inget ärende)"} ärende: ${st.arendenummer || "-"}`);

  step(3, "skapa inlämningtoken");
  const { token, avtalstext } = await bv.skapaInlamningToken({ pnr: args.pnr, orgnr: args.orgnr });
  console.log(`   token: ${token}`);
  console.log(`   avtalstext: ${String(avtalstext).slice(0, 80)}…`);

  step(4, "kontrollera — Bolagsverkets egna kontroller på vår fil");
  const kontroll = await bv.kontrollera({ token, xhtml });
  const utfall = kontroll.utfall || [];
  if (utfall.length === 0) console.log("   ✅ INGA ANMÄRKNINGAR — filen passerar Bolagsverkets kontroller");
  for (const u of utfall) console.log(`   [${u.typ}] ${u.kod}: ${u.text}`);

  if (args.submit) {
    step(5, "lämna in till eget utrymme");
    const res = await bv.lamnaIn({ token, xhtml, undertecknarePnr: args.pnr });
    console.log(`   idnummer: ${res.handlingsinfo?.idnummer}`);
    console.log(`   sha256:   ${res.handlingsinfo?.sha256checksumma}`);
    console.log(`   signeringsurl (BankID hos Bolagsverket): ${res.url}`);
  } else {
    console.log("\n(kör med --submit för att även lämna in till eget utrymme)");
  }
  console.log("\n✅ Testmiljö-sekvensen klar");
} catch (e) {
  console.error(`\n❌ ${e.message}`);
  if (e.body) console.error(JSON.stringify(e.body, null, 2));
  if (e.utfall) console.error(JSON.stringify(e.utfall, null, 2));
  process.exit(1);
}
