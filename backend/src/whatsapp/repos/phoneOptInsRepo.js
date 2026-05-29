// backend/src/whatsapp/repos/phoneOptInsRepo.js
//
// Per-(phone, channel, host) consent records. Append-only history: a new
// opt-in event is always a new row; opt-outs flip `opted_out_at` on the
// most-recent active row.

import { supabase } from "../../supabase.js";

const VALID_SOURCES = new Set([
  "rsvp_form",
  "self_service",
  "vip_invite",
  "host_signup",
  "admin_csv_import",
  "public_opt_in_page",
  "magic_link_verify",
]);

export async function recordOptIn({
  phoneE164,
  channel = "whatsapp",
  source,
  personId = null,
  profileId = null,
  hostProfileId = null,
  legalBasis = "consent",
  ipAddress = null,
  userAgent = null,
  gdprPayload = {},
}) {
  if (!phoneE164) throw new Error("[phoneOptInsRepo] phoneE164 required");
  if (!source) throw new Error("[phoneOptInsRepo] source required");
  if (!VALID_SOURCES.has(source)) {
    console.warn(
      `[phoneOptInsRepo] unfamiliar source '${source}' — recording anyway`,
    );
  }

  const { data, error } = await supabase
    .from("phone_opt_ins")
    .insert({
      phone_e164: phoneE164,
      channel,
      source,
      person_id: personId,
      profile_id: profileId,
      host_profile_id: hostProfileId,
      legal_basis: legalBasis,
      ip_address: ipAddress,
      user_agent: userAgent,
      gdpr_payload: gdprPayload || {},
    })
    .select()
    .single();
  if (error) {
    console.error("[phoneOptInsRepo] recordOptIn error", error);
    throw new Error(`Failed to insert phone_opt_ins: ${error.message}`);
  }
  return data;
}

/**
 * Is there an active opt-in for this phone + channel, optionally scoped
 * to a specific host? A NULL host_profile_id opt-in is treated as global
 * (covers any host).
 */
export async function hasActiveOptIn({
  phoneE164,
  channel = "whatsapp",
  hostProfileId = null,
}) {
  let query = supabase
    .from("phone_opt_ins")
    .select("id")
    .eq("phone_e164", phoneE164)
    .eq("channel", channel)
    .is("opted_out_at", null);

  if (hostProfileId) {
    query = query.or(`host_profile_id.eq.${hostProfileId},host_profile_id.is.null`);
  }

  const { data, error } = await query.limit(1);
  if (error) {
    console.error("[phoneOptInsRepo] hasActiveOptIn error", error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

export async function optOut({
  phoneE164,
  channel = "whatsapp",
  hostProfileId = null,
  reason = "user_request",
}) {
  let query = supabase
    .from("phone_opt_ins")
    .update({ opted_out_at: new Date().toISOString(), opted_out_reason: reason })
    .eq("phone_e164", phoneE164)
    .eq("channel", channel)
    .is("opted_out_at", null);

  if (hostProfileId) query = query.eq("host_profile_id", hostProfileId);
  else query = query.is("host_profile_id", null);

  const { error } = await query;
  if (error) {
    console.error("[phoneOptInsRepo] optOut error", error);
    throw new Error(`Failed to opt out: ${error.message}`);
  }
}
