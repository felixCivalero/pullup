import { anchorScoreFrom } from "../src/services/adminMatching.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

// A PullUp login account dominates everything below it — the gravity well.
console.log("🧪 anchorScoreFrom: a login account outweighs a strong 3rd-party id");
{
  const login = anchorScoreFrom({ hasLogin: true, bestRank: 3, pullupOrigin: true, identityCount: 1 });
  const igOnly = anchorScoreFrom({ hasLogin: false, bestRank: 2, pullupOrigin: false, identityCount: 1 });
  assert(login > igOnly, `login (${login}) > ig-only (${igOnly})`);
}

// The exact Felix vs Felix Alberto case: declared+login spine beats IG strong id.
console.log("🧪 anchorScoreFrom: the PullUp-account Felix beats the IG-only Felix Alberto");
{
  // FELIX CIVALERO STOLPE: Google login, declared email (rank3), rsvp origin, 2 ids.
  const felix = anchorScoreFrom({ hasLogin: true, bestRank: 3, pullupOrigin: true, identityCount: 2 });
  // Felix Alberto: no login, ig_user_id strong (rank2), ig origin, 1 id.
  const alberto = anchorScoreFrom({ hasLogin: false, bestRank: 2, pullupOrigin: false, identityCount: 1 });
  assert(felix > alberto, `Felix spine (${felix}) > Alberto (${alberto})`);
}

// Among two non-login profiles, a verified identifier beats a typed claim.
console.log("🧪 anchorScoreFrom: verified beats a typed-handle claim when neither has a login");
{
  const verified = anchorScoreFrom({ hasLogin: false, bestRank: 1, pullupOrigin: false, identityCount: 1 });
  const claim = anchorScoreFrom({ hasLogin: false, bestRank: 4, pullupOrigin: false, identityCount: 1 });
  assert(verified > claim, `verified (${verified}) > claim (${claim})`);
}

// PullUp origin and identity richness break ties between equal bands.
console.log("🧪 anchorScoreFrom: PullUp-origin + more identities edge out an otherwise-equal profile");
{
  const rich = anchorScoreFrom({ hasLogin: false, bestRank: 3, pullupOrigin: true, identityCount: 4 });
  const thin = anchorScoreFrom({ hasLogin: false, bestRank: 3, pullupOrigin: false, identityCount: 1 });
  assert(rich > thin, `rich pullup (${rich}) > thin 3rd-party (${thin})`);
}

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log("\nanchor-score: all assertions passed");
