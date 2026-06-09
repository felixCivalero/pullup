import { generateCode } from "../src/services/shortLinks.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const AMBIGUOUS = /[0O1lI]/; // the chars we deliberately excluded

console.log("🧪 generateCode: default length is 7");
assert(generateCode().length === 7, `length 7 (got ${generateCode().length})`);

console.log("🧪 generateCode: honors an explicit length");
assert(generateCode(10).length === 10, `length 10 (got ${generateCode(10).length})`);

console.log("🧪 generateCode: never emits ambiguous characters (0/O/1/l/I)");
{
  let bad = 0;
  for (let i = 0; i < 5000; i++) if (AMBIGUOUS.test(generateCode(8))) bad++;
  assert(bad === 0, `no ambiguous chars across 5000 codes (got ${bad})`);
}

console.log("🧪 generateCode: codes are effectively unique (no collisions in 10k @ len 7)");
{
  const seen = new Set();
  let collisions = 0;
  for (let i = 0; i < 10000; i++) {
    const c = generateCode(7);
    if (seen.has(c)) collisions++;
    seen.add(c);
  }
  assert(collisions === 0, `no collisions in 10k codes (got ${collisions})`);
}

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log("\nAll short-link assertions passed");
