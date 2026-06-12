// Torture tests for the dump parser — the structural layer under the
// universal importer. Its one law: nothing in the file vanishes silently.
import { parseDump } from "../src/services/dumpParser.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

console.log("🧪 delimiters: comma, semicolon, tab, Excel sep-hint");
{
  assert(parseDump("a,b\n1,2").delimiter === ",", "comma detected");
  assert(parseDump("a;b\n1;2").delimiter === ";", "semicolon detected");
  assert(parseDump("a\tb\n1\t2").delimiter === "\t", "tab detected");
  const hinted = parseDump("sep=;\r\na;b\r\n1;2\r\n");
  assert(hinted.delimiter === ";" && hinted.rows.length === 1 && hinted.rows[0].a === "1", "sep-hint honored and stripped");
  const quoted = parseDump('Name,Address\n"X","Storgatan 1, Stockholm"');
  assert(quoted.rows[0].Address === "Storgatan 1, Stockholm", "comma inside quotes doesn't split");
}

console.log("🧪 BOM + CRLF + blank lines");
{
  const r = parseDump("﻿Name,Email\r\nA,a@b.com\r\n\r\nB,b@b.com\r\n");
  assert(r.headers[0] === "Name", "BOM stripped from first header");
  assert(r.rows.length === 2 && r.rows[1].Email === "b@b.com", "CRLF rows parse, blank line skipped");
}

console.log("🧪 quoted multiline + escaped quotes");
{
  const r = parseDump('Name,Note\nA,"line one\nline two"\nB,"she said ""hi"""');
  assert(r.rows.length === 2, "multiline field doesn't split the record");
  assert(r.rows[0].Note === "line one\nline two", "newline preserved inside quotes");
  assert(r.rows[1].Note === 'she said "hi"', "escaped quotes unescape");
}

console.log("🧪 nothing vanishes: ragged rows surface, short rows pad");
{
  const r = parseDump("Name,Email\nA,a@b.com\nB,b@b.com,EXTRA\nC");
  assert(r.rows.length === 2, "valid + short rows kept");
  assert(r.rows[1].Name === "C" && r.rows[1].Email === "", "short row padded with empties");
  assert(r.skipped.length === 1 && /3 columns/.test(r.skipped[0].reason), "overlong row surfaced with reason");
  assert(typeof r.skipped[0].line === "number", "skip carries a line number");
}

console.log("🧪 header hygiene: duplicates renamed, blanks named");
{
  const r = parseDump("Email,Email,,Name\na@b.com,c@d.com,x,A");
  assert(r.headers.join("|") === "Email|Email (2)|Column 3|Name", `headers: ${r.headers.join("|")}`);
  assert(r.rows[0]["Email (2)"] === "c@d.com", "second duplicate column readable");
}

console.log("🧪 degenerate inputs");
{
  assert(parseDump("").rows.length === 0, "empty file = no rows, no crash");
  assert(parseDump("Name,Email").rows.length === 0, "header-only = no rows");
  assert(parseDump("solo\nA\nB").rows.length === 2, "single-column file parses");
}

console.log("🧪 scale: 5000 rows parse fast");
{
  const big = "Name,Email\n" + Array.from({ length: 5000 }, (_, i) => `Person ${i},p${i}@x.com`).join("\n");
  const t0 = process.hrtime.bigint();
  const r = parseDump(big);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert(r.rows.length === 5000, "all 5000 rows parsed");
  assert(ms < 1000, `parse under 1s (${ms.toFixed(0)}ms)`);
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nAll dump-parser tests passed");
