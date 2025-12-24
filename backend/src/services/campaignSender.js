// backend/src/services/campaignSender.js
import { getEmailCampaign, updateEmailCampaignStatus } from "../data.js";
import { getPeopleWithFilters } from "../data.js";
import { findEventById } from "../data.js";
import { addCampaignToPeople } from "../data.js";
import { sendEmailWithTemplate } from "./emailService.js";

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
    }

    // 3. Get all recipients using filterCriteria
    // Note: We need userId, but campaign has it. We'll need to pass it or get it from campaign
    // For now, we'll need to get userId from campaign or pass it as parameter
    // Let's update getEmailCampaign to return userId, or pass it separately
    const { people, total } = await getPeopleWithFilters(
      campaign.userId,
      campaign.filterCriteria,
      "created_at",
      "desc",
      100000, // Large limit to get all recipients
      0
    );

    if (people.length === 0) {
      await updateEmailCampaignStatus(campaignId, "sent", {
        totalSent: 0,
        totalFailed: 0,
      });
      return { sent: 0, failed: 0, total: 0 };
    }

    // 4. Process in batches
    let totalSent = 0;
    let totalFailed = 0;
    const errors = [];

    for (let i = 0; i < people.length; i += batchSize) {
      const batch = people.slice(i, i + batchSize);
      const batchPromises = [];

      for (const person of batch) {
        const sendPromise = sendEmailWithTemplate({
          to: person.email,
          subject: campaign.subject,
          templateContent: campaign.templateContent,
          event,
          person,
        })
          .then(() => {
            totalSent++;
            return { success: true, personId: person.id };
          })
          .catch((error) => {
            totalFailed++;
            errors.push({
              personId: person.id,
              email: person.email,
              error: error.message || "Unknown error",
            });
            return { success: false, personId: person.id, error };
          });

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
      if (i + batchSize < people.length) {
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

