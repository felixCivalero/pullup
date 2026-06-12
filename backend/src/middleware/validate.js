// zod at the route boundary: malformed input fails as a clean 400 naming the
// bad field, instead of a 500 from deep inside a handler. The middleware
// VALIDATES but never mutates req.body (zod would strip unknown keys, and
// several handlers legitimately read fields beyond their schema) — handlers
// keep their own normalisation.
import { z } from "zod";

export function validate(schema) {
  return (req, res, next) => {
    const r = schema.safeParse(req.body || {});
    if (!r.success) {
      const issues = r.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "body"}: ${i.message}`);
      return res.status(400).json({ error: "invalid_input", issues });
    }
    next();
  };
}

// ── Schemas for the top write endpoints ─────────────────────────────────────
// Deliberately permissive: type + length sanity only. Business rules (who may
// post, which fields persist) stay in the handlers/services where they live.

const uuidish = z.string().uuid();

export const spaceMessageSchema = z.object({
  body: z.string().max(8000).nullish(),
  parentId: uuidish.nullish(),
  channelId: uuidish.nullish(),
  pinned: z.boolean().nullish(),
  media: z
    .array(
      z.object({
        url: z.string().max(2048),
        type: z.string().max(20).nullish(),
      }),
    )
    .max(12)
    .nullish(),
});

export const personUpdateSchema = z.object({
  name: z.string().max(200).nullish(),
  phone: z.string().max(40).nullish(),
  tags: z.array(z.string().max(60)).max(50).nullish(),
  instagram: z.string().max(80).nullish(),
  twitter: z.string().max(80).nullish(),
  tiktok: z.string().max(80).nullish(),
  linkedin: z.string().max(200).nullish(),
  company: z.string().max(200).nullish(),
  birthday: z.string().max(40).nullish(),
});

export const commentTriggerSchema = z.object({
  eventId: uuidish,
  keyword: z.string().max(80).nullish(),
  match: z.string().max(20).nullish(),
  replyText: z.string().max(2000).nullish(),
  mediaId: z.string().max(100).nullish(),
  triggerType: z.string().max(30).nullish(),
  flow: z.record(z.string(), z.unknown()).nullish(),
});

export const commentTriggerPatchSchema = commentTriggerSchema.partial();
