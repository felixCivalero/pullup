// backend/src/services/adminBroadcastSender.js
//
// Admin platform-wide email broadcasts. Mirrors the host campaignSender
// pattern but pulls from the entire `people` table (minus host accounts
// and unsubscribers) instead of a single host's audience. Used by the
// /admin/email page so admin can broadcast to any segment of users.
//
// Strategic decisions baked in:
//   * Audience excludes anyone whose email matches an auth.users record
//     (i.e. signed-up hosts — broadcasting to them would feel weird since
//     they're our customers, not our marketing list).
//   * Audience always excludes do_not_contact = true and
//     marketing_unsubscribed_at IS NOT NULL — admin-overridable would be
//     a compliance landmine.
//   * Each broadcast gets a unique campaign_tag of `admin_broadcast_<id>`
//     so the existing tracking/analytics pipeline picks them up cleanly.
import {
  getEmailCampaign,
  updateEmailCampaignStatus,
  recordEmailSend,
  ensureUnsubscribeToken,
} from "../data.js";
import { enqueueOutbox } from "../email/index.js";
import { renderFollowUpEmailTemplate } from "./followUpTemplateService.js";
import { addTracking } from "../email/tracking/linkRewriter.js";
import { sanitizeBlockUrls } from "./imageUrlSanitizer.js";
import { supabase } from "../supabase.js";
import { buildFromHeader } from "./campaignSender.js";

// Build the platform-wide audience for an admin broadcast. Filter set
// mirrors the per-person metadata visible in the user CRM — admin can
// segment on:
//
//   excludeHosts        — drop signed-up host accounts (default true)
//   marketingConsent    — 'any' | 'optedIn'
//   importSource        — match people.import_source exactly
//   minEventsAttended   — at least N RSVPs across the platform
//   hasPaid             — payment_count >= 1
//   minTotalSpend       — total_spend >= cents
//   joinedAfter         — people.created_at >= ISO date
//   attendedEventTags   — string[] of admin_tags. OR semantics: include
//                         anyone who's RSVP'd to at least one event
//                         tagged with one of these. The "what kind of
//                         events do they like" segmenter Felix asked for.
export async function getAdminAudience(filterCriteria = {}) {
  const {
    excludeHosts = true,
    marketingConsent = "any",
    importSource = null,
    minEventsAttended = 0,
    hasPaid = false,
    minTotalSpend = 0,
    joinedAfter = null,
    attendedEventTags = [],
  } = filterCriteria;

  let hostEmails = new Set();
  if (excludeHosts) {
    try {
      const { data: au } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      for (const u of au?.users || []) {
        if (u.email) hostEmails.add(u.email.toLowerCase().trim());
      }
    } catch {
      // Non-fatal — fall through with empty set.
    }
  }

  let query = supabase
    .from("people")
    .select(
      "id, email, name, phone, marketing_consent, marketing_unsubscribed_at, do_not_contact, payment_count, total_spend, tags, created_at, import_source",
    )
    .or("do_not_contact.is.null,do_not_contact.eq.false")
    .is("marketing_unsubscribed_at", null);

  if (marketingConsent === "optedIn") query = query.eq("marketing_consent", true);
  if (importSource) query = query.eq("import_source", importSource);
  if (hasPaid) query = query.gte("payment_count", 1);
  if (Number(minTotalSpend) > 0) query = query.gte("total_spend", Number(minTotalSpend));
  if (joinedAfter) query = query.gte("created_at", joinedAfter);

  const { data, error } = await query.limit(100000);
  if (error) throw error;

  const seen = new Set();
  let eligible = [];
  for (const p of data || []) {
    if (!p.email) continue;
    const norm = p.email.toLowerCase().trim();
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (excludeHosts && hostEmails.has(norm)) continue;
    eligible.push(p);
  }

  // Behavioral filters require joining rsvps + events. Scope the join to
  // the candidate person set so we don't pull the entire RSVP table when
  // no behavioral filter is active.
  const needsBehavioral =
    Number(minEventsAttended) > 0 ||
    (Array.isArray(attendedEventTags) && attendedEventTags.length > 0);

  if (needsBehavioral && eligible.length > 0) {
    // Pull ALL rsvps + tagged events without an .in() filter on person_id —
    // PostgREST silently truncates GET URLs around 8 kB, and 400+ uuid
    // ids blow past that, which would silently return zero rsvps and
    // exclude everyone from the audience. The rsvps + events tables
    // are small at PullUp scale so this is cheaper than chunking.
    const eligibleSet = new Set(eligible.map((p) => p.id));
    const { data: rsvps, error: rsvpErr } = await supabase
      .from("rsvps")
      .select("person_id, event_id")
      .limit(100000);
    if (rsvpErr) {
      console.warn("[adminAudience] rsvps query failed:", rsvpErr.message);
    }
    const eventsByPerson = {};
    const allEventIds = new Set();
    for (const r of rsvps || []) {
      if (!r.person_id || !r.event_id) continue;
      if (!eligibleSet.has(r.person_id)) continue;
      if (!eventsByPerson[r.person_id]) eventsByPerson[r.person_id] = [];
      eventsByPerson[r.person_id].push(r.event_id);
      allEventIds.add(r.event_id);
    }

    if (Number(minEventsAttended) > 0) {
      eligible = eligible.filter(
        (p) => (eventsByPerson[p.id]?.length || 0) >= Number(minEventsAttended),
      );
    }

    if (Array.isArray(attendedEventTags) && attendedEventTags.length > 0) {
      // Pull every tagged event in one go and look up by id locally.
      const { data: events, error: evErr } = await supabase
        .from("events")
        .select("id, admin_tags")
        .not("admin_tags", "is", null)
        .limit(100000);
      if (evErr) {
        console.warn("[adminAudience] events query failed:", evErr.message);
      }
      const tagsByEvent = {};
      for (const e of events || []) {
        tagsByEvent[e.id] = Array.isArray(e.admin_tags) ? e.admin_tags : [];
      }
      const wanted = new Set(attendedEventTags);
      eligible = eligible.filter((p) => {
        const eids = eventsByPerson[p.id] || [];
        return eids.some((eid) => (tagsByEvent[eid] || []).some((t) => wanted.has(t)));
      });
    }
  }

  return eligible;
}

