// backend/src/services/campaignSender.js
import { getEmailCampaign, updateEmailCampaignStatus } from "../data.js";
import { getPeopleWithFilters, recordEmailSend } from "../data.js";
import { findEventById } from "../data.js";
import { addCampaignToPeople } from "../data.js";
import { ensureUnsubscribeToken } from "../data.js";
import { enqueueOutbox } from "../email/index.js";
import { renderEventEmailTemplate } from "./emailTemplateService.js";
import { renderFollowUpEmailTemplate } from "./followUpTemplateService.js";
import { addTracking } from "../email/tracking/linkRewriter.js";
import { sanitizeBlockUrls } from "./imageUrlSanitizer.js";

/**
 * Send campaign in batches
 * @param {string} campaignId - Campaign ID
 * @param {number} batchSize - Number of emails per batch (default 50)
 * @param {number} delayMs - Delay between batches in milliseconds (default 1000)
 */
export async function sendCampaignInBatches(
  campaignId,
  userId,
  batchSize = 50,
  delayMs = 1000
) {
  try {
    // 1. Get campaign data (with ownership check)
    const campaign = await getEmailCampaign(campaignId, userId);
    if (!campaign) {
      throw new Error("Campaign not found or access denied");
    }

    if (campaign.status !== "queued" && campaign.status !== "sending") {
      throw new Error(`Campaign is not in a sendable state: ${campaign.status}`);
    }

    // Update status to "sending"
    await updateEmailCampaignStatus(campaignId, "sending");

    // 2. Get event data if event-based campaign
    let event = null;
    if (campaign.templateType === "event" && campaign.eventId) {
      event = await findEventById(campaign.eventId);
      if (!event) {
        throw new Error("Event not found");
      }
    } else if (campaign.templateType === "followup" && campaign.eventId) {
      event = await findEventById(campaign.eventId);
    }

    // Generate campaign tag for tracking
    const campaignTag = `host_campaign_${campaignId}`;
    const backendBaseUrl = process.env.NODE_ENV === "production"
      ? (process.env.BACKEND_URL || "https://pullup.se/api")
      : "http://localhost:3001";

    // 3. Get all recipients using filterCriteria
    const { people } = await getPeopleWithFilters(
      campaign.userId,
      campaign.filterCriteria,
      "created_at",
      "desc",
      100000, // Large limit to get all recipients
      0
    );

    // Filter out anyone who has unsubscribed from marketing. We keep their row
    // intact (history, RSVPs) but skip them at send time.
    const eligible = people.filter((p) => !p.marketing_unsubscribed_at);
    const skippedUnsubscribed = people.length - eligible.length;
    if (skippedUnsubscribed > 0) {
      console.log(`[campaignSender] Skipping ${skippedUnsubscribed} unsubscribed recipients`);
    }

    if (eligible.length === 0) {
      await updateEmailCampaignStatus(campaignId, "sent", {
        totalSent: 0,
        totalFailed: 0,
      });
      return { sent: 0, failed: 0, total: 0 };
    }

    // Frontend URL for the public unsubscribe page
    const frontendBaseUrl = process.env.NODE_ENV === "production"
      ? (process.env.FRONTEND_URL || "https://pullup.se")
      : "http://localhost:5173";

    // Strip expiring tokens from any image URLs in the block payload —
    // host might send hours after composing.
    const sanitizedTemplateContent = {
      ...campaign.templateContent,
      blocks: sanitizeBlockUrls(campaign.templateContent?.blocks),
    };

    // 4. Process in batches
    let totalSent = 0;
    let totalFailed = 0;
    const errors = [];

    for (let i = 0; i < eligible.length; i += batchSize) {
      const batch = eligible.slice(i, i + batchSize);
      const batchPromises = [];

      for (const person of batch) {
        const sendPromise = (async () => {
          try {
            // Mint (or fetch) the per-recipient unsubscribe token so the
            // footer link resolves to /u/:token on the frontend.
            const unsubscribeToken = await ensureUnsubscribeToken(person.id);
            const unsubscribeUrl = `${frontendBaseUrl}/u/${unsubscribeToken}`;

            // Block-based campaigns (any templateType with a blocks[] in
            // templateContent) go through the unified renderer. Legacy event
            // campaigns without blocks fall back to the static event template.
            const useBlockRenderer = Array.isArray(sanitizedTemplateContent?.blocks);
            const html = useBlockRenderer
              ? renderFollowUpEmailTemplate({
                  templateContent: sanitizedTemplateContent,
                  person,
                  event: event || null,
                  baseUrl: backendBaseUrl,
                  unsubscribeUrl,
                })
              : renderEventEmailTemplate({
                  event,
                  templateContent: sanitizedTemplateContent,
                  person,
                  unsubscribeUrl,
                });

            // Record CRM-level send (campaign_sends)
            const campaignSend = await recordEmailSend({
              personId: person.id,
              campaignId: campaign.id,
              email: person.email,
              subject: campaign.subject,
              status: "sent",
            });

            const campaignSendId = campaignSend?.id || null;

            // Enqueue into delivery outbox with campaign tag
            const outboxRow = await enqueueOutbox({
              toEmail: person.email,
              subject: campaign.subject,
              htmlBody: html,
              textBody: null,
              campaignSendId,
              idempotencyKey: `${campaign.id}:${person.id}`,
              category: "newsletter",
              campaignTag,
            });

            // Inject per-recipient tracking (open pixel + click redirects)
            if (outboxRow?.tracking_id && html) {
              try {
                const trackedHtml = addTracking(html, {
                  trackingId: outboxRow.tracking_id,
                  baseUrl: backendBaseUrl,
                  campaignTag,
                });
                const { supabase } = await import("../supabase.js");
                await supabase
                  .from("email_outbox")
                  .update({ html_body: trackedHtml })
                  .eq("id", outboxRow.id);
              } catch (trackErr) {
                console.error("[campaignSender] Tracking injection failed for", person.email, trackErr.message);
              }
            }

            totalSent++;

            return { success: true, personId: person.id };
          } catch (error) {
            totalFailed++;
            errors.push({
              personId: person.id,
              email: person.email,
              error: error.message || "Unknown error",
            });
            return { success: false, personId: person.id, error };
          }
        })();

        batchPromises.push(sendPromise);
      }

      // Wait for batch to complete
      await Promise.all(batchPromises);

      // Update campaign stats after each batch
      await updateEmailCampaignStatus(campaignId, "sending", {
        totalSent,
        totalFailed,
      });

      // Add campaign to people's campaigns_received array
      const personIds = batch.map((p) => p.id);
      await addCampaignToPeople(personIds, campaignId);

      // Delay before next batch (except for last batch)
      if (i + batchSize < eligible.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    // 5. Update campaign status to "sent"
    await updateEmailCampaignStatus(campaignId, "sent", {
      totalSent,
      totalFailed,
      sentAt: new Date().toISOString(),
    });

    return {
      sent: totalSent,
      failed: totalFailed,
      total: people.length,
      errors: errors.slice(0, 10), // Return first 10 errors for logging
    };
  } catch (error) {
    console.error("Error sending campaign:", error);
    
    // Update campaign status to "failed"
    try {
      await updateEmailCampaignStatus(campaignId, "failed");
    } catch (updateError) {
      console.error("Error updating campaign status to failed:", updateError);
    }

    throw error;
  }
}

