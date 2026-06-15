// Community routes — the public join page + host management.
//
//   GET  /host/community            host: get-or-create my community
//   PUT  /host/community            host: edit title/blurb/brand/slug/enabled
//   GET  /communities/:slug         public: the join page payload
//   POST /communities/:slug/join    public: join (runs the identity spine)
//
// Joining reuses the exact RSVP identity spine (findOrCreatePerson →
// ensureAccountForPerson → linkIdentitiesToPerson → logPersonEvent) so a
// community member is the same first-class person atom as an RSVP'er — just a
// different, durable edge (community_members) instead of an event RSVP.
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { logger } from "../logger.js";
import { findOrCreatePerson } from "../repos/people.js";
import { getUserProfile } from "../repos/profiles.js";
import { isValidEmail, normalizeEmail, ensureAccountForPerson } from "../services/account.js";
import { logPersonEvent } from "../services/personTimeline.js";
import { normalisePhone } from "../utils/phone.js";
import { APP_BASE_URL } from "../whatsapp/config.js";
import {
  ensureCommunityForHost,
  getCommunityByHostId,
  getCommunityBySlug,
  updateCommunityForHost,
  addCommunityMember,
  getCommunityMemberSummary,
} from "../repos/communities.js";

function shareUrl(slug) {
  return `${APP_BASE_URL.replace(/\/$/, "")}/c/${slug}`;
}

function extFromMime(m) {
  const map = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
  return map[(m || "").toLowerCase()] || "jpg";
}

// What the host sees when managing their community.
async function hostPayload(community) {
  const summary = community ? await getCommunityMemberSummary(community.id, { recent: 12 }) : { total: 0, recentMembers: [] };
  return {
    ...community,
    shareUrl: community ? shareUrl(community.slug) : null,
    memberCount: summary.total,
    recentMembers: summary.recentMembers,
  };
}

