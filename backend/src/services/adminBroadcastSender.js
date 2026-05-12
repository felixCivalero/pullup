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
import { applyHostFilters, dedupHostsWinning } from "./adminAudienceFilters.js";

// Build the platform-wide audience for an admin broadcast. Filter set
// mirrors the per-person metadata visible in the user CRM — admin can
// segment on:
//
//   audienceSource      — 'contacts' | 'hosts' | 'everyone'
//   sendMode            — 'broadcast' | 'internal'
//   excludeHosts        — drop signed-up host accounts (default true, contacts path)
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
//   attendedEventIds    — string[] of specific event UUIDs. Combined with
//                         attendedEventLogic to support both "people who
//                         came to event A or B" cohorts and tighter "came
//                         to A AND B" repeat-attendee cohorts.
//   attendedEventLogic  — 'or' | 'and' (default 'or'). Only used when
//                         attendedEventIds is non-empty.
//
//   Host-source filters (only used when audienceSource is 'hosts' or 'everyone'):
//   hostAccountState    — 'any' | 'never' | 'inactive30d' | 'recent30d'
//   hostEventCount      — 'any' | 'exactly0' | N (number >= 1)
//   hostAccountAge      — 'any' | 'lte30d' | '30to90d' | 'gt90d'
//   hostLeadStatuses    — string[] of sales_leads.status values
export async function getAdminAudience(filterCriteria = {}) {
  const {
    audienceSource = "contacts",
    sendMode = "broadcast",
    excludeHosts = true,
    marketingConsent = "any",
    importSource = null,
    minEventsAttended = 0,
    hasPaid = false,
    minTotalSpend = 0,
    joinedAfter = null,
    attendedEventTags = [],
    attendedEventIds = [],
    attendedEventLogic = "or",
    // Host-source filters
    hostAccountState = "any",
    hostEventCount = "any",
    hostAccountAge = "any",
    hostLeadStatuses = [],
  } = filterCriteria;

  if (audienceSource === "hosts") {
    return getHostAudience({
      hostAccountState, hostEventCount, hostAccountAge, hostLeadStatuses,
      sendMode,
    });
  }
  if (audienceSource === "everyone") {
    return getEveryoneAudience({
      hostAccountState, hostEventCount, hostAccountAge, hostLeadStatuses,
      marketingConsent, importSource, minEventsAttended, hasPaid, minTotalSpend,
      joinedAfter, attendedEventTags, attendedEventIds, attendedEventLogic,
      sendMode,
    });
  }
  // Fall through: existing "contacts" path below.

  return getContactsAudience({
    excludeHosts, marketingConsent, importSource, minEventsAttended,
    hasPaid, minTotalSpend, joinedAfter,
    attendedEventTags, attendedEventIds, attendedEventLogic, sendMode,
  });
}

// Pull every signed-up host from `profiles`, enrich with event counts and
// (optionally) sales-lead status, then apply admin's host filters. Email
// comes from profiles.contact_email with auth.users.email as fallback.
async function getHostAudience({
  hostAccountState = "any",
  hostEventCount = "any",
  hostAccountAge = "any",
  hostLeadStatuses = [],
  sendMode = "broadcast",
}) {
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, name, brand, contact_email, created_at, last_login_at, login_count")
    .limit(100000);
  if (profErr) throw profErr;

  const missingEmail = (profiles || []).filter((p) => !p.contact_email);
  let authEmailById = {};
  if (missingEmail.length > 0) {
    try {
      const { data: au } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      for (const u of au?.users || []) {
        if (u.email) authEmailById[u.id] = u.email;
      }
    } catch {
      // Non-fatal — profiles with no contact_email AND no auth email are skipped.
    }
  }

  const { data: events } = await supabase
    .from("events")
    .select("host_id")
    .limit(100000);
  const eventCountByHost = {};
  for (const e of events || []) {
    if (!e.host_id) continue;
    eventCountByHost[e.host_id] = (eventCountByHost[e.host_id] || 0) + 1;
  }

  let leadStatusByProfile = {};
  if (Array.isArray(hostLeadStatuses) && hostLeadStatuses.length > 0) {
    const { data: leads } = await supabase
      .from("sales_leads")
      .select("profile_id, status")
      .not("profile_id", "is", null)
      .limit(100000);
    for (const l of leads || []) {
      if (l.profile_id && l.status) leadStatusByProfile[l.profile_id] = l.status;
    }
  }

  const candidates = [];
  for (const p of profiles || []) {
    const email = (p.contact_email || authEmailById[p.id] || "").toLowerCase().trim();
    if (!email) continue;
    candidates.push({
      id: p.id,
      profile_id: p.id,
      email,
      name: p.name || p.brand || "",
      marketing_consent: null,
      last_login_at: p.last_login_at || null,
      login_count: p.login_count || 0,
      created_at: p.created_at,
      event_count: eventCountByHost[p.id] || 0,
      lead_status: leadStatusByProfile[p.id] || null,
      _source: "host",
    });
  }

  // Strip do_not_contact / marketing_unsubscribed_at by joining people on email.
  const emails = candidates.map((c) => c.email);
  if (emails.length > 0) {
    const { data: blocked } = await supabase
      .from("people")
      .select("email, do_not_contact, marketing_unsubscribed_at, marketing_consent")
      .in("email", emails);
    const blockedSet = new Set();
    const consentByEmail = {};
    for (const b of blocked || []) {
      const k = (b.email || "").toLowerCase().trim();
      if (!k) continue;
      if (b.do_not_contact === true || b.marketing_unsubscribed_at) blockedSet.add(k);
      if (typeof b.marketing_consent === "boolean") consentByEmail[k] = b.marketing_consent;
    }
    for (const c of candidates) {
      if (consentByEmail[c.email] != null) c.marketing_consent = consentByEmail[c.email];
    }
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      if (blockedSet.has(candidates[i].email)) candidates.splice(i, 1);
    }
  }

  return applyHostFilters(candidates, {
    hostAccountState, hostEventCount, hostAccountAge, hostLeadStatuses, sendMode,
  });
}