export async function sendAdminBroadcastInBatches(
  campaignId,
  adminUserId,
  batchSize = 50,
  delayMs = 1000,
) {
  try {
    const campaign = await getEmailCampaign(campaignId, adminUserId);
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status !== "queued" && campaign.status !== "sending") {
      throw new Error(
        `Campaign is not in a sendable state: ${campaign.status}`,
      );
    }
    await updateEmailCampaignStatus(campaignId, "sending");

    const campaignTag = `admin_broadcast_${campaignId}`;
    const backendBaseUrl =
      process.env.NODE_ENV === "production"
        ? process.env.BACKEND_URL || "https://pullup.se/api"
        : "http://localhost:3001";
    const frontendBaseUrl =
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL || "https://pullup.se"
        : "http://localhost:5173";

    const eligible = await getAdminAudience(campaign.filterCriteria || {});
    if (eligible.length === 0) {
      await updateEmailCampaignStatus(campaignId, "sent", {
        totalSent: 0,
        totalFailed: 0,
      });
      return { sent: 0, failed: 0, total: 0 };
    }

    const sanitizedTemplateContent = {
      ...campaign.templateContent,
      blocks: sanitizeBlockUrls(campaign.templateContent?.blocks),
    };
    const fromHeader = buildFromHeader(sanitizedTemplateContent?.fromName);

    let totalSent = 0;
    let totalFailed = 0;
    const errors = [];

    for (let i = 0; i < eligible.length; i += batchSize) {
      const batch = eligible.slice(i, i + batchSize);
      const batchPromises = batch.map(async (person) => {
        try {
          const unsubscribeToken = await ensureUnsubscribeToken(person.id);
          const unsubscribeUrl = `${frontendBaseUrl}/u/${unsubscribeToken}`;

          const html = renderFollowUpEmailTemplate({
            templateContent: sanitizedTemplateContent,
            person,
            event: null,
            baseUrl: backendBaseUrl,
            unsubscribeUrl,
          });

          const campaignSend = await recordEmailSend({
            personId: person.id,
            campaignId: campaign.id,
            email: person.email,
            subject: campaign.subject,
            status: "sent",
          });

          const outboxRow = await enqueueOutbox({
            fromEmail: fromHeader,
            toEmail: person.email,
            subject: campaign.subject,
            htmlBody: html,
            textBody: null,
            campaignSendId: campaignSend?.id || null,
            idempotencyKey: `${campaign.id}:${person.id}`,
            category: "newsletter",
            campaignTag,
          });

          if (outboxRow?.tracking_id && html) {
            try {
              const trackedHtml = addTracking(html, {
                trackingId: outboxRow.tracking_id,
                baseUrl: backendBaseUrl,
                campaignTag,
              });
              await supabase
                .from("email_outbox")
                .update({ html_body: trackedHtml })
                .eq("id", outboxRow.id);
            } catch (trackErr) {
              console.error(
                "[adminBroadcast] Tracking injection failed for",
                person.email,
                trackErr.message,
              );
            }
          }

          totalSent += 1;
          return { success: true };
        } catch (error) {
          totalFailed += 1;
          errors.push({
            email: person.email,
            error: error.message || "Unknown error",
          });
          return { success: false };
        }
      });
      await Promise.all(batchPromises);
      await updateEmailCampaignStatus(campaignId, "sending", {
        totalSent,
        totalFailed,
      });
      if (i + batchSize < eligible.length) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    await updateEmailCampaignStatus(campaignId, "sent", {
      totalSent,
      totalFailed,
      sentAt: new Date().toISOString(),
    });
    return { sent: totalSent, failed: totalFailed, total: eligible.length };
  } catch (error) {
    console.error("[adminBroadcast] error:", error);
    try {
      await updateEmailCampaignStatus(campaignId, "failed");
    } catch {}
    throw error;
  }
}
