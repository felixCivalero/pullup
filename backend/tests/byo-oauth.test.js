// Pure-logic tests for the Supabase OAuth handshake: PKCE, the signed/
// tamper-proof state (which carries hostId + verifier through the session-less
// callback), and the authorize-URL construction. The browser consent + live
// token exchange can't be unit-tested (they need a human click); those are
// proven by the interactive run.
import dotenv from "dotenv";
dotenv.config();
import crypto from "node:crypto";
import { genPkce, signState, verifyState, buildAuthorizeUrl } from "../src/services/byo/supabaseOauth.js";

let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error("❌", m); } else console.log("✅", m); };

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

console.log("🧪 PKCE: challenge is the S256 of the verifier");
{
  const { verifier, challenge } = genPkce();
  assert(verifier.length >= 40, "verifier has entropy");
  const expect = b64url(crypto.createHash("sha256").update(verifier).digest());
  assert(challenge === expect, "challenge = base64url(sha256(verifier))");
}

console.log("🧪 state round-trips hostId + verifier, and rejects tampering");
{
  const signed = signState({ hostId: "host-123", verifier: "ver-abc" });
  const back = verifyState(signed);
  assert(back && back.hostId === "host-123" && back.verifier === "ver-abc", "valid state recovers hostId + verifier");
  assert(verifyState(signed + "x") === null, "tampered signature rejected");
  assert(verifyState("garbage") === null, "garbage rejected");
  // flip a payload char → signature no longer matches
  const [p, s] = signed.split(".");
  const flipped = (p[0] === "a" ? "b" : "a") + p.slice(1) + "." + s;
  assert(verifyState(flipped) === null, "tampered payload rejected");
}

console.log("🧪 authorize URL carries the required OAuth2 + PKCE params");
{
  const url = buildAuthorizeUrl("STATE123", "CHALLENGE456");
  const u = new URL(url);
  assert(u.origin + u.pathname === "https://api.supabase.com/v1/oauth/authorize", "hits the authorize endpoint");
  assert(u.searchParams.get("response_type") === "code", "response_type=code");
  assert(u.searchParams.get("code_challenge") === "CHALLENGE456", "carries the PKCE challenge");
  assert(u.searchParams.get("code_challenge_method") === "S256", "S256 method");
  assert(u.searchParams.get("state") === "STATE123", "carries the state");
  assert(!!u.searchParams.get("client_id"), "carries the client_id from env");
  assert((u.searchParams.get("redirect_uri") || "").includes("/host/byo/oauth/callback"), "carries the callback redirect_uri");
}

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log("\nAll byo-oauth tests passed");
