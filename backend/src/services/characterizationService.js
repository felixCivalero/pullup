// Characterization brain (Algorithm 1) — turns an assembled vector-input row into a
// natural-language "direction" + an honest confidence, for storage in the `vectors` table.
//
// Reads from the *_vector_input SQL views:
//   - event_vector_input   -> characterize(subjectType="room")
//   - person_vector_input  -> characterize(subjectType="person")
//   - host_vector_input    -> characterize(subjectType="host")
//
// Follows the same client/parse pattern as aiTaggingService.js. The embedding step is
// separate and deferred — this service produces MEANING (text), not the numeric vector.
//
// Design principles encoded in the prompts (the team's "depth-over-volume" thesis):
//   - Depth of interpretation replaces volume of data: read between the lines with world
//     knowledge; a little data read well beats a lot read shallowly.
//   - Restraint is intelligence: infer only what the evidence supports; where it's thin,
//     say so and stay general — never invent a story. Confidence reflects attestation.
//   - Two axes (esp. persons): TASTE/DIRECTION (what rooms fit them — needs evidence of
//     rooms chosen) vs INTENT/ENGAGEMENT (how serious/invested — readable from effort).
//     Be confident per-axis: "low-intent signup" + "taste unknown" can both be true.
//   - Infer from what someone CHOSE or DID, never from identity proxies (name, origin,
//     demographics). Read intent from effort/behaviour, not from who they appear to be.
//   - Rooms are the source. Persons inherit their rooms' direction as a prior, then
//     differentiate as evidence grows. Host-affinity is a primary signal.
//   - Trajectory, not snapshot: note the arc when present (sampled many -> settled; etc.).
//   - Traceability: every claim must trace to provided evidence; list the facts you used.

import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";

// The characterization brain is the high-leverage intelligence step — use a strong model,
// not the Haiku used for cheap tagging. Override per-run via env if needed.
const MODEL = process.env.CHARACTERIZATION_MODEL || "claude-sonnet-4-6";
const PROMPT_VERSION = "char-v1";

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const SHARED = `You are the characterization brain for PullUp, a social platform built around events ("rooms"). Your job is to read a small, delicate amount of real data about one subject and write its DIRECTION — the worldview/intent it expresses and the kind of people it gathers — in 2–4 sentences of plain, specific prose. This text will later be embedded into a vector and used to match people to rooms.

The bet you embody: depth of interpretation replaces volume of data. Use your world knowledge to read between the lines — what a kind of event means, what a host's writing reveals, what an act signals — and extract more from one rich signal than a clicks-based system gets from millions. But hold these disciplines without exception:

1. RESTRAINT IS INTELLIGENCE. Infer only what the evidence supports. Where evidence is thin, stay general and SAY it's thin — never manufacture a story to sound confident. A thin-but-honest read is correct; a rich-but-invented read is failure.
2. CONFIDENCE IS HONEST. Return confidence in [0,1] reflecting how well-attested the read is (how much evidence, how recent, how consistent). Thin evidence => low confidence, even if the prose reads well.
3. INFER FROM CHOICES, NOT IDENTITY. Base everything on what the subject CHOSE or DID. Never infer taste or character from a name, perceived ethnicity, gender, or location. Read seriousness/intent from EFFORT signals (real email, completed profile, showing up, returning), never from identity.
4. TRACE EVERY CLAIM. Populate "evidence" with the specific facts from the input you relied on. If you can't point at a fact, don't claim it.
5. WRITE SPECIFICALLY. Name the actual texture (genre, venue type, scene, voice). Avoid generic filler like "a fun social event for cool people."

Return ONLY a JSON object, no prose or markdown fences:
{"characterization": "2–4 sentences", "confidence": 0.0-1.0, "evidence": ["fact you used", "..."], "notes": "optional: what's missing / what would sharpen this"}`;

const SYSTEM_PROMPTS = {
  room: `${SHARED}

SUBJECT: a ROOM (an event). Rooms are the source of all meaning in this system — read this one carefully. From its content, tags, host/brand, partners and music, characterize: its likely worldview and intent, the kind of person it gathers, and its texture (refined/underground/aspirational/intimate/etc.). If a brand or venue is co-hosting, that shapes the direction. Confidence is high when there's authored content + real signal; lower for thin/placeholder pages.`,

  host: `${SHARED}

SUBJECT: a HOST (one human who makes rooms — and may also attend others'). Read, in order of weight: their VOICE (voice_samples — the actual words they write to their audience; this is the richest signal — characterize HOW they communicate), their authored rooms (including DRAFTS, which are intent-without-execution — what they reach toward), their stated brief, and how they OPERATE (mcp_tool_usage — e.g. iterating drafts, setting a brief, uploading media shows an engaged operator). Note whether their stated direction (brief) matches their output (resolved vs unresolved direction). Characterize their direction as a maker and their operating posture.`,

  person: `${SHARED}

SUBJECT: a PERSON (an attendee — possibly also a host). Work on TWO AXES and be confident per-axis:
- TASTE/DIRECTION — what kind of rooms fit them. This is SEEDED FROM THE ROOMS THEY CHOSE: read the room_characterization of each attended room. With one room, their taste is essentially that room's prior at low confidence; with more, triangulate where their choices converge. HOST-AFFINITY is a primary signal — returning to the same host across rooms means they follow that curator (weight this heavily; it separates a "regular" from a one-time "sampler").
- INTENT/ENGAGEMENT — how serious/invested a participant they are. Read this from EFFORT signals only: has_email, has_full_name, has_socials, has_company, total_spend, marketing_consent, events_browsed (lurking/browsing = interest), and the arc (first/last event, n_events). A first-name-only, no-effort signup reads as low-intent; a complete profile + browsing + returning reads as invested. NEVER read intent from the name itself.
Also read the ARC as a trajectory, not a snapshot (sampled many then settled on one host; deepening; drifting). Be explicit when taste is thin even if intent is readable (or vice versa) — set confidence to the TASTE axis, and put intent observations in the prose/notes.`,
};

