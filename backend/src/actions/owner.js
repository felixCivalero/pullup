// Felix's own tools, for Felix's assistant only: how the site is doing, the
// sales pipeline, and who asked for a meeting.
import { z } from "zod";
import { defineAction } from "./registry.js";
import { ActionError } from "../lib/actionError.js";
import { supabase } from "../supabase.js";
import { siteStats } from "../routes/admin.js";
import { salesOverview } from "../routes/adminSales.js";
import { salesSheetConfigured } from "../lib/salesSheet.js";

export const siteStatsAction = defineAction({
  name: "site_stats",
  title: "Site statistics",
  description: "pullup.se's numbers for the last N days: views, CTA clicks and meeting requests per day, traffic sources, most read pages.",
  access: "owner",
  effect: "read",
  input: z.object({ days: z.number().int().min(1).max(365).default(30) }),
  run: async ({ days }) => {
    const { leads: _leads, ...stats } = await siteStats(days);
    return stats;
  },
});

export const salesPipeline = defineAction({
  name: "sales_pipeline",
  title: "Sales pipeline",
  description: "The sales sheet as Sälj shows it: the outreach goal and pace, today's queue, follow-ups due, booked meetings, pipeline counts.",
  access: "owner",
  effect: "read",
  untrustedOutput: true,
  input: z.object({ fresh: z.boolean().default(false).describe("Reread the sheet instead of the one-minute cache.") }),
  run: async ({ fresh }) => {
    if (!salesSheetConfigured()) throw new ActionError("failed", "The sales sheet isn't configured on this server.");
    const s = await salesOverview({ fresh });
    return {
      today: s.today, plan: s.plan && { ...s.plan, series: undefined }, totals: s.totals, stages: s.stages,
      queue: s.queue, followUps: s.followUps, meetings: s.meetings, toAnswer: s.toAnswer, sheetUrl: s.sheetUrl,
    };
  },
});

export const listMeetingRequests = defineAction({
  name: "list_meeting_requests",
  title: "Meeting requests",
  description: "The latest requests from the site's 'Jobba med mig' form (and from assistants), newest first.",
  access: "owner",
  effect: "read",
  untrustedOutput: true,
  input: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
  run: async ({ limit }) => {
    const { data, error } = await supabase
      .from("agency_requests")
      .select("id, created_at, name, email, company, description, preferred_time, source, prospect_id")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return { requests: data || [] };
  },
});

export default [siteStatsAction, salesPipeline, listMeetingRequests];
