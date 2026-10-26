// Everything PullUp can do, described once. An action is what a person can do
// on the site, written so their assistant can do it too: a name, a sentence
// an AI reads to decide when to use it, an input schema (zod — validated
// here, and published as JSON Schema), who may run it, and what it does to
// the world. Three doors run the same list:
//   routes/mcp.js      remote MCP (Claude, ChatGPT … from anywhere)
//   routes/actions.js  WebMCP: an assistant in the person's browser
//   (the site's own pages keep their routes; both call repos/*)
//
// access:  "public"  anyone, signed in or not (a guest, a visitor)
//          "user"    any signed-in person, on their own events
//          "owner"   Felix only (his sales, statistics …)
// effect:  "read"    changes nothing
//          "write"   changes the caller's own data on PullUp
//          "send"    reaches people outside, or costs money — can't be undone
import crypto from "crypto";
import { z } from "zod";
import { supabase } from "../supabase.js";
import { ActionError } from "../lib/actionError.js";

const ACCESS = new Set(["public", "user", "owner"]);
const EFFECT = new Set(["read", "write", "send"]);
const NAME = /^[a-z][a-z0-9_]{2,47}$/;

export function defineAction(spec) {
  const { name, title, description, access, effect, input, run } = spec;
  if (!NAME.test(name)) throw new Error(`action name "${name}" must be snake_case`);
  if (!title || !description) throw new Error(`action ${name} needs a title and a description`);
  if (!ACCESS.has(access) || !EFFECT.has(effect)) throw new Error(`action ${name}: bad access/effect`);
  if (!(input instanceof z.ZodObject)) throw new Error(`action ${name}: input must be a z.object`);
  if (typeof run !== "function") throw new Error(`action ${name}: run must be a function`);
  return Object.freeze({ untrustedOutput: false, ...spec, input: input.strict() });
}

export const canRun = (action, caller) =>
  action.access === "public" || (action.access === "user" && !!caller) || (action.access === "owner" && !!caller?.isOwner);

// MCP tool annotations (spec 2025-06-18) and WebMCP's ToolAnnotations
// describe the same thing in two vocabularies.
export function mcpAnnotations(action) {
  return {
    title: action.title,
    readOnlyHint: action.effect === "read",
    destructiveHint: action.effect === "send",
    idempotentHint: action.effect === "read" || !!action.idempotent,
    openWorldHint: action.effect === "send",
  };
}

export function webmcpAnnotations(action) {
  return {
    readOnlyHint: action.effect === "read",
    consequentialHint: action.effect === "send",
    untrustedContentHint: !!action.untrustedOutput,
  };
}

export const jsonSchema = (action) => z.toJSONSchema(action.input, { target: "draft-7", io: "input" });

// How the catalog is shown to a door: name, title, description, JSON Schema.
export function describe(action) {
  return {
    name: action.name,
    title: action.title,
    description: action.description,
    access: action.access,
    effect: action.effect,
    inputSchema: jsonSchema(action),
    annotations: webmcpAnnotations(action),
  };
}

// A burst limit per caller (or per IP when signed out), across all doors:
// generous for a person or an assistant working, a wall for a runaway loop.
const WINDOW_MS = 60_000;
const PER_WINDOW = { read: 120, write: 40, send: 10 };
const buckets = new Map();
function overLimit(key, effect) {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  const k = `${key}:${effect}`;
  const b = buckets.get(k)?.resetAt > now ? buckets.get(k) : { count: 0, resetAt: now + WINDOW_MS };
  b.count += 1;
  buckets.set(k, b);
  return b.count > PER_WINDOW[effect];
}

function zodMessage(error) {
  return error.issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}

// Every assistant call is logged (agent_calls). Fire and forget.
function logCall({ ctx, name, ok, ms, error }) {
  if (ctx.door === "http") return;
  supabase.from("agent_calls").insert({
    user_id: ctx.caller?.userId || null,
    client_id: ctx.clientId || null,
    door: ctx.door,
    action: name,
    ok,
    ms,
    error: error ? String(error).slice(0, 300) : null,
  }).then(({ error: e }) => e && console.error("[actions] log failed:", e.message), () => {});
}

// Run one action for a caller. ctx = { caller | null, door, clientId?, ip? }.
// → the action's result, or throws an ActionError (never a raw error).
export async function runAction(actions, name, rawInput, ctx) {
  const started = Date.now();
  const action = actions.get(name);
  try {
    if (!action) throw new ActionError("not_found", `There is no action called "${name}".`);
    if (!canRun(action, ctx.caller)) {
      throw ctx.caller
        ? new ActionError("forbidden", "This account can't do that.")
        : new ActionError("unauthenticated", "Sign in first: this needs a PullUp account.");
    }
    if (overLimit(ctx.caller?.userId || ctx.ip || "anon", action.effect)) {
      throw new ActionError("rate_limited", "Too many calls in a short time. Wait a minute and try again.");
    }
    const parsed = action.input.safeParse(rawInput ?? {});
    if (!parsed.success) throw new ActionError("invalid", `The input isn't right: ${zodMessage(parsed.error)}`);
    const result = await action.run(parsed.data, ctx);
    logCall({ ctx, name, ok: true, ms: Date.now() - started });
    return result;
  } catch (err) {
    const known = err instanceof ActionError;
    if (!known) {
      const ref = crypto.randomBytes(4).toString("hex");
      console.error(`[actions] ${name} failed (${ref}):`, err?.message);
      err = new ActionError("failed", `Something went wrong on PullUp's side (ref ${ref}). Try again in a moment.`);
    }
    logCall({ ctx, name, ok: false, ms: Date.now() - started, error: `${err.code}: ${err.message}` });
    throw err;
  }
}
