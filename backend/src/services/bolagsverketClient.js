// BOLAGSVERKET DIGITAL INLÄMNING CLIENT — the real pipe for filing iXBRL
// årsredovisningar, coded against Bolagsverket's Teknisk guide v3.4
// (api-accept2 = testmiljö). The API only accepts mTLS traffic from
// avtal-holding software, so every call requires the klientcertifikat that
// arrives with PullUp's (Kaijas Collective AB's) supplier agreement.
//
// Flow (guide §4.2/§5.3): skapa-inlamningtoken → (kontrollera) → inlamning.
// "Lämna in" stores the handling in the signatory's EGET UTRYMME and returns
// a URL where they sign the fastställelseintyg with their own BankID on
// Bolagsverket's site — we never touch BankID.
//
// Env:
//   BOLAGSVERKET_API_ENABLED   "true" to allow real calls (routes gate on this)
//   BOLAGSVERKET_API_BASE      default https://api-accept2.bolagsverket.se (testmiljö)
//                              prod: https://api.bolagsverket.se
//   BOLAGSVERKET_CERT_PATH     PEM client certificate (or PFX via BOLAGSVERKET_PFX_PATH)
//   BOLAGSVERKET_KEY_PATH      PEM private key
//   BOLAGSVERKET_PFX_PATH      alternative: PKCS#12 bundle
//   BOLAGSVERKET_PASSPHRASE    key/PFX passphrase if any
import https from "node:https";
import { readFileSync } from "node:fs";

const BASE = () => process.env.BOLAGSVERKET_API_BASE || "https://api-accept2.bolagsverket.se";

// Paths per Teknisk guide v3.4 Appendix C (versions current as of 2025-05-26)
const PATHS = {
  grunduppgifter: (orgnr) => `/hamta-arsredovisningsinformation/v1.4/grunduppgifter/${orgnr}`,
  arendestatus: (orgnr) => `/hamta-arsredovisningsinformation/v1.4/arendestatus/${orgnr}`,
  skapaToken: () => `/lamna-in-arsredovisning/v2.1/skapa-inlamningtoken/`,
  kontrollera: (token) => `/lamna-in-arsredovisning/v2.1/kontrollera/${token}`,
  lamnaIn: (token) => `/lamna-in-arsredovisning/v2.1/inlamning/${token}`,
};

export function isConfigured() {
  return (
    process.env.BOLAGSVERKET_API_ENABLED === "true" &&
    Boolean(process.env.BOLAGSVERKET_PFX_PATH || (process.env.BOLAGSVERKET_CERT_PATH && process.env.BOLAGSVERKET_KEY_PATH))
  );
}

function agent() {
  const opts = { keepAlive: true };
  if (process.env.BOLAGSVERKET_PFX_PATH) {
    opts.pfx = readFileSync(process.env.BOLAGSVERKET_PFX_PATH);
  } else {
    opts.cert = readFileSync(process.env.BOLAGSVERKET_CERT_PATH);
    opts.key = readFileSync(process.env.BOLAGSVERKET_KEY_PATH);
  }
  if (process.env.BOLAGSVERKET_PASSPHRASE) opts.passphrase = process.env.BOLAGSVERKET_PASSPHRASE;
  return new https.Agent(opts);
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE() + path);
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        method,
        hostname: url.hostname,
        path: url.pathname + url.search,
        agent: agent(),
        headers: {
          Accept: "application/json",
          ...(payload && { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }),
        },
        timeout: 30000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = null;
          try { json = data ? JSON.parse(data) : null; } catch { /* non-JSON error body */ }
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(json);
          const err = new Error(`Bolagsverket ${method} ${path} → ${res.statusCode}`);
          err.statusCode = res.statusCode;
          err.body = json || data;
          reject(err);
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Bolagsverket request timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

const cleanOrgnr = (orgnr) => String(orgnr).replace(/\D/g, ""); // API wants 10 digits, no dash
const cleanPnr = (pnr) => String(pnr).replace(/\D/g, ""); // 12 digits YYYYMMDDNNNN

/** Company base data from Bolagsverket's register — name, statuses,
 * räkenskapsperioder (incl. revisorsplikt), registered företrädare.
 * Use to prefill the form and to verify the signer may sign the intyg. */
export function grunduppgifter(orgnr) {
  return request("GET", PATHS.grunduppgifter(cleanOrgnr(orgnr)));
}

/** Status + ärendenummer for the company's current annual-report case. */
export function arendestatus(orgnr) {
  return request("GET", PATHS.arendestatus(cleanOrgnr(orgnr)));
}

/** Step 1: create the submission token. Returns { token, avtalstext,
 * avtalstextAndrad } — avtalstext MUST be shown to the end user the first
 * time they file for a company (guide §4.2.2). */
export function skapaInlamningToken({ pnr, orgnr }) {
  return request("POST", PATHS.skapaToken(), { pnr: cleanPnr(pnr), orgnr: cleanOrgnr(orgnr) });
}

/** Step 2 (optional but recommended): run Bolagsverket's own checks on the
 * document before filing. Returns { orgnr, utfall: [{kod, text, typ, ...}] }
 * — empty utfall = high likelihood of clean registration. */
export function kontrollera({ token, xhtml, typ = "arsredovisning_komplett" }) {
  return request("POST", PATHS.kontrollera(token), {
    handling: { fil: Buffer.from(xhtml, "utf8").toString("base64"), typ },
  });
}

/** Step 3: file into the signatory's eget utrymme. Returns handlingsinfo +
 * the URL where `undertecknare` signs with BankID. */
export function lamnaIn({ token, xhtml, undertecknarePnr, epost = [], kvittensEpost = [], typ = "arsredovisning_komplett" }) {
  return request("POST", PATHS.lamnaIn(token), {
    undertecknare: cleanPnr(undertecknarePnr),
    epostadresser: epost,
    kvittensepostadresser: kvittensEpost.length ? kvittensEpost : epost,
    notifieringEpostadresser: epost,
    handling: { fil: Buffer.from(xhtml, "utf8").toString("base64"), typ },
  });
}

/** Full three-step submission. Returns { utfall, egetUtrymmeUrl, idnummer,
 * sha256, avtalstext } — utfall from the kontrollera pass (warnings do not
 * block filing, guide §5.3.2). */
export async function submit({ pnr, orgnr, xhtml, epost = [] }) {
  const { token, avtalstext } = await skapaInlamningToken({ pnr, orgnr });
  const kontroll = await kontrollera({ token, xhtml });
  const blocking = (kontroll.utfall || []).filter((u) => u.typ === "stopp" || u.typ === "error");
  if (blocking.length) {
    const err = new Error("Bolagsverkets kontroll stoppade inlämningen");
    err.utfall = kontroll.utfall;
    throw err;
  }
  const result = await lamnaIn({ token, xhtml, undertecknarePnr: pnr, epost });
  return {
    utfall: kontroll.utfall || [],
    egetUtrymmeUrl: result.url,
    idnummer: result.handlingsinfo?.idnummer,
    sha256: result.handlingsinfo?.sha256checksumma,
    avtalstext,
  };
}
