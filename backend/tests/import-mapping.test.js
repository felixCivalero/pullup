// Pure-logic tests for the universal-dump import brain: heuristic mapping
// (multilingual headers + value sniffing) and the deterministic validators
// that make "always 100%" true.
import {
  proposeMappingHeuristic,
  validateRows,
} from "../src/services/importMapping.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

console.log("🧪 Swedish guest-list headers map by name");
{
  const rows = [{ "Namn": "Anna B", "E-post": "anna@x.se", "Mobilnummer": "070-123 45 67", "Taggar": "vip; stamgäst" }];
  const m = proposeMappingHeuristic(Object.keys(rows[0]), rows);
  assert(m["Namn"]?.field === "name", "Namn → name");
  assert(m["E-post"]?.field === "email", "E-post → email");
  assert(m["Mobilnummer"]?.field === "phone", "Mobilnummer → phone");
  assert(m["Taggar"]?.field === "tags", "Taggar → tags");
}

console.log("🧪 cryptic headers map by value shape");
{
  const rows = Array.from({ length: 10 }, (_, i) => ({
    "col_a": `user${i}@mail.com`,
    "col_b": `@handle_${i}`,
  }));
  const m = proposeMappingHeuristic(["col_a", "col_b"], rows);
  assert(m["col_a"]?.field === "email" && m["col_a"]?.via === "values", "email sniffed from values");
  assert(m["col_b"]?.field === "instagram", "instagram sniffed from @handles");
}

console.log("🧪 validation: email is the anchor, bad rows reject with reasons");
{
  const mapping = { Email: { field: "email" }, Name: { field: "name" } };
  const rows = [
    { Email: "GOOD@Mail.COM", Name: "A" },
    { Email: "not-an-email", Name: "B" },
    { Email: "good@mail.com", Name: "Dup" },
    { Email: "", Name: "C" },
  ];
  const { people, rejects } = validateRows(rows, mapping);
  assert(people.length === 1 && people[0].email === "good@mail.com", "one valid person, email lowercased");
  assert(rejects.length === 3, `3 rejects (${rejects.length})`);
  assert(rejects.some((r) => r.reason.includes("duplicate")), "in-file duplicate caught");
}

console.log("🧪 field cleaners: drop bad values per-field, never the row");
{
  const mapping = {
    Email: { field: "email" }, Tel: { field: "phone" },
    IG: { field: "instagram" }, Born: { field: "birthday" },
  };
  const rows = [{
    Email: "p@x.com",
    Tel: "this is not a phone",
    IG: "https://instagram.com/cool.kid/",
    Born: "31/12/1990",
  }];
  const { people, fieldDrops } = validateRows(rows, mapping);
  assert(people.length === 1, "row survives a bad optional field");
  assert(people[0].phone === undefined && fieldDrops.phone === 1, "junk phone dropped + counted");
  assert(people[0].instagram === "cool.kid", "IG url → handle");
  assert(people[0].birthday === "1990-12-31", "DD/MM/YYYY parsed");
}

console.log("🧪 unmapped columns survive in extra — nothing in the dump is lost");
{
  const mapping = { Email: { field: "email" } };
  const rows = [{ Email: "p@x.com", "Membership level": "Gold", "Visits": "14" }];
  const { people } = validateRows(rows, mapping);
  assert(people[0].extra["Membership level"] === "Gold" && people[0].extra["Visits"] === "14", "extras preserved");
}

console.log("🧪 no email column mapped = explicit error, not a guess");
{
  const { error } = validateRows([{ a: 1 }], { a: { field: "name" } });
  assert(error === "no email column mapped", "explicit mapping error");
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nAll import-mapping tests passed");
