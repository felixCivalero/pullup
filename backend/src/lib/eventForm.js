// An event's sign-up form beyond name and email (the old app's fields, back):
// a phone number, an Instagram handle, guests brought along, and the
// organiser's own questions — allergies, diet, company, a choice, a yes.
// Kept in the event columns the old app used, so its events read the same:
//   collect_phone / require_phone, collect_instagram / require_instagram,
//   max_plus_ones_per_guest, enrichment_questions [{ id, label, type, options, required }]
// Answers: rsvps.custom_answers { questionId: value }, the guests on the
// sign-up: plus_ones / party_size / total_guests; phone and Instagram also on
// the person (people.phone, people.instagram) so the CRM has them.
// Pure helpers, tested in tests/event-form.test.js.
import crypto from "crypto";

export const LEVELS = ["off", "optional", "required"];
export const QUESTION_TYPES = ["text", "choice", "check"];
export const MAX_QUESTIONS = 12;
export const MAX_PLUS_ONES = 10;
export const FORM_COLUMNS = "collect_phone, require_phone, collect_instagram, require_instagram, max_plus_ones_per_guest, enrichment_questions";

const clip = (v, n) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n) : "");
const level = (collect, require) => (require ? "required" : collect ? "optional" : "off");

// The questions as stored, made safe: a label, a known type, options for a
// choice, an id that stays put (answers are keyed on it).
export function cleanQuestions(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const q of input.slice(0, MAX_QUESTIONS)) {
    if (!q || typeof q !== "object") continue;
    const label = clip(q.label, 140);
    if (!label) continue;
    const type = QUESTION_TYPES.includes(q.type) ? q.type : "text";
    let id = typeof q.id === "string" && /^q_[a-z0-9]{3,16}$/.test(q.id) ? q.id : `q_${crypto.randomBytes(4).toString("hex")}`;
    while (seen.has(id)) id = `q_${crypto.randomBytes(4).toString("hex")}`;
    seen.add(id);
    const options = [];
    if (type === "choice") {
      for (const o of Array.isArray(q.options) ? q.options : []) {
        const v = clip(o, 80);
        if (v && !options.some((x) => x.toLowerCase() === v.toLowerCase())) options.push(v);
      }
      options.splice(12);
    }
    if (type === "choice" && options.length < 2) continue;
    out.push({ id, label, type, ...(options.length ? { options } : {}), required: q.required === true });
  }
  return out;
}

// The event row → the form, as the page and the editor read it.
export function formOf(ev = {}) {
  return {
    phone: level(ev.collect_phone, ev.require_phone),
    instagram: level(ev.collect_instagram, ev.require_instagram),
    plusOnes: Math.max(0, Math.min(MAX_PLUS_ONES, Number(ev.max_plus_ones_per_guest) || 0)),
    questions: cleanQuestions(ev.enrichment_questions || []),
  };
}

// A form from the editor or an assistant → the columns to write (only what
// was given changes).
export function formPatch(form) {
  if (!form || typeof form !== "object") return {};
  const out = {};
  for (const [k, c, r] of [["phone", "collect_phone", "require_phone"], ["instagram", "collect_instagram", "require_instagram"]]) {
    if (!LEVELS.includes(form[k])) continue;
    out[c] = form[k] !== "off";
    out[r] = form[k] === "required";
  }
  if (form.plusOnes !== undefined && Number.isFinite(Number(form.plusOnes))) out.max_plus_ones_per_guest = Math.max(0, Math.min(MAX_PLUS_ONES, Math.round(Number(form.plusOnes))));
  if (Array.isArray(form.questions)) out.enrichment_questions = cleanQuestions(form.questions);
  return out;
}

export const normalizeInstagram = (v) => clip(v, 80).replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "").replace(/^@+/, "").toLowerCase();

// A phone number as typed → digits with an optional leading +, or "".
export function normalizePhone(v) {
  const raw = clip(v, 40);
  const plus = raw.startsWith("+") || raw.startsWith("00");
  const digits = raw.replace(/\D/g, "").replace(/^00/, "");
  if (digits.length < 6 || digits.length > 15) return "";
  return plus ? `+${digits}` : digits.startsWith("0") ? `+46${digits.slice(1)}` : `+${digits}`;
}

// What a guest sent → what's stored, or the first thing that's missing/wrong.
// answers may be keyed by question id or by its label (an assistant).
export function readSignup(form, body = {}) {
  const phone = form.phone === "off" ? "" : normalizePhone(body.phone);
  if (form.phone === "required" && !phone) return { error: "missing_phone" };
  if (form.phone !== "off" && clip(body.phone, 40) && !phone) return { error: "invalid_phone" };
  const instagram = form.instagram === "off" ? "" : normalizeInstagram(body.instagram);
  if (form.instagram === "required" && !instagram) return { error: "missing_instagram" };
  if (instagram && !/^[a-z0-9._]{1,30}$/.test(instagram)) return { error: "invalid_instagram" };
  const plusOnes = Math.max(0, Math.min(form.plusOnes, Math.round(Number(body.plusOnes) || 0)));
  const given = body.answers && typeof body.answers === "object" ? body.answers : {};
  const answers = {};
  for (const q of form.questions) {
    let v = given[q.id] ?? given[q.label];
    if (q.type === "check") {
      v = v === true || v === "true" || v === "ja" || v === "yes";
      if (q.required && !v) return { error: "missing_answer", question: q.label };
      if (v) answers[q.id] = true;
      continue;
    }
    v = clip(typeof v === "number" ? String(v) : v, 500);
    if (q.type === "choice" && v && !q.options.includes(v)) {
      const match = q.options.find((o) => o.toLowerCase() === v.toLowerCase());
      if (!match) return { error: "invalid_answer", question: q.label };
      v = match;
    }
    if (q.required && !v) return { error: "missing_answer", question: q.label };
    if (v) answers[q.id] = v;
  }
  return { phone, instagram, plusOnes, answers };
}

// A sign-up's answers by question label, for lists, exports and assistants.
// Questions removed since still show, under the id they were asked with.
export function answersByLabel(form, answers = {}) {
  const out = {};
  for (const q of form.questions) if (answers?.[q.id] !== undefined) out[q.label] = answers[q.id] === true ? "Ja" : answers[q.id];
  for (const [k, v] of Object.entries(answers || {})) {
    if (!form.questions.some((q) => q.id === k) && /^q_/.test(k)) out[k] = v === true ? "Ja" : v;
  }
  return out;
}
