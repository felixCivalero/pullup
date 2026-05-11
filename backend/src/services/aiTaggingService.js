// AI-driven event tagging using Anthropic Claude Haiku 4.5.
//
// Reads a small projection of an event (title, location, description, dinner
// flag, ticket flag) and returns 3–6 short, lowercase tags suitable for
// classifying who attends. The same vocabulary powers:
//   - admin CRM filters / chip cloud
//   - host CRM customer filtering ("who came to my dinner events?")
//   - admin broadcast audience segmentation by attendedEventTags
//
// To keep the tag vocabulary stable across events, we pass the existing
// vocabulary (most-frequent tags first) in the user message and tell the
// model to reuse those terms before inventing new ones. The system prompt
// is identical across requests and is marked cacheable.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TAGS = 6;
const MIN_TAGS = 3;

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const SYSTEM_PROMPT = `You classify nightlife / social events into short tags that describe what kind of event it is and what kind of person would attend.

You will receive:
- the event's title, location, description, and a few feature flags
- the existing tag vocabulary used across the platform (most frequent first)

Return between ${MIN_TAGS} and ${MAX_TAGS} tags as a JSON object: {"tags": ["tag1", "tag2", ...]}

Tag rules — STRICT:
- lowercase, single words or hyphenated (e.g. "dinner", "afterparty", "art-opening", "networking")
- no punctuation, no emoji, no quotes
- focus on event TYPE and AUDIENCE, not the title verbatim
- examples of useful tag categories: format (dinner, brunch, cocktails, club-night, workshop, talk, screening), audience (creatives, founders, queer, students, families), vibe (intimate, high-energy, formal, casual), scene (art, music, fashion, tech, food, wellness), city or neighborhood ONLY if clearly identifying (stockholm, soho)
- REUSE existing vocabulary when a tag fits — only invent new tags when nothing in the vocabulary applies
- never use generic tags like "event", "party", "gathering" on their own
- never include the literal event title as a tag

Return ONLY the JSON object, no prose, no markdown fences.`;

function buildEventBrief(event) {
  const lines = [];
  if (event.title) lines.push(`Title: ${event.title}`);
  if (event.location) lines.push(`Location: ${event.location}`);
  if (event.startsAt) {
    try {
      const d = new Date(event.startsAt);
      if (!Number.isNaN(d.getTime())) {
        lines.push(
          `When: ${d.toLocaleString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            hour: "numeric",
          })}`,
        );
      }
    } catch (_) {}
  }
  if (event.dinnerEnabled) lines.push("Feature: dinner / seated meal");
  if (event.ticketType === "paid" || event.ticketPrice) {
    lines.push("Feature: paid ticket");
  }
  if (event.requireApproval) lines.push("Feature: approval-required guest list");
  if (event.description) {
    lines.push(`Description: ${String(event.description).slice(0, 600)}`);
  }
  // Sections is a JSON blob of editor blocks — pull out any text content to
  // give the model real flavor about what the event actually is.
  const sections = event.sections;
  if (Array.isArray(sections) && sections.length > 0) {
    const text = sections
      .map((s) => {
        if (!s || typeof s !== "object") return "";
        if (typeof s.text === "string") return s.text;
        if (typeof s.body === "string") return s.body;
        if (typeof s.title === "string") return s.title;
        return "";
      })
      .filter(Boolean)
      .join(" — ")
      .slice(0, 800);
    if (text) lines.push(`Sections: ${text}`);
  }
  return lines.join("\n");
}

function normalizeTags(rawTags) {
  if (!Array.isArray(rawTags)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of rawTags) {
    if (typeof raw !== "string") continue;
    let t = raw.trim().toLowerCase();
    // Strip surrounding punctuation / quotes / hashtags
    t = t.replace(/^[#"'`\s]+|[.,;:!?"'`\s]+$/g, "");
    // Collapse whitespace to hyphens
    t = t.replace(/\s+/g, "-");
    // Allow only a–z, 0–9, hyphen
    t = t.replace(/[^a-z0-9-]/g, "");
    if (!t || t.length > 32) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

// Generate tags for a single event.
//
// @param event  — application-format event (id, title, location, description,
//                 startsAt, sections, dinnerEnabled, ticketType, ticketPrice,
//                 requireApproval). Extra fields are ignored.
// @param vocabulary — Array<{ tag: string, count: number }> sorted by frequency
//                     desc. The top ~40 are passed to the model to bias reuse.
// @returns Array<string> of normalized tags.
export async function generateTagsForEvent(event, vocabulary = []) {
  const client = getClient();
  const brief = buildEventBrief(event);
  if (!brief.trim()) return [];

  const vocabLine =
    vocabulary.length > 0
      ? `Existing vocabulary (most-used first): ${vocabulary
          .slice(0, 40)
          .map((v) => v.tag)
          .join(", ")}`
      : "Existing vocabulary: (empty — this is one of the first events tagged)";

  const userMessage = `${vocabLine}\n\nEvent:\n${brief}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = (response.content || []).find((b) => b.type === "text");
  if (!textBlock?.text) return [];

  let parsed;
  try {
    // Defensive: occasionally the model wraps JSON in code fences despite
    // instructions. Strip any leading/trailing non-JSON text.
    const raw = textBlock.text.trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return [];
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch (err) {
    console.error("[aiTagging] failed to parse model output:", textBlock.text);
    return [];
  }

  return normalizeTags(parsed.tags);
}

// Fetch the platform-wide tag vocabulary from events.admin_tags, sorted by
// frequency. Used as input to the model so it reuses existing terms.
export async function getTagVocabulary(supabase) {
  const { data, error } = await supabase
    .from("events")
    .select("admin_tags")
    .not("admin_tags", "is", null);
  if (error) {
    console.error("[aiTagging] vocabulary fetch failed:", error.message);
    return [];
  }
  const counts = {};
  for (const row of data || []) {
    for (const t of row.admin_tags || []) {
      if (typeof t !== "string") continue;
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));
}

// Merge AI-generated tags with the event's existing tags. Preserves manual
// edits, dedupes, caps at the same 32-tag limit the manual editor enforces.
export function mergeTags(existing, generated) {
  const out = [];
  const seen = new Set();
  for (const t of [...(existing || []), ...(generated || [])]) {
    if (typeof t !== "string") continue;
    const norm = t.trim().toLowerCase();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
    if (out.length >= 32) break;
  }
  return out;
}