async function getContactsAudience({
  excludeHosts = true,
  marketingConsent = "any",
  importSource = null,
  minEventsAttended = 0,
  hasPaid = false,
  minTotalSpend = 0,
  joinedAfter = null,
  attendedEventTags = [],
  attendedEventIds = [],
  attendedEventLogic = "or",
  sendMode = "broadcast",
}) {
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

  if (sendMode !== "internal" && marketingConsent === "optedIn") {
    query = query.eq("marketing_consent", true);
  }
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
    (Array.isArray(attendedEventTags) && attendedEventTags.length > 0) ||
    (Array.isArray(attendedEventIds) && attendedEventIds.length > 0);

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

    // Specific-event filter — admin picks individual events from the
    // typeahead. OR keeps people who attended any of them; AND keeps
    // people who attended every one.
    if (Array.isArray(attendedEventIds) && attendedEventIds.length > 0) {
      const wantedIds = new Set(attendedEventIds);
      const useAnd = String(attendedEventLogic).toLowerCase() === "and";
      eligible = eligible.filter((p) => {
        const attended = new Set(eventsByPerson[p.id] || []);
        if (useAnd) {
          for (const id of wantedIds) if (!attended.has(id)) return false;
          return true;
        }
        for (const id of wantedIds) if (attended.has(id)) return true;
        return false;
      });
    }
  }

  return eligible;
}

async function getEveryoneAudience(opts) {
  const hosts = await getHostAudience(opts);
  // excludeHosts=false because dedupHostsWinning handles host/contact overlap.
  // If excludeHosts=true, a host who is also in people would be dropped before dedup.
  const contacts = await getContactsAudience({ ...opts, excludeHosts: false });
  return dedupHostsWinning(hosts, contacts);
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

    const sendMode = campaign.filterCriteria?.sendMode === "internal"
      ? "internal"
      : "broadcast";
    const campaignTag = sendMode === "internal"
      ? `admin_internal_${campaignId}`
      : `admin_broadcast_${campaignId}`;
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
          let personId = person.id;
          if (person._source === "host") {
            const { data: upserted } = await supabase
              .from("people")
              .upsert(
                {
                  email: person.email,
                  name: person.name || null,
                  import_source: "host_account",
                },
                { onConflict: "email" },
              )
              .select("id")
              .single();
            if (upserted?.id) personId = upserted.id;
          }

          const unsubscribeToken = sendMode === "internal"
            ? null
            : await ensureUnsubscribeToken(personId);
          const unsubscribeUrl = unsubscribeToken
            ? `${frontendBaseUrl}/u/${unsubscribeToken}`
            : null;

          const html = renderFollowUpEmailTemplate({
            templateContent: sanitizedTemplateContent,
            person,
            event: null,
            baseUrl: backendBaseUrl,
            unsubscribeUrl,
          });

          const campaignSend = await recordEmailSend({
            personId,
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
            idempotencyKey: `${campaign.id}:${personId}`,
            category: sendMode === "internal" ? "transactional" : "newsletter",
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
