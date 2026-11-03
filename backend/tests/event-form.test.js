// lib/eventForm.js: the sign-up's own fields and questions.
import { answersByLabel, cleanQuestions, formOf, formPatch, normalizeInstagram, normalizePhone, readSignup } from "../src/lib/eventForm.js";

let failures = 0;
const assert = (ok, label) => { console.log(`${ok ? "✅" : "❌"} ${label}`); if (!ok) failures += 1; };

const qs = cleanQuestions([
  { label: "  Allergier? ", type: "text" },
  { id: "q_diet01", label: "Kost", type: "choice", options: ["Vegan", "Vegetarisk", "vegan", "Allt"], required: true },
  { label: "Får vi fota dig?", type: "check" },
  { label: "Trasig", type: "choice", options: ["bara en"] },
  { label: "" },
]);
assert(qs.length === 3, "empty labels and one-option choices are dropped");
assert(qs[0].label === "Allergier?" && /^q_[a-f0-9]{8}$/.test(qs[0].id), "label trimmed, a new id given");
assert(qs[1].id === "q_diet01" && qs[1].options.length === 3, "an id stays put; duplicate options merged");

const f = formOf({ collect_phone: true, require_phone: false, collect_instagram: true, require_instagram: true, max_plus_ones_per_guest: 3, enrichment_questions: qs });
assert(f.phone === "optional" && f.instagram === "required" && f.plusOnes === 3 && f.questions.length === 3, "columns → form");
const back = formPatch({ phone: "off", instagram: "optional", plusOnes: 99, questions: qs });
assert(back.collect_phone === false && back.require_instagram === false && back.collect_instagram === true && back.max_plus_ones_per_guest === 10, "form → columns, plus-ones capped at 10");
assert(Object.keys(formPatch({})).length === 0, "nothing given → nothing changes");

assert(normalizePhone("070-961 15 60") === "+46709611560", "Swedish mobile → +46");
assert(normalizePhone("+44 7700 900123") === "+447700900123" && normalizePhone("12") === "", "international kept, too short dropped");
assert(normalizeInstagram("https://www.instagram.com/ItsFelixAgain/?hl=sv") === "itsfelixagain" && normalizeInstagram("@@pullup") === "pullup", "Instagram handle from link or @");

let r = readSignup(f, { phone: "0709611560", instagram: "@pullup", plusOnes: 7, answers: { Kost: "vegan", [qs[2].id]: true, [qs[0].id]: "Nötter" } });
assert(!r.error && r.plusOnes === 3 && r.phone === "+46709611560" && r.instagram === "pullup", "plus-ones capped to the event's max");
assert(r.answers[qs[1].id] === "Vegan" && r.answers[qs[2].id] === true && r.answers[qs[0].id] === "Nötter", "answers by label or id, choices matched case-insensitively");
r = readSignup(f, { instagram: "pullup" });
assert(r.error === "missing_answer" && r.question === "Kost", "a required question unanswered");
r = readSignup(f, { answers: { Kost: "Vegan" } });
assert(r.error === "missing_instagram", "a required Instagram missing");
r = readSignup(f, { instagram: "pullup", answers: { Kost: "Kött" } });
assert(r.error === "invalid_answer", "an answer that isn't an option");
r = readSignup(formOf({}), { phone: "0709611560", plusOnes: 2, answers: { x: "y" } });
assert(!r.error && r.phone === "" && r.plusOnes === 0 && Object.keys(r.answers).length === 0, "a plain event takes only name and email");

const lab = answersByLabel(f, { [qs[0].id]: "Nötter", [qs[2].id]: true, q_gone99: "old" });
assert(lab["Allergier?"] === "Nötter" && lab["Får vi fota dig?"] === "Ja" && lab.q_gone99 === "old", "answers by label; removed questions keep their answers");

if (failures) { console.error(`\n${failures} event-form test(s) failed`); process.exit(1); }
console.log("\nall event-form tests passed");
