// Regression: a host's "world" must include people imported from another system,
// not just their RSVP/pull-up graph. Guards the 39-vs-1553 bug where the masthead
// people count read only rsvps and silently dropped 1515 imported contacts.
import { unionWorldPersonIds } from "../src/services/worldPeople.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

console.log("🧪 world = rsvps + pull-ups + imported/timeline people, deduped");
{
  const rsvpRows = [{ person_id: "a" }, { person_id: "b" }];
  const pullupRows = [{ person_id: "a" }]; // subset of rsvps
  // imported people exist ONLY in the timeline (person_events), never in rsvps
  const timelineRows = [{ person_id: "a" }, { person_id: "imp1" }, { person_id: "imp2" }];

  const ids = unionWorldPersonIds(rsvpRows, pullupRows, timelineRows);

  assert(ids.length === 4, "a, b, imp1, imp2 — deduped to 4");
  assert(ids.includes("imp1") && ids.includes("imp2"), "imported (timeline-only) people ARE counted");
  assert(ids.filter((x) => x === "a").length === 1, "person in all three sources counted once");
}

console.log("🧪 the exact bug shape: an import-only world is not empty");
{
  // No rsvps at all (a creator who only imported a list) must still have a world.
  const ids = unionWorldPersonIds([], [], [{ person_id: "x" }, { person_id: "y" }]);
  assert(ids.length === 2, "import-only host has 2 people, not 0");
}

console.log("🧪 falsy ids dropped; bare-id arrays accepted; missing sources safe");
{
  const ids = unionWorldPersonIds(
    [{ person_id: null }, { person_id: "a" }],
    undefined,
    ["b", "", null, "a"], // bare ids + dupes + falsy
  );
  assert(ids.length === 2 && ids.includes("a") && ids.includes("b"), "null/empty dropped, dupes merged, bare ids work");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll world-people tests passed");
