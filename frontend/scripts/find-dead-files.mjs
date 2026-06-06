#!/usr/bin/env node
// Dead-file detector. Walks the real import graph from the app entry
// (static `import … from "…"` AND dynamic `import("…")`) and reports any file
// under src/ that nothing reachable imports — i.e. code that ships to no one
// and is dangerous to edit (you can "fix" it and nothing changes; see the
// 2026-06-06 duplicate-button incident).
//
//   node scripts/find-dead-files.mjs          # report, exit 1 if any dead
//   node scripts/find-dead-files.mjs --quiet  # exit code only
//
// Entry points: src/main.jsx (the bundle root). Add more below if the app
// grows real second entries (e.g. a separate SW build step).
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, relative, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const SRC = join(ROOT, "src");
const ENTRIES = [join(SRC, "main.jsx")];
const EXTS = [".jsx", ".js", ".ts", ".tsx"];

// Resolve a relative import specifier to an on-disk file path, or null if it's
// a bare/package import (node_modules) or an asset we don't traverse.
function resolveImport(spec, fromFile) {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return null; // bare pkg
  const base = spec.startsWith("/") ? join(SRC, spec.slice(1)) : resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    ...EXTS.map((e) => base + e),
    ...EXTS.map((e) => join(base, "index" + e)),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null; // .css/.png/etc. or unresolved → ignore
}

const IMPORT_RE = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;

const reachable = new Set();
const queue = [...ENTRIES];
while (queue.length) {
  const file = queue.pop();
  if (reachable.has(file)) continue;
  reachable.add(file);
  let code;
  try { code = readFileSync(file, "utf8"); } catch { continue; }
  for (const m of code.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;
    const target = resolveImport(spec, file);
    if (target && !reachable.has(target)) queue.push(target);
  }
}

// Every source file on disk
const allFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (EXTS.includes(extname(p))) allFiles.push(p);
  }
})(SRC);

const dead = allFiles
  .filter((f) => !reachable.has(f))
  .map((f) => relative(ROOT, f))
  .sort();

const quiet = process.argv.includes("--quiet");
if (dead.length) {
  if (!quiet) {
    console.error(`\n✗ ${dead.length} dead file(s) — reachable from no entry point:\n`);
    for (const f of dead) console.error("  " + f);
    console.error("\nDelete them, or wire them into the app. Editing them does nothing.\n");
  }
  process.exit(1);
}
if (!quiet) console.log(`✓ no dead files — all ${allFiles.length} source files are reachable from the entry.`);