// ---- input -> user message builders ---------------------------------------

function j(v) { return JSON.stringify(v, null, 2); }

function buildRoomBrief(row) {
  const lines = [
    `Title: ${row.title}`,
    row.host ? `Host/brand: ${row.host}` : null,
    row.location ? `Location: ${row.location}` : null,
    row.admin_tags?.length ? `Tags: ${row.admin_tags.join(", ")}` : null,
    row.real_rsvps != null ? `Real RSVPs: ${row.real_rsvps}${row.pulled != null ? `, actually showed (pulled up): ${row.pulled}` : ""}` : null,
    row.hostedby_partners ? `Partner brands (from page): ${j(row.hostedby_partners)}` : null,
    row.spotify_embeds ? `Music/artist embeds: ${j(row.spotify_embeds)}` : null,
    row.content_text ? `\nPage content:\n${row.content_text}` : `\n(No authored page content — characterize from title/tags/host/venue only, at LOWER confidence.)`,
  ].filter(Boolean);
  return lines.join("\n");
}

function buildHostBrief(row) {
  const lines = [
    `Host: ${row.name || "(unnamed)"}`,
    row.city ? `City: ${row.city}` : null,
    row.host_brief ? `Stated brief (their own words):\n${row.host_brief}` : "Stated brief: (none written)",
    row.bio ? `Bio: ${row.bio}` : null,
    `Events authored: ${row.n_events ?? 0} (drafts: ${row.n_drafts ?? 0})`,
    row.authored_rooms ? `Authored rooms (incl. drafts = intent):\n${j(row.authored_rooms)}` : null,
    row.voice_samples ? `VOICE — recent campaign copy they wrote (weight heavily):\n${j(row.voice_samples)}` : "Voice samples: (none)",
    row.mcp_tool_usage ? `How they operate (MCP tool usage): ${j(row.mcp_tool_usage)}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function buildPersonBrief(row) {
  const lines = [
    `Person: ${row.name || "(no name)"}`,
    `Intent/effort signals: has_email=${row.has_email}, email_domain=${row.email_domain || "—"}, has_full_name=${row.has_full_name}, has_socials=${row.has_socials}, has_company=${row.has_company}, total_spend=${row.total_spend ?? 0}, marketing_consent=${row.marketing_consent}`,
    `Activity arc: n_events=${row.n_events ?? 0}, n_hosts=${row.n_hosts ?? 0}, events_browsed=${row.events_browsed ?? 0}, first_event=${row.first_event_at || "—"}, last_event=${row.last_event_at || "—"}`,
    row.host_affinity ? `Host-affinity (host -> times attended): ${j(row.host_affinity)}` : null,
    row.interested_in ? `Stated interests (free text): ${row.interested_in}` : null,
    row.tags?.length ? `Tags: ${row.tags.join(", ")}` : null,
    row.attended_rooms ? `\nRooms they chose, WITH each room's characterization (seed their taste from these):\n${j(row.attended_rooms)}` : "\n(No attended rooms.)",
  ].filter(Boolean);
  return lines.join("\n");
}

const BUILDERS = { room: buildRoomBrief, host: buildHostBrief, person: buildPersonBrief };

// Stable hash of the assembled input — lets the runner skip re-characterizing unchanged subjects.
export function contentHash(subjectType, userMessage) {
  return crypto.createHash("sha256").update(`${subjectType}\n${userMessage}`).digest("hex");
}

// Build the user message + its hash WITHOUT calling the model. The runner uses this to
// skip subjects whose assembled input is unchanged (cost-free idempotency).
export function assembleInput(subjectType, inputRow) {
  const builder = BUILDERS[subjectType];
  if (!builder) throw new Error(`Unknown subjectType: ${subjectType}`);
  const userMessage = builder(inputRow);
  return { userMessage, contentHash: contentHash(subjectType, userMessage) };
}

// Characterize one subject. Returns { characterization, confidence, evidence, notes,
// model, promptVersion, contentHash, userMessage } — caller writes it into `vectors`.
export async function characterize(subjectType, inputRow) {
  const system = SYSTEM_PROMPTS[subjectType];
  if (!system) throw new Error(`Unknown subjectType: ${subjectType}`);

  const { userMessage, contentHash: hash } = assembleInput(subjectType, inputRow);
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = (response.content || []).find((b) => b.type === "text");
  if (!textBlock?.text) throw new Error("Empty model response");

  let parsed;
  try {
    const raw = textBlock.text.trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch (err) {
    console.error("[characterization] parse failed:", textBlock.text);
    throw err;
  }

  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = null;
  else confidence = Math.max(0, Math.min(1, confidence));

  return {
    characterization: String(parsed.characterization || "").trim(),
    confidence,
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
    notes: parsed.notes ? String(parsed.notes) : null,
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    contentHash: hash,
    userMessage,
  };
}