export function registerCommunityRoutes(app) {
  // ── Host: get-or-create my community ──────────────────────────────────────
  app.get("/host/community", requireAuth, async (req, res) => {
    try {
      const profile = await getUserProfile(req.user.id).catch(() => null);
      const community = await ensureCommunityForHost(req.user.id, {
        hostName: profile?.name || profile?.brand || null,
      });
      if (!community) return res.status(500).json({ error: "community_unavailable" });
      res.json(await hostPayload(community));
    } catch (err) {
      logger?.error?.("[GET /host/community] error", { error: err?.message });
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Host: edit my community ───────────────────────────────────────────────
  app.put("/host/community", requireAuth, async (req, res) => {
    try {
      // Make sure it exists first (so a PUT before a GET still works).
      const profile = await getUserProfile(req.user.id).catch(() => null);
      await ensureCommunityForHost(req.user.id, { hostName: profile?.name || profile?.brand || null });

      const { title, blurb, brand, enabled, slug, coverImageUrl, status } = req.body || {};
      const fields = {};
      if (title !== undefined) fields.title = title;
      if (blurb !== undefined) fields.blurb = blurb;
      if (brand !== undefined) fields.brand = brand;
      if (enabled !== undefined) fields.enabled = !!enabled;
      if (slug !== undefined) fields.slug = slug;
      if (coverImageUrl !== undefined) fields.coverImageUrl = coverImageUrl;
      if (status !== undefined) fields.status = status;

      const result = await updateCommunityForHost(req.user.id, fields);
      if (result?.error === "slug_taken") return res.status(409).json({ error: "slug_taken" });
      if (result?.error) return res.status(500).json({ error: result.error });
      res.json(await hostPayload(result));
    } catch (err) {
      logger?.error?.("[PUT /host/community] error", { error: err?.message });
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Host: cover image — mint a signed direct-to-Supabase upload URL ───────
  // (mirrors the event cover pipeline; reuses the event-images bucket).
  app.post("/host/community/cover-token", requireAuth, async (req, res) => {
    try {
      const profile = await getUserProfile(req.user.id).catch(() => null);
      const community = await ensureCommunityForHost(req.user.id, { hostName: profile?.name || profile?.brand || null });
      if (!community) return res.status(500).json({ error: "community_unavailable" });

      const ext = extFromMime(req.body?.mimeType);
      const path = `community/${community.id}/cover_${Date.now()}.${ext}`;
      const { supabase } = await import("../supabase.js");
      const { data, error } = await supabase.storage.from("event-images").createSignedUploadUrl(path);
      if (error || !data) {
        logger?.error?.("[community cover-token] failed", { error: error?.message });
        return res.status(500).json({ error: "Could not mint upload URL" });
      }
      res.json({ path, token: data.token, uploadUrl: data.signedUrl });
    } catch (err) {
      logger?.error?.("[POST /host/community/cover-token] error", { error: err?.message });
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Host: cover image — finalize (resolve public URL + save on community) ──
  app.post("/host/community/cover", requireAuth, async (req, res) => {
    try {
      const { storagePath } = req.body || {};
      if (!storagePath || typeof storagePath !== "string") return res.status(400).json({ error: "missing_path" });
      const { supabase } = await import("../supabase.js");
      const { data: { publicUrl } } = supabase.storage.from("event-images").getPublicUrl(storagePath);
      const result = await updateCommunityForHost(req.user.id, { coverImageUrl: publicUrl });
      if (result?.error) return res.status(500).json({ error: result.error });
      res.json(await hostPayload(result));
    } catch (err) {
      logger?.error?.("[POST /host/community/cover] error", { error: err?.message });
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Public: the join page payload (safe to serve crawlers — no token) ─────
  app.get("/communities/:slug", optionalAuth, async (req, res) => {
    try {
      const community = await getCommunityBySlug(req.params.slug);
      // Only a PUBLISHED community is publicly reachable (drafts 404 like events).
      if (!community || community.status !== "published" || community.enabled === false) {
        return res.status(404).json({ error: "not_found" });
      }
      const host = await getUserProfile(community.hostId).catch(() => null);
      const summary = await getCommunityMemberSummary(community.id, { recent: 8 });
      res.json({
        id: community.id,
        slug: community.slug,
        title: community.title,
        blurb: community.blurb,
        brand: community.brand || null,
        coverImageUrl: community.coverImageUrl || null,
        host: {
          name: host?.name || host?.brand || null,
          brand: host?.brand || null,
          avatarUrl: host?.profilePicture || null,
          links: host?.brandingLinks || null,
        },
        memberCount: summary.total,
        recentMembers: summary.recentMembers,
      });
    } catch (err) {
      logger?.error?.("[GET /communities/:slug] error", { error: err?.message });
      res.status(500).json({ error: "failed" });
    }
  });

  // ── Public: join the community ────────────────────────────────────────────
  app.post("/communities/:slug/join", async (req, res) => {
    try {
      const community = await getCommunityBySlug(req.params.slug);
      if (!community || community.status !== "published" || community.enabled === false) {
        return res.status(404).json({ error: "not_found" });
      }

      const { name, email, phone, instagram, igUid, visitorId, source } = req.body || {};
      const normEmail = normalizeEmail(email);
      if (!isValidEmail(normEmail)) return res.status(400).json({ error: "invalid_email" });

      // 1) Person (find-or-create, same as RSVP).
      const person = await findOrCreatePerson(normEmail, name || null);
      if (!person?.id) return res.status(500).json({ error: "person_failed" });

      // 2) Membership edge (idempotent).
      const { membership, created } = await addCommunityMember(community.id, person.id, {
        source: typeof source === "string" ? source.slice(0, 40) : "link",
      });
      if (!membership) return res.status(500).json({ error: "join_failed" });

      // 3) Passwordless account (best-effort), so they can step into the room.
      await ensureAccountForPerson({ personId: person.id, email: normEmail, name: name || null }).catch(() => null);

      // 4) Link identity anchors the same way RSVP does (never auto-merges).
      try {
        const pn = phone ? normalisePhone(phone, null) : null;
        const e164 = pn?.ok ? pn.e164 : null;
        const igHandle = instagram ? String(instagram).trim().replace(/^@+/, "").slice(0, 64) : null;
        const igUserId = igUid ? String(igUid).slice(0, 64) : null;
        const { linkIdentitiesToPerson } = await import("../services/personResolution.js");
        await linkIdentitiesToPerson({
          personId: person.id,
          identifiers: { email: normEmail, phone: e164, igUserId, igHandle },
          profile: { name: name || null, email: normEmail, phone_e164: e164, instagram: igHandle, ig_user_id: igUserId },
          source: "community",
        });
      } catch (linkErr) {
        logger?.warn?.("[community join] identity link failed", { error: linkErr?.message });
      }

      // 5) Timeline (dedupe on membership id so a re-join never double-logs).
      const title = community.title || "the community";
      await logPersonEvent({
        personId: person.id,
        hostId: community.hostId,
        eventId: null,
        type: "community_join",
        channel: "web",
        body: `Joined ${title}`,
        metadata: { community_id: community.id, community_title: title, source: "community_endpoint", visitor_id: visitorId || null },
        dedupeKey: `community_join:${membership.id}`,
      }).catch(() => null);

      res.json({
        ok: true,
        alreadyMember: !created,
        community: { id: community.id, slug: community.slug, title: community.title },
        membership: { id: membership.id, personId: person.id, joinedAt: membership.joined_at, status: membership.status },
      });
    } catch (err) {
      logger?.error?.("[POST /communities/:slug/join] error", { error: err?.message });
      res.status(500).json({ error: "failed" });
    }
  });
}
