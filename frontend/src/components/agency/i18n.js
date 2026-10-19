import { useMemo, useSyncExternalStore } from "react";
import { SV } from "./i18n/sv.js";
import { SW } from "./i18n/sw.js";

/* The agency site in three languages. English is the source: every string is
   written in English in the components and data, and t() looks it up in the
   Swedish or Swahili dictionary (keyed by the English text). A miss falls
   back to English, so nothing ever renders blank. Strings with numbers
   ("126 people pulled up.") also match a "{#}" key ("{#} people pulled up."),
   so live counts don't need one entry per value.
   Swedish is always the default (Felix 2026-10-19); English is a toggle away.
   The visitor's own switch is remembered per browser; ?lang=sv|sw|en in a
   link applies to that visit only. Prices are SEK in every language. */

export const LANGS = [
  { code: "sv", short: "SV", name: "Svenska" },
  { code: "en", short: "EN", name: "English" },
  { code: "sw", short: "SW", name: "Kiswahili" },
];
const DICTS = { sv: SV, sw: SW };
const KEY = "pullup.lang";
const DEFAULT = "sv";
const valid = (c) => LANGS.some((l) => l.code === c);

function initial() {
  try {
    // A ?lang= link applies to this visit only — only the visitor's own
    // switch (setLang) is remembered. Default is always Swedish.
    const q = new URLSearchParams(window.location.search).get("lang");
    if (valid(q)) return q;
    const saved = localStorage.getItem(KEY);
    if (valid(saved)) return saved;
  } catch {
    /* storage blocked — Swedish for this visit */
  }
  return DEFAULT;
}

let current = typeof window === "undefined" ? DEFAULT : initial();
const listeners = new Set();
const apply = () => {
  if (typeof document !== "undefined") document.documentElement.lang = current;
};
apply();

export function setLang(code) {
  if (!valid(code) || code === current) return;
  current = code;
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* fine — the choice holds until reload */
  }
  apply();
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const useLang = () => useSyncExternalStore(subscribe, () => current, () => DEFAULT);

const NUM = /\d[\d,.]*\d|\d/g;

// Swedish number style: "10,000" → "10 000", "28.1M" → "28,1 milj.".
// Runs on everything t() returns in Swedish, so data and live counts written
// in English format read natively.
const NB = "\u00a0";
export function svNumbers(s) {
  return s
    .replace(/\b(\d+)\.(\d+)M\b/g, `$1,$2${NB}milj.`)
    .replace(/\b\d{1,3}(?:,\d{3})+\b/g, (m) => m.replace(/,/g, NB));
}
const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);
const missed = import.meta.env?.DEV ? new Set() : null;

export function translate(lang, s, vars) {
  if (typeof s !== "string") return s;
  if (lang === "en" || !DICTS[lang]) return fill(s, vars);
  return lang === "sv" ? svNumbers(lookup(lang, s, vars)) : lookup(lang, s, vars);
}

function lookup(lang, s, vars) {
  const dict = DICTS[lang];
  let out = dict[s];
  if (out == null) {
    const nums = [];
    const key = s.replace(NUM, (m) => (nums.push(m), "{#}"));
    if (nums.length && dict[key] != null) {
      let i = 0;
      out = dict[key].replace(/\{#\}/g, () => nums[i++] ?? "");
    }
  }
  if (out == null && missed && /[a-z]{3}/i.test(s) && !missed.has(`${lang}:${s}`)) {
    missed.add(`${lang}:${s}`);
    (window.__i18nMissed ||= []).push(`${lang}: ${s}`);
  }
  return fill(out ?? s, vars);
}

// t("Build with us"), t("Thanks, {name}.", { name })
export function useT() {
  const lang = useLang();
  return useMemo(() => {
    const t = (s, vars) => translate(lang, s, vars);
    t.lang = lang;
    return t;
  }, [lang]);
}

// Data registries (cases, superpowers, case long reads) are localized whole:
// every string value is run through t(), except identifiers and proper names.
// `beats` is skipped because ReelEdit translates its beats itself.
const KEEP = new Set(["slug", "src", "p", "o", "id", "tone", "image", "client", "channel", "who", "by", "name", "type", "rows", "totals", "beats"]);
export function localize(lang, value, key) {
  if (lang === "en" || KEEP.has(key)) return value;
  if (typeof value === "string") return translate(lang, value);
  if (Array.isArray(value)) return value.map((v) => localize(lang, v, key));
  if (value && typeof value === "object" && !(value.$$typeof)) {
    const out = {};
    for (const k of Object.keys(value)) out[k] = localize(lang, value[k], k);
    return out;
  }
  return value;
}
export function useLocalized(value) {
  const lang = useLang();
  return useMemo(() => localize(lang, value), [lang, value]);
}
